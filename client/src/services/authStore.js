// Session lifecycle independent of React/native APIs, so account isolation is testable.
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const SESSION_KEY = 'tldr.google-session.v1';
const validUser = (user) => user && typeof user.id === 'string' && user.id.length > 0 &&
  typeof user.email === 'string' && user.email.includes('@');
const sessionError = () => new Error('Accedi di nuovo da Account per collegare Gmail.');

/** The SDK owns credentials; secure storage holds only the last consented profile. */
export const createAuthStore = ({ sdk, storage, now = Date.now }) => {
  let snapshot = { ready: false, user: null, busy: false, error: null, needsLogin: false };
  let generation = 0;
  let cached = null;
  let queue = Promise.resolve();
  let hydrating;
  const listeners = new Set();
  const publish = (patch) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  // Serialize native SDK operations: a refresh must finish before another account signs in.
  const serialize = (work) => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  const hydrate = () => {
    if (hydrating) return hydrating;
    hydrating = serialize(async () => {
      try {
        const raw = await storage.getItem(SESSION_KEY);
        const user = raw ? JSON.parse(raw) : null;
        if (user && !validUser(user)) throw sessionError();
        // No network or account picker on startup; this grants local reading only.
        publish({ ready: true, user, error: null });
      } catch {
        publish({ ready: true, error: 'Sessione locale non leggibile. Accedi nuovamente con Google.' });
      }
    });
    return hydrating;
  };
  const assertActive = (id, version) => {
    if (generation !== version || snapshot.user?.id !== id || snapshot.busy) throw sessionError();
  };
  const verifyToken = async (token, user) => {
    if (!token) throw sessionError();
    // Verify Gmail's actual mailbox before any messages enter this account's cache.
    const profile = await sdk.profile(token);
    if (profile.emailAddress?.toLowerCase() !== user.email.toLowerCase()) {
      throw Object.assign(new Error('L’account Gmail non corrisponde a quello selezionato. Accedi nuovamente.'), { code: 'SIGN_IN_REQUIRED' });
    }
    return token;
  };

  // A user gesture always opens Google's explicit chooser, including account switches.
  const signIn = () => {
    if (snapshot.busy || !snapshot.ready) return Promise.resolve(false);
    generation++;
    cached = null;
    publish({ busy: true, error: null });
    return serialize(async () => {
      try {
        await storage.removeItem(SESSION_KEY);
        publish({ user: null });
        await sdk.signOut();
        const result = await sdk.signIn();
        if (result.type !== 'success') return false;
        const nativeUser = result.data?.user;
        if (!validUser(nativeUser)) throw sessionError();
        const user = { id: nativeUser.id, email: nativeUser.email, name: nativeUser.name || '' };
        // Login alone does not authorize Gmail. Consent and a working Gmail token are required.
        const grant = await sdk.requestScopes([GMAIL_SCOPE]);
        const token = await verifyToken(grant.accessToken, user);
        await storage.setItem(SESSION_KEY, JSON.stringify(user));
        cached = { token, expiresAt: now() + 45 * 60000 };
        publish({ user, needsLogin: false });
        return true;
      } catch (error) {
        if (!snapshot.user) await sdk.signOut().catch(() => {});
        publish({ error: error.code === 'SIGN_IN_CANCELLED'
          ? 'Autorizzazione annullata. Consenti la lettura di Gmail per importare le newsletter.'
          : (error.message || 'Accesso non riuscito. Riprova.') });
        return false;
      } finally {
        publish({ busy: false });
      }
    });
  };
  const signOut = () => {
    if (snapshot.busy) return Promise.resolve(false);
    generation++;
    cached = null;
    publish({ busy: true, error: null });
    return serialize(async () => {
      try {
        // Delete the offline session first. Failed deletion remains visible and retryable.
        await storage.removeItem(SESSION_KEY);
        publish({ user: null, needsLogin: false });
        await sdk.signOut();
        return true;
      } catch {
        publish({ error: 'Uscita non completata. Riprova.' });
        return false;
      } finally {
        publish({ busy: false });
      }
    });
  };

  // Bind every import to both account ID and session generation. Old requests cannot
  // acquire the next account's token, even when the same person logs in again.
  const authorization = (accountId) => {
    const version = generation;
    const check = () => assertActive(accountId, version);
    const onAuthError = () => {
      if (generation !== version || snapshot.user?.id !== accountId) return;
      cached = null;
      publish({ needsLogin: true });
    };
    return {
      assertActive: check,
      onAuthError,
      getToken: (rejectedToken) => serialize(async () => {
        check();
        if (snapshot.needsLogin) throw sessionError();
        try {
          // Concurrent 401s for the same old token share one refresh through the queue.
          if (rejectedToken && cached?.token === rejectedToken) {
            cached = null;
            await sdk.clearToken(rejectedToken);
          }
          if (cached && cached.expiresAt > now()) return cached.token;
          const current = await sdk.currentUser();
          check();
          if (current?.user?.id !== accountId || !current.scopes?.includes(GMAIL_SCOPE)) {
            onAuthError();
            throw sessionError();
          }
          const tokens = await sdk.getTokens();
          check();
          const token = await verifyToken(tokens.accessToken, snapshot.user);
          check();
          cached = { token, expiresAt: now() + 45 * 60000 };
          return token;
        } catch (error) {
          if (error.code === 'SIGN_IN_REQUIRED' || error.code === 'SIGN_IN_CANCELLED' || error.status === 401 || error.status === 403) onAuthError();
          throw error;
        }
      }),
    };
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hydrate, signIn, signOut, authorization,
  };
};
