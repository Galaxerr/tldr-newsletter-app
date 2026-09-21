import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthStore, GMAIL_SCOPE } from '../src/services/authStore.js';
import { deferred, memoryStorage, NOW } from './helpers.mjs';

const user = { id: 'synthetic-account', email: 'reader@example.com', name: 'Synthetic Reader' };
const setup = (overrides = {}) => {
  const storage = memoryStorage();
  let clock = NOW;
  const calls = [];
  const sdk = {
    signOut: async () => { calls.push('signOut'); },
    signIn: async () => ({ type: 'success', data: { user } }),
    requestScopes: async (scopes) => {
      assert.deepEqual(scopes, [GMAIL_SCOPE]);
      return { accessToken: 'synthetic-initial' };
    },
    profile: async () => { calls.push('profile'); return { emailAddress: user.email }; },
    currentUser: async () => { calls.push('currentUser'); return { user, scopes: [GMAIL_SCOPE] }; },
    getTokens: async () => { calls.push('getTokens'); return { accessToken: 'synthetic-refreshed' }; },
    clearToken: async () => { calls.push('clearToken'); },
    ...overrides,
  };
  const store = createAuthStore({ sdk, storage, now: () => clock });
  return { store, storage, calls, advance: (ms) => { clock += ms; } };
};

test('offline startup restores only the profile without contacting the SDK', async () => {
  const fixture = setup();
  await fixture.storage.setItem('tldr.google-session.v1', JSON.stringify(user));
  await fixture.store.hydrate();
  assert.deepEqual(fixture.store.getSnapshot().user, user);
  assert.equal(fixture.store.getSnapshot().ready, true);
  assert.deepEqual(fixture.calls, []);
});

test('successful consent persists no access token and coalesces concurrent refreshes', async () => {
  const { store, storage, calls, advance } = setup();
  await store.hydrate();
  assert.equal(await store.signIn(), true);
  assert.deepEqual(JSON.parse(await storage.getItem('tldr.google-session.v1')), user);
  const session = store.authorization(user.id);
  assert.deepEqual(await Promise.all(Array.from({ length: 8 }, () => session.getToken())), Array(8).fill('synthetic-initial'));
  assert.equal(calls.filter((call) => call === 'profile').length, 1);
  advance(46 * 60000);
  assert.deepEqual(await Promise.all(Array.from({ length: 8 }, () => session.getToken())), Array(8).fill('synthetic-refreshed'));
  assert.equal(calls.filter((call) => call === 'getTokens').length, 1);
  assert.equal(calls.filter((call) => call === 'profile').length, 2);
});

test('a token for another mailbox cannot establish a session', async () => {
  const { store, storage } = setup({ profile: async () => ({ emailAddress: 'other@example.com' }) });
  await store.hydrate();
  assert.equal(await store.signIn(), false);
  assert.equal(store.getSnapshot().user, null);
  assert.equal(JSON.parse(await storage.getItem('tldr.google-session.v1')), null);
});

test('logout immediately invalidates an in-flight token refresh', async () => {
  const started = deferred();
  const released = deferred();
  const { store, storage, advance } = setup({
    getTokens: async () => { started.resolve(); await released.promise; return { accessToken: 'synthetic-late' }; },
  });
  await store.hydrate();
  await store.signIn();
  advance(46 * 60000);
  const session = store.authorization(user.id);
  const refresh = session.getToken();
  const rejected = assert.rejects(refresh, { code: 'SESSION' });
  await started.promise;
  const logout = store.signOut();
  assert.equal(session.signal.aborted, true);
  assert.throws(session.assertActive, { code: 'SESSION' });
  assert.equal(JSON.parse(await storage.getItem('tldr.google-session.v1')), null);
  released.resolve();
  await rejected;
  assert.equal(await logout, true);
  assert.equal(store.getSnapshot().user, null);
});

test('a native account change blocks refresh before acquiring a token', async () => {
  const { store, calls, advance } = setup({ currentUser: async () => ({ user: { ...user, id: 'other-account' }, scopes: [GMAIL_SCOPE] }) });
  await store.hydrate();
  await store.signIn();
  advance(46 * 60000);
  await assert.rejects(store.authorization(user.id).getToken(), { code: 'SESSION' });
  assert.equal(store.getSnapshot().needsLogin, true);
  assert.equal(calls.includes('getTokens'), false);
});

test('a failed durable logout keeps access locked', async () => {
  const { store, storage } = setup();
  await store.hydrate();
  await store.signIn();
  storage.setItem = async () => { throw new Error('Synthetic storage failure'); };
  storage.removeItem = storage.setItem;
  assert.equal(await store.signOut(), false);
  assert.equal(store.getSnapshot().user, null);
  assert.equal(store.getSnapshot().logoutPending, true);
});
