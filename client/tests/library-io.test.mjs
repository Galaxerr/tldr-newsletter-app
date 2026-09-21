import assert from 'node:assert/strict';
import test from 'node:test';
import { createEncryptedLibraryStorage } from '../src/services/encryptedLibraryStorage.js';
import { createLibraryStore } from '../src/services/libraryStore.js';
import { editionMetadata, emptyLibrary, RETENTION_MS } from '../src/services/library.js';
import { SecurityError } from '../src/services/securityErrors.js';
import { deferred, makeEdition, memoryStorage, NOW, testCrypto } from './helpers.mjs';

// Use the real repository and encrypted adapter so cache assertions also cover
// durable revision references, serialization and native-crypto call boundaries.
const fixture = async (t, editions = [], articleState = {}) => {
  const storage = memoryStorage();
  const keyStorage = memoryStorage();
  const crypto = testCrypto();
  const counts = { reads: 0, decrypts: 0 };
  const multiGet = storage.multiGet;
  storage.multiGet = async (keys) => { counts.reads += keys.length; return multiGet(keys); };
  const createSession = crypto.createSession;
  crypto.createSession = (key) => {
    const session = createSession(key);
    return { ...session, async decrypt(value, name) {
      if (name.includes('/edition/')) counts.decrypts++;
      return session.decrypt(value, name);
    } };
  };
  const dependencies = { storage, keyStorage, crypto };
  const accountId = 'synthetic-cache';
  const repository = createEncryptedLibraryStorage(dependencies, accountId);
  await repository.loadIndex();
  if (editions.length) await repository.commit({
    index: { ...emptyLibrary(), newsletters: editions.map(editionMetadata), articleState }, editions,
  });
  let importer = async () => ({ imported: 0 });
  const store = createLibraryStore({
    repository, importer: (options) => importer(options), now: () => NOW,
    getToken: async () => ({ getToken: async () => 'synthetic-access', assertActive() {} }),
  });
  t.after(() => store.dispose());
  await store.hydrate();
  assert.equal(store.getSnapshot().ready, true);
  return {
    store, repository, storage, counts, dependencies, accountId,
    setImporter: (work) => { importer = work; },
    importEditions(incoming) {
      importer = async ({ onPage }) => {
        await onPage(incoming, { imported: incoming.length });
        return { imported: incoming.length };
      };
      return store.sync();
    },
  };
};

test('imported bodies are cached after commit without another read or decrypt', async (t) => {
  const { store, repository, counts, importEditions } = await fixture(t);
  const incoming = makeEdition('imported');
  const expected = structuredClone(incoming);
  assert.equal(await importEditions([incoming]), true);
  incoming.articles[0].summary = 'Mutated caller input';
  const [body] = await store.readEditions(['imported']);
  assert.equal(body.articles[0].summary, expected.articles[0].summary);
  assert.deepEqual(counts, { reads: 0, decrypts: 0 });
  const metadata = store.getSnapshot().library.newsletters;
  assert.equal(body.bodyRef, metadata[0].bodyRef);
  assert.deepEqual(await repository.readEditions(metadata), [expected]);
});

test('an older in-flight read cannot overwrite a freshly committed cache revision', async (t) => {
  const old = makeEdition('revalidated', { parserVersion: 0 });
  const { store, repository, counts, importEditions } = await fixture(t, [old]);
  const started = deferred();
  const release = deferred();
  const readEditions = repository.readEditions;
  let first = true;
  repository.readEditions = async (metadata) => {
    const result = await readEditions(metadata);
    if (first) { first = false; started.resolve(); await release.promise; }
    return result;
  };
  const previousRead = store.readEditions([old.id]);
  await started.promise;
  const replacement = makeEdition(old.id);
  replacement.articles[0].summary = 'Revalidated body';
  assert.equal(await importEditions([replacement]), true);
  const [current] = await store.readEditions([old.id]);
  assert.equal(current.articles[0].summary, 'Revalidated body');
  release.resolve();
  const [previous] = await previousRead;
  assert.notEqual(previous.bodyRef, current.bodyRef);
  assert.equal(previous.articles[0].summary, old.articles[0].summary);
  assert.equal((await store.readEditions([old.id]))[0].bodyRef, current.bodyRef);
  assert.deepEqual(counts, { reads: 1, decrypts: 1 });
});

test('failed commits do not seed uncommitted bodies or replace the previous cache entry', async (t) => {
  const old = makeEdition('replacement');
  const { store, storage, counts, importEditions } = await fixture(t, [old]);
  const [previous] = await store.readEditions([old.id]);
  counts.reads = 0;
  counts.decrypts = 0;
  const setItem = storage.setItem;
  storage.setItem = async (name, value) => {
    if (name.endsWith('/index')) throw new Error('Synthetic index write failure');
    return setItem(name, value);
  };
  const replacement = makeEdition(old.id, { subject: 'New revision' });
  assert.equal(await importEditions([replacement]), false);
  assert.deepEqual((await store.readEditions([old.id]))[0], previous);
  assert.deepEqual(counts, { reads: 0, decrypts: 0 });
  storage.setItem = setItem;
  assert.equal(await importEditions([replacement]), true);
  const [next] = await store.readEditions([old.id]);
  assert.notEqual(next.bodyRef, previous.bodyRef);
  assert.equal(next.subject, 'New revision');
  assert.deepEqual(counts, { reads: 0, decrypts: 0 });
});

test('cache seeding keeps inactive limits, active bodies, reading pins and retention', async (t) => {
  const originals = [makeEdition('reading'), makeEdition('visible')];
  const { store, storage, counts, importEditions } = await fixture(t, originals);
  const unpin = store.pinEdition('reading');
  const release = store.retainBodies(['visible']);
  await store.readEditions(['reading', 'visible']);
  counts.reads = 0;
  counts.decrypts = 0;
  const incoming = Array.from({ length: 13 }, (_, i) => makeEdition(`new-${i}`));
  incoming.push(makeEdition('expired', { receivedAt: NOW - RETENTION_MS - 1 }));
  assert.equal(await importEditions(incoming), true);
  await store.readEditions(['reading', 'visible', ...incoming.slice(1, 13).map(({ id }) => id)]);
  assert.deepEqual(counts, { reads: 0, decrypts: 0 });
  await store.readEditions(['new-0']);
  assert.deepEqual(counts, { reads: 1, decrypts: 1 }, 'only twelve inactive bodies remain cached');
  await assert.rejects(store.readEditions(['expired']), { code: 'STORAGE' });
  assert.equal([...storage.data.keys()].some((name) => name.includes('/edition/expired/')), false);
  unpin();
  release();
  await store.cleanup();
});

test('disposal or deletion during commit prevents late cache publication', async (t) => {
  for (const action of ['dispose', 'clear']) {
    await t.test(action, async (t) => {
      const { store, repository, importEditions, dependencies, accountId } = await fixture(t);
      const committed = deferred();
      const release = deferred();
      const commit = repository.commit;
      repository.commit = async (changes) => {
        const result = await commit(changes);
        committed.resolve();
        await release.promise;
        return result;
      };
      const incoming = makeEdition('late');
      const syncing = importEditions([incoming]);
      await committed.promise;
      const ending = store[action]();
      const snapshot = store.getSnapshot();
      release.resolve();
      assert.equal(await syncing, false);
      await ending;
      if (action === 'dispose') {
        assert.equal(store.getSnapshot(), snapshot);
        await assert.rejects(store.readEditions([incoming.id]), { code: 'SESSION' });
      } else {
        assert.deepEqual(store.getSnapshot().library.newsletters, []);
        await assert.rejects(store.readEditions([incoming.id]), { code: 'STORAGE' });
      }
      const reopened = createEncryptedLibraryStorage(dependencies, accountId);
      t.after(() => reopened.dispose());
      const index = await reopened.loadIndex();
      assert.deepEqual(index.newsletters.map(({ id }) => id), action === 'dispose' ? ['late'] : []);
    });
  }
});

test('already-null verification skips only the revocation write and still retries imports', async (t) => {
  const edition = makeEdition('unverified', { verification: null });
  const flags = { [edition.articles[0].id]: { read: true, bookmarked: true } };
  const { store, storage, repository, setImporter } = await fixture(t, [edition], flags);
  const before = store.getSnapshot().library;
  const setItem = storage.setItem;
  let writes = 0;
  let imports = 0;
  storage.setItem = async (name, value) => {
    if (name.endsWith('/index')) writes++;
    return setItem(name, value);
  };
  setImporter(async ({ knownIds, revalidateIds }) => {
    imports++;
    assert.equal(knownIds.has(edition.id), false);
    assert.deepEqual(revalidateIds, [edition.id]);
    return { imported: 0 };
  });
  for (let attempt = 1; attempt <= 2; attempt++) {
    assert.equal(await store.sync(), true);
    assert.equal(writes, attempt, 'each sync still commits its completion timestamp');
    assert.equal(imports, attempt);
    const durable = await repository.loadIndex();
    assert.equal(durable.lastSyncedAt, NOW);
    assert.deepEqual(durable.newsletters, before.newsletters);
    assert.deepEqual(durable.articleState, flags);
  }
});

test('mixed stale records lose trust durably before import; retry does not revoke it twice', async (t) => {
  const stale = makeEdition('saved-stale', { parserVersion: 0, receivedAt: NOW - RETENTION_MS - 1 });
  const unverified = makeEdition('already-null', { verification: null });
  const current = makeEdition('current');
  const flags = { [stale.articles[0].id]: { bookmarked: true, read: true } };
  const { store, storage, repository, setImporter } = await fixture(t, [stale, unverified, current], flags);
  const before = store.getSnapshot().library;
  await store.readEditions([stale.id, unverified.id, current.id]);
  const setItem = storage.setItem;
  let writes = 0;
  storage.setItem = async (name, value) => {
    if (name.endsWith('/index')) writes++;
    return setItem(name, value);
  };
  let attempt = 0;
  setImporter(async ({ knownIds, revalidateIds }) => {
    attempt++;
    assert.deepEqual([...knownIds], [current.id]);
    assert.deepEqual(new Set(revalidateIds), new Set([stale.id, unverified.id]));
    assert.equal(writes, attempt === 1 ? 1 : 0);
    const durable = await repository.loadIndex();
    for (const edition of durable.newsletters) {
      const previous = before.newsletters.find(({ id }) => id === edition.id);
      assert.equal(edition.bodyRef, previous.bodyRef);
      assert.deepEqual(edition.verification, edition.id === current.id ? current.verification : null);
    }
    assert.deepEqual(durable.articleState, flags);
    const [cached] = await store.readEditions([stale.id]);
    assert.equal(cached.verification, null, 'cached bodies must not restore revoked trust');
    if (attempt === 1) throw new SecurityError('NETWORK');
    return { imported: 0 };
  });
  assert.equal(await store.sync(), false);
  assert.equal(writes, 1);
  assert.equal(store.getSnapshot().library.lastSyncedAt, null);
  writes = 0;
  assert.equal(await store.sync(), true);
  assert.equal(writes, 1);
  assert.equal(store.getSnapshot().library.lastSyncedAt, NOW);
});

test('a failed trust-revocation write still prevents the importer from starting', async (t) => {
  const stale = makeEdition('stale', { parserVersion: 0 });
  const { store, storage, setImporter } = await fixture(t, [stale]);
  const before = store.getSnapshot().library;
  const setItem = storage.setItem;
  storage.setItem = async (name, value) => {
    if (name.endsWith('/index')) throw new Error('Synthetic revocation failure');
    return setItem(name, value);
  };
  let imports = 0;
  setImporter(async () => { imports++; return { imported: 0 }; });
  assert.equal(await store.sync(), false);
  assert.equal(imports, 0);
  assert.equal(store.getSnapshot().library, before);
});

test('unchanged verification does not suppress pending cleanup retries', async (t) => {
  const edition = makeEdition('unverified-cleanup', { verification: null });
  const { dependencies, accountId, storage } = await fixture(t, [edition]);
  const orphan = `@tldr/accounts/${accountId}/library-v2/edition/orphan/revision`;
  storage.data.set(orphan, 'synthetic orphan');
  const multiRemove = storage.multiRemove;
  let removals = 0;
  storage.multiRemove = async () => { removals++; throw new Error('Synthetic cleanup failure'); };
  const repository = createEncryptedLibraryStorage(dependencies, accountId);
  const store = createLibraryStore({
    repository, now: () => NOW,
    getToken: async () => ({ getToken: async () => 'synthetic-access', assertActive() {} }),
    importer: async () => ({ imported: 0 }),
  });
  t.after(() => store.dispose());
  await store.hydrate();
  assert.deepEqual(store.getSnapshot().library.pendingCleanup, [orphan]);
  removals = 0;
  assert.equal(await store.sync(), true);
  assert.equal(removals, 3, 'startup, revocation and completion mutations keep retrying pending cleanup');
  assert.deepEqual(store.getSnapshot().library.pendingCleanup, [orphan]);
  storage.multiRemove = multiRemove;
  await store.cleanup();
  assert.deepEqual(store.getSnapshot().library.pendingCleanup, []);
  assert.equal(storage.data.has(orphan), false);
});
