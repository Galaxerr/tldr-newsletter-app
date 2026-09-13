import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { importNewsletters } from '../services/gmail';
import { buildArticleFeed } from '../services/library';
import { createLibraryStorage } from '../services/libraryStorage';
import { createLibraryStore } from '../services/libraryStore';
import { useToast } from './ToastContext';

// React adapter: connect the independent store to device APIs and screen components.
const LibraryContext = createContext(null);

/** Own one library store for this mounted app, plus temporary UI/network state. */
export function LibraryProvider({ children }) {
  const { user, authorization } = useAuth();
  // Create the store once; recreating it on renders would lose subscriptions/queues.
  const storeRef = useRef(null);
  if (!storeRef.current) {
    const session = authorization(user.id);
    storeRef.current = createLibraryStore({
      repository: createLibraryStorage(AsyncStorage, user.id),
      importer: importNewsletters,
      // A session-bound credential source refreshes tokens without changing accounts.
      getToken: async () => session,
      assertActive: session.assertActive,
    });
  }
  const store = storeRef.current;
  // Subscribe React to immutable snapshots published after store operations.
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [isOnline, setOnline] = useState(false);
  // Keep the reader selection outside lists, which can unmount when filters change.
  const [selectedArticle, setSelectedArticle] = useState(null);
  const lastAttempt = useRef(0);
  const { show } = useToast();

  // Restore disk data independently of authentication and network availability.
  useEffect(() => { store.hydrate(); }, [store]);
  // NetInfo owns connection detection; the effect returns its unsubscribe callback.
  useEffect(() => NetInfo.addEventListener((state) => {
    setOnline(state.isConnected === true && state.isInternetReachable !== false);
  }), []);

  // Refresh on startup/reconnection/foreground, not on every render. Limit attempts
  // to once a minute and avoid refreshing data synced within the last five minutes.
  useEffect(() => {
    const maybeSync = () => {
      const latest = store.getSnapshot();
      if (!latest.ready || !isOnline || Date.now() - lastAttempt.current < 60000) return;
      if (latest.library.lastSyncedAt && Date.now() - latest.library.lastSyncedAt < 5 * 60000) return;
      lastAttempt.current = Date.now();
      store.sync();
    };
    maybeSync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') maybeSync();
    });
    return () => subscription.remove();
  }, [store, snapshot.ready, isOnline]);

  // Derive the unified feed only when editions change, not after every flag toggle.
  const articles = useMemo(() => buildArticleFeed(snapshot.library.newsletters), [snapshot.library.newsletters]);
  // Manual sync ignores the automatic freshness interval but still requires connectivity.
  const sync = (mode = 'refresh') => {
    if (!isOnline) {
      show('Sei offline. Puoi leggere e cercare nei sommari già salvati.');
      return Promise.resolve(false);
    }
    lastAttempt.current = Date.now();
    return store.sync(mode);
  };
  // Keep storage errors user-visible; the store leaves failed changes unapplied.
  const toggleArticle = async (id, field) => {
    try {
      await store.toggleArticle(id, field);
    } catch {
      show('Salvataggio non riuscito. Riprova: la modifica non è stata applicata.', 'error');
    }
  };

  // Expose library data, sync status and actions through one shared hook.
  return (
    <LibraryContext.Provider value={{
      ...snapshot, ...snapshot.library, articles, isOnline, sync,
      retryHydration: store.hydrate, toggleArticle,
      selectedArticle, openArticle: setSelectedArticle, closeArticle: () => setSelectedArticle(null),
    }}>
      {children}
    </LibraryContext.Provider>
  );
}

/** Read the shared library and actions; fail clearly if the provider is missing. */
export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary richiede LibraryProvider');
  return context;
}
