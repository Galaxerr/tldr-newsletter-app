import { SecurityError, safeMessage } from './securityErrors.js';

// The session lifecycle is intentionally independent from React and native APIs so
// account isolation, retries and sign-in state can be tested without UI wiring.
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const SESSION_KEY = 'tldr.google-session.v1';

const validUser = (user) =>
  user &&
  typeof user.id === 'string' &&
  user.id.length > 0 &&
  user.id.length <= 256 &&
  typeof user.email === 'string' &&
  user.email.includes('@');

const sessionError = () => new SecurityError('SESSION');

/**
 * The SDK owns the live OAuth credentials. The durable storage only keeps the
 * last consented profile so the app can restore a local session without storing
 * the token itself.
 */
export const createAuthStore = ({ sdk, storage, now = Date.now }) => {
  let snapshot = {
    ready: false,
    user: null,
    busy: false,
    error: null,
    needsLogin: false,
    logoutPending: false,
  };

  // Session generation acts as a guard for stale async work. Any new sign-in or
  // sign-out invalidates previous requests so old tokens cannot be used later.
  let generation = 0;
  let controller = new AbortController();

  const invalidate = () => {
    generation += 1;
    controller.abort();
    controller = new AbortController();
  };

  // A tombstone remains durable even if the cleanup path fails afterwards; that
  // prevents a stale session from being rehydrated from old state.
  const closeStoredSession = async () => {
    try {
      await storage.setItem(SESSION_KEY, 'null');
    } catch {
      await storage.removeItem(SESSION_KEY);
    }
  };

  let cached = null;
  let queue = Promise.resolve();
  let hydrating;
  const listeners = new Set();

  const publish = (patch) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };

  // Native SDK operations are serialized so one refresh or sign-in flow cannot
  // overlap with another account change. This keeps token handoff deterministic.
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

        if (user && !validUser(user)) {
          throw sessionError();
        }

        // Startup never opens a Google account picker. It only restores locally
        // stored identity state and leaves the user in a read-only local session.
        publish({ ready: true, user, error: null });
      } catch {
        publish({
          ready: true,
          error: 'Unable to read the local session. Sign in again with Google.',
        });
      }
    });

    return hydrating;
  };

  const assertActive = (id, version) => {
    if (generation !== version || snapshot.user?.id !== id || snapshot.busy) {
      throw sessionError();
    }
  };

  const verifyToken = async (token, user) => {
    if (!token) {
      throw sessionError();
    }

    // Confirm the token belongs to the same Google mailbox before using it to
    // fetch Gmail content or populate the app cache.
    const profile = await sdk.profile(token, controller.signal);

    if (profile.emailAddress?.toLowerCase() !== user.email.toLowerCase()) {
      throw new SecurityError('SIGN_IN_REQUIRED');
    }

    return token;
  };

  // Every user-driven sign-in flow must trigger an explicit Google consent flow,
  // including when the user switches between accounts.
  const signIn = () => {
    if (snapshot.busy || !snapshot.ready) {
      return Promise.resolve(false);
    }

    invalidate();
    cached = null;
    publish({ busy: true, user: null, error: null });

    return serialize(async () => {
      try {
        await closeStoredSession();
        publish({ user: null });
        await sdk.signOut();

        const result = await sdk.signIn();
        if (result.type !== 'success') {
          return false;
        }

        const nativeUser = result.data?.user;
        if (!validUser(nativeUser)) {
          throw sessionError();
        }

        const user = {
          id: nativeUser.id,
          email: nativeUser.email,
          name: nativeUser.name || '',
        };

        // Sign in alone is not enough: the app must explicitly obtain the Gmail
        // read scope and verify the resulting token matches the chosen account.
        const grant = await sdk.requestScopes([GMAIL_SCOPE]);
        const token = await verifyToken(grant.accessToken, user);

        await storage.setItem(SESSION_KEY, JSON.stringify(user));
        cached = { token, expiresAt: now() + 45 * 60000 };

        publish({ user, needsLogin: false, logoutPending: false });
        return true;
      } catch (error) {
        if (!snapshot.user) {
          await sdk.signOut().catch(() => {});
        }

        publish({
          error:
            error.code === 'SIGN_IN_CANCELLED'
              ? 'Authorization canceled. Allow Gmail read access to import newsletters.'
              : safeMessage(error, 'AUTH'),
        });
        return false;
      } finally {
        publish({ busy: false });
      }
    });
  };

  const signOut = () => {
    if (snapshot.busy) {
      return Promise.resolve(false);
    }

    invalidate();
    cached = null;
    publish({ busy: true, user: null, error: null });

    // Persist the logout marker immediately so even a stalled token refresh cannot
    // leave the app in a confusing authenticated state. The native SDK sign-out
    // still runs through the serialized queue.
    const durable = closeStoredSession().then(() => true, () => false);

    return serialize(async () => {
      try {
        if (!await durable) {
          throw new SecurityError('STORAGE');
        }

        publish({ user: null, needsLogin: false, logoutPending: false });
        await sdk.signOut();
        return true;
      } catch {
        // Keep the UI locked if the local store is unavailable so the user cannot
        // continue in a half-logged-in state.
        await sdk.signOut().catch(() => {});
        publish({
          user: null,
          logoutPending: true,
          error: safeMessage(new SecurityError('LOGOUT_PENDING')),
        });
        return false;
      } finally {
        publish({ busy: false });
      }
    });
  };

  // Every Gmail import is tied to both the account ID and the current session
  // generation. That prevents stale requests from acquiring the next account’s
  // token after a sign-in or sign-out has already invalidated that session.
  const authorization = (accountId) => {
    const version = generation;
    const check = () => assertActive(accountId, version);

    const onAuthError = () => {
      if (generation !== version || snapshot.user?.id !== accountId) {
        return;
      }

      cached = null;
      publish({ needsLogin: true });
    };

    return {
      signal: controller.signal,
      assertActive: check,
      onAuthError,
      getToken: (rejectedToken) =>
        serialize(async () => {
          check();

          if (snapshot.needsLogin) {
            throw sessionError();
          }

          try {
            // Repeated 401 errors for the same rejected token are coalesced through
            // this queue to avoid racing refreshes against each other.
            if (rejectedToken && cached?.token === rejectedToken) {
              cached = null;
              await sdk.clearToken(rejectedToken);
            }

            if (cached && cached.expiresAt > now()) {
              return cached.token;
            }

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
            if (
              error.code === 'SIGN_IN_REQUIRED' ||
              error.code === 'SIGN_IN_CANCELLED' ||
              error.status === 401 ||
              error.status === 403
            ) {
              onAuthError();
            }
            throw error;
          }
        }),
    };
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrate,
    signIn,
    signOut,
    authorization,
  };
};
