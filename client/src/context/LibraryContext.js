import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { importNewsletters } from '../services/gmail';
import { editionTime, latestEditions, RETENTION_MS } from '../services/library';
import { isVerifiedEdition } from '../services/messageTrust';
import { safeMessage } from '../services/securityErrors';
import { createEncryptedLibraryStorage } from '../services/encryptedLibraryStorage';
import { libraryCrypto, libraryKeyStorage } from '../services/libraryCrypto';
import { createLibraryStore } from '../services/libraryStore';
import { useToast } from './ToastContext';

const LibraryContext = createContext(null);
export function LibraryProvider({ children }) {
  const { user, authorization, signOut } = useAuth();
  const storeRef = useRef(null);
  if (!storeRef.current) {
    const session = authorization(user.id);
    storeRef.current = createLibraryStore({
      repository: createEncryptedLibraryStorage({ storage: AsyncStorage, keyStorage: libraryKeyStorage,
        crypto: libraryCrypto, assertActive: session.assertActive }, user.id),
      importer: importNewsletters, getToken: async () => session, assertActive: session.assertActive,
    });
  }
  const store = storeRef.current;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [isOnline, setOnline] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const readerRelease = useRef(null);
  const lastAttempt = useRef(0);
  const { show } = useToast();

  useEffect(() => {
    store.hydrate();
    return () => store.dispose();
  }, [store]);
  // This single subscription also supplies the network banner.
  useEffect(() => NetInfo.addEventListener((state) => {
    setOnline(state.isConnected === true && state.isInternetReachable !== false);
  }), []);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      setAppState(state);
      if (state === 'active') store.cleanup();
    });
    return () => listener.remove();
  }, [store]);

  useEffect(() => {
    if (appState !== 'active' || !snapshot.ready || !isOnline) return;
    const latest = store.getSnapshot();
    if (Date.now() - lastAttempt.current < 60000 ||
      (latest.library.lastSyncedAt && Date.now() - latest.library.lastSyncedAt < 5 * 60000)) return;
    lastAttempt.current = Date.now();
    store.sync();
  }, [store, snapshot.ready, isOnline, appState]);

  // Expire editions while the app stays open too. Add 1 ms because the boundary is inclusive.
  useEffect(() => {
    if (!snapshot.ready || appState !== 'active') return;
    const now = Date.now();
    const expirations = snapshot.library.newsletters.map((edition) => editionTime(edition) + RETENTION_MS + 1)
      .filter((expiry) => expiry > now);
    if (!expirations.length) return;
    const timer = setTimeout(() => store.cleanup(), Math.min(...expirations) - now);
    return () => clearTimeout(timer);
  }, [store, snapshot.library.newsletters, snapshot.clock, snapshot.ready, appState]);

  const sync = useCallback(() => {
    // Offline refresh still applies local retention without trying Gmail.
    if (!isOnline) {
      store.cleanup();
      show('You are offline. You can read and search saved summaries.');
      return Promise.resolve(false);
    }
    lastAttempt.current = Date.now();
    return store.sync();
  }, [store, isOnline, show]);
  const toggleArticle = useCallback(async (id, field) => {
    try { await store.toggleArticle(id, field); }
    catch { show('Could not save. Try again: the change was not applied.', 'error'); }
  }, [store, show]);
  const closeArticle = useCallback(() => {
    setSelectedArticle(null);
    readerRelease.current?.();
    readerRelease.current = null;
  }, []);
  const openArticle = useCallback((article) => {
    // Acquire the new pin first so switching readers never briefly unprotects the edition.
    const release = store.pinEdition(article.newsletterId);
    readerRelease.current?.();
    readerRelease.current = release;
    setSelectedArticle(article);
  }, [store]);
  const clearLocalData = useCallback(async () => {
    closeArticle();
    try { await store.clear(); await signOut(); }
    catch { show('Deletion incomplete. Try again. (DATA-02)', 'error'); }
  }, [closeArticle, store, signOut, show]);
  const newsletters = snapshot.library.newsletters;
  const latest = useMemo(() => latestEditions(newsletters, snapshot.clock), [newsletters, snapshot.clock]);
  // Only metadata is needed to revoke trust in a currently open reader after revalidation fails.
  const selectedMetadata = selectedArticle && newsletters.find((edition) => edition.id === selectedArticle.newsletterId);
  const currentSelection = selectedArticle ? { ...selectedArticle,
    sourceVerified: selectedArticle.sourceVerified && !!selectedMetadata && isVerifiedEdition(selectedMetadata) &&
      !selectedMetadata.unverifiedArticleIds?.includes(selectedArticle.id),
  } : null;
  return (
    <LibraryContext.Provider value={{
      ...snapshot, ...snapshot.library, latest, store, isOnline, sync, toggleArticle, clearLocalData,
      retryHydration: store.hydrate, selectedArticle: currentSelection, openArticle, closeArticle,
    }}>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary requires LibraryProvider');
  return context;
}

/** Screen-owned bodies: metadata stays global, while bodies and search projections
 * are released on blur. A changed revision reloads content; flag changes do not.
 */
export function useEditions(ids, { pin = false } = {}) {
  const { store, newsletters } = useLibrary();
  const focused = useIsFocused();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, editions: [], error: null });
  const key = JSON.stringify(ids.map((id) => {
    const meta = newsletters.find((edition) => edition.id === id);
    return [id, meta?.bodyRef, meta?.verification];
  }));
  useEffect(() => {
    if (!focused) { setResult({ key: null, editions: [], error: null }); return; }
    let active = true;
    const requested = JSON.parse(key).map(([id]) => id);
    const release = store.retainBodies(requested);
    const unpin = pin ? requested.map(store.pinEdition) : [];
    setResult({ key: null, editions: [], error: null });
    store.readEditions(requested).then(
      (editions) => { if (active) setResult({ key, editions, error: null }); },
      (error) => { if (active) setResult({ key, editions: [], error: safeMessage(error, 'STORAGE') }); }
    );
    return () => { active = false; release(); unpin.forEach((done) => done()); };
  }, [store, key, focused, pin, attempt]);
  const current = focused && result.key === key;
  return {
    editions: current ? result.editions : [],
    loading: focused && !current,
    error: current ? result.error : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
