import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryStorage } from '../src/services/libraryStorage.js';
import { createEncryptedLibraryStorage } from '../src/services/encryptedLibraryStorage.js';
import { emptyLibrary, editionMetadata } from '../src/services/library.js';
import { NOW, deferred, makeEdition, memoryStorage, testCrypto } from './helpers.mjs';

const PREFIX = '@synthetic/library/';
const accountRoot = (id) => `@tldr/accounts/${encodeURIComponent(id)}/`;
const accountKey = (id) => 'tldr.library-key.' + Buffer.from(id).toString('hex');
const changesFor = (edition, index = emptyLibrary()) => ({
  index: { ...index, newsletters: [editionMetadata(edition)] },
  editions: [edition],
});
const repositoryFor = (storage) => {
  let revision = 0;
  return createLibraryStorage(storage, PREFIX, { revision: () => String(++revision) });
};

test('a failed replacement preserves the committed index and body; reopening removes orphan revisions', async (t) => {
  for (const failure of ['body', 'index']) {
    await t.test(failure, async () => {
      const storage = memoryStorage();
      const repository = repositoryFor(storage);
      await repository.loadIndex();
      const original = makeEdition('atomic');
      const index = await repository.commit(changesFor(original));
      const oldIndex = storage.data.get(PREFIX + 'index');
      const oldBody = storage.data.get(index.newsletters[0].bodyRef);
      const writes = [];
      const multiSet = storage.multiSet.bind(storage);
      const setItem = storage.setItem.bind(storage);
      storage.multiSet = async (entries) => {
        writes.push('body');
        if (failure === 'body') throw new Error('Synthetic body write failure');
        return multiSet(entries);
      };
      storage.setItem = async (name, value) => {
        writes.push('index');
        if (failure === 'index') throw new Error('Synthetic index write failure');
        return setItem(name, value);
      };

      await assert.rejects(repository.commit(changesFor({ ...original, subject: 'Replacement' }, index)),
        /Synthetic .* write failure/);
      assert.deepEqual(writes, failure === 'body' ? ['body'] : ['body', 'index']);
      assert.equal(storage.data.get(PREFIX + 'index'), oldIndex);
      assert.equal(storage.data.get(index.newsletters[0].bodyRef), oldBody);

      const reopened = repositoryFor(storage);
      const restored = await reopened.loadIndex();
      assert.deepEqual(await reopened.readEditions(restored.newsletters), [original]);
      assert.deepEqual([...storage.data.keys()].sort(), [PREFIX + 'index', index.newsletters[0].bodyRef].sort());
    });
  }
});

test('cleanup failure does not roll back a committed replacement and is retried on reopen', async () => {
  const storage = memoryStorage();
  const repository = repositoryFor(storage);
  await repository.loadIndex();
  const original = makeEdition('cleanup');
  const first = await repository.commit(changesFor(original));
  const oldRef = first.newsletters[0].bodyRef;
  const multiRemove = storage.multiRemove.bind(storage);
  let failCleanup = true;
  storage.multiRemove = async (keys) => {
    if (failCleanup) throw new Error('Synthetic cleanup failure');
    return multiRemove(keys);
  };
  const replacement = { ...original, subject: 'Committed replacement' };
  const articleState = { [original.articles[0].url]: { bookmarked: true, read: true } };
  const next = await repository.commit(changesFor(replacement, { ...first, articleState }));
  assert.deepEqual(next.pendingCleanup, [oldRef]);
  assert.equal(storage.data.has(oldRef), true);
  assert.notEqual(next.newsletters[0].bodyRef, oldRef);
  assert.deepEqual(JSON.parse(storage.data.get(PREFIX + 'index')).articleState, articleState);

  failCleanup = false;
  const reopened = repositoryFor(storage);
  const restored = await reopened.loadIndex();
  assert.deepEqual(restored.pendingCleanup, []);
  assert.deepEqual(restored.articleState, articleState);
  assert.equal(storage.data.has(oldRef), false);
  assert.deepEqual(await reopened.readEditions(restored.newsletters), [replacement]);
});

test('invalid indexes never authorize deletion of existing edition records', async (t) => {
  for (const corruption of ['invalid-json', 'wrong-version', 'foreign-body-reference']) {
    await t.test(corruption, async () => {
      const storage = memoryStorage();
      const repository = repositoryFor(storage);
      await repository.loadIndex();
      const index = await repository.commit(changesFor(makeEdition('corruption')));
      const orphan = PREFIX + 'edition/orphan/revision';
      storage.data.set(orphan, 'Synthetic recoverable orphan');
      const damaged = structuredClone(index);
      if (corruption === 'wrong-version') damaged.version = 100;
      if (corruption === 'foreign-body-reference') damaged.newsletters[0].bodyRef = '@another-account/edition/id/revision';
      storage.data.set(PREFIX + 'index', corruption === 'invalid-json' ? '{broken' : JSON.stringify(damaged));
      const before = new Map(storage.data);
      let removed = false;
      storage.multiRemove = async () => { removed = true; };

      await assert.rejects(repositoryFor(storage).loadIndex(), { code: 'STORAGE' });
      assert.equal(removed, false);
      assert.deepEqual(storage.data, before);
    });
  }
});

test('encrypted account libraries remain isolated when one account is cleared', async () => {
  const storage = memoryStorage();
  const keyStorage = memoryStorage();
  const crypto = testCrypto();
  const dependencies = { storage, keyStorage, crypto };
  const alice = createEncryptedLibraryStorage(dependencies, 'synthetic-alice');
  const bob = createEncryptedLibraryStorage(dependencies, 'synthetic-bob');
  const aliceEdition = makeEdition('alice-private-edition');
  const bobEdition = makeEdition('bob-private-edition');
  await alice.loadIndex();
  await bob.loadIndex();
  const aliceIndex = await alice.commit(changesFor(aliceEdition));
  const bobIndex = await bob.commit(changesFor(bobEdition));
  assert.deepEqual(await alice.readEditions(aliceIndex.newsletters), [aliceEdition]);
  assert.deepEqual(await bob.readEditions(bobIndex.newsletters), [bobEdition]);
  for (const raw of storage.data.values()) {
    assert.equal(raw.includes('alice-private-edition'), false);
    assert.equal(raw.includes('bob-private-edition'), false);
  }
  const staleAlice = createEncryptedLibraryStorage(dependencies, 'synthetic-alice');
  await staleAlice.loadIndex();
  const bobRecords = new Map([...storage.data].filter(([name]) => name.startsWith(accountRoot('synthetic-bob'))));
  const bobKey = keyStorage.data.get(accountKey('synthetic-bob'));

  await alice.clear();
  assert.equal([...storage.data.keys()].some((name) => name.startsWith(accountRoot('synthetic-alice'))), false);
  assert.equal(keyStorage.data.has(accountKey('synthetic-alice')), false);
  assert.deepEqual(storage.data, bobRecords);
  assert.equal(keyStorage.data.get(accountKey('synthetic-bob')), bobKey);
  await assert.rejects(staleAlice.commit(changesFor(aliceEdition, aliceIndex)), { code: 'STORAGE' });
  const reopenedBob = createEncryptedLibraryStorage(dependencies, 'synthetic-bob');
  const restored = await reopenedBob.loadIndex();
  assert.deepEqual(await reopenedBob.readEditions(restored.newsletters), [bobEdition]);
});

const legacyFixture = async (encrypted) => {
  const accountId = 'synthetic-migration';
  const storage = memoryStorage();
  const keyStorage = memoryStorage();
  const crypto = testCrypto();
  const prefix = accountRoot(accountId) + (encrypted ? 'library-v2/' : 'library-v1/');
  const targetPrefix = accountRoot(accountId) + 'library-v2/';
  // Retired optional fields in old records must not change migration behavior.
  const edition = makeEdition('legacy', {
    verification: { version: 1, status: 'verified', sender: 'fixture@tldrnewsletter.com' },
  });
  Object.assign(edition.articles[0], { readingTime: '3 min read', contentType: 'article' });
  const articleState = { [edition.articles[0].url]: { bookmarked: true, read: true } };
  const legacyIndex = JSON.stringify({ version: 1, ids: [edition.id], articleState, lastSyncedAt: NOW });
  const bodyKey = prefix + 'edition/' + edition.id;
  let session;
  const seal = async (name, value) => JSON.stringify({ version: 2, sealed: await session.encrypt(value, name) });
  if (encrypted) {
    const key = await crypto.generateKey();
    keyStorage.data.set(accountKey(accountId), key);
    session = crypto.createSession(key);
    storage.data.set(prefix + 'index', await seal(prefix + 'index', legacyIndex));
    storage.data.set(bodyKey, await seal(bodyKey, JSON.stringify(edition)));
  } else {
    storage.data.set(prefix + 'index', legacyIndex);
    storage.data.set(bodyKey, JSON.stringify(edition));
  }
  return { accountId, storage, keyStorage, crypto, prefix, targetPrefix, edition, articleState, legacyIndex, bodyKey };
};

test('plaintext and encrypted legacy migration preserve local flags and only trust encrypted provenance', async (t) => {
  for (const encrypted of [false, true]) {
    await t.test(encrypted ? 'encrypted' : 'plaintext', async () => {
      const fixture = await legacyFixture(encrypted);
      const { storage, keyStorage, crypto, accountId, targetPrefix, edition, bodyKey, articleState } = fixture;
      const repository = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
      const index = await repository.loadIndex();
      assert.equal(index.version, 3);
      assert.equal(index.lastSyncedAt, NOW);
      assert.deepEqual(index.articleState, articleState);
      const expected = encrypted ? edition : { ...edition, verification: null };
      assert.deepEqual(await repository.readEditions(index.newsletters), [expected]);
      assert.equal(storage.data.has(bodyKey), false);
      assert.equal(storage.data.has(targetPrefix + 'migration'), false);
      assert.equal([...storage.data.keys()].some((name) => name.includes('/library-v1/')), false);

      const reopened = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
      const restored = await reopened.loadIndex();
      assert.deepEqual(restored.articleState, articleState);
      assert.deepEqual(await reopened.readEditions(restored.newsletters), [expected]);
    });
  }
});

test('failed migration read-back retains the source and marker until a successful reopen', async (t) => {
  for (const encrypted of [false, true]) {
    await t.test(encrypted ? 'encrypted' : 'plaintext', async () => {
      const fixture = await legacyFixture(encrypted);
      const { storage, keyStorage, crypto, accountId, prefix, targetPrefix, bodyKey, articleState, edition } = fixture;
      const sourceBody = storage.data.get(bodyKey);
      const sourceIndex = storage.data.get(prefix + 'index');
      const multiGet = storage.multiGet.bind(storage);
      storage.multiGet = async (names) => {
        if (names.some((name) => name.startsWith(targetPrefix + 'edition/legacy/'))) {
          throw new Error('Synthetic migration read-back failure');
        }
        return multiGet(names);
      };
      const repository = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
      await assert.rejects(repository.loadIndex(), /Synthetic migration read-back failure/);
      assert.equal(storage.data.get(bodyKey), sourceBody);
      if (!encrypted) assert.equal(storage.data.get(prefix + 'index'), sourceIndex);
      const markerKey = targetPrefix + 'migration';
      assert.equal(storage.data.has(markerKey), true);

      storage.multiGet = multiGet;
      const reopened = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
      const restored = await reopened.loadIndex();
      assert.deepEqual(restored.articleState, articleState);
      assert.equal(storage.data.has(bodyKey), false);
      assert.equal(storage.data.has(markerKey), false);
      assert.deepEqual(await reopened.readEditions(restored.newsletters), [encrypted ? edition : { ...edition, verification: null }]);
    });
  }
});

test('missing encryption keys or corrupt encrypted indexes fail closed without deleting recoverable data', async (t) => {
  for (const corruption of ['missing-key', 'invalid-envelope', 'invalid-index']) {
    await t.test(corruption, async () => {
      const accountId = 'synthetic-corruption';
      const storage = memoryStorage();
      const keyStorage = memoryStorage();
      const crypto = testCrypto();
      const dependencies = { storage, keyStorage, crypto };
      const repository = createEncryptedLibraryStorage(dependencies, accountId);
      await repository.loadIndex();
      await repository.commit(changesFor(makeEdition('recoverable')));
      const indexKey = accountRoot(accountId) + 'library-v2/index';
      if (corruption === 'missing-key') keyStorage.data.delete(accountKey(accountId));
      if (corruption === 'invalid-envelope') storage.data.set(indexKey, '{broken');
      if (corruption === 'invalid-index') {
        const session = crypto.createSession(keyStorage.data.get(accountKey(accountId)));
        const damaged = { ...emptyLibrary(), articleState: [] };
        storage.data.set(indexKey, JSON.stringify({ version: 2, sealed: await session.encrypt(JSON.stringify(damaged), indexKey) }));
      }
      const beforeData = new Map(storage.data);
      const beforeKeys = new Map(keyStorage.data);
      const reopened = createEncryptedLibraryStorage(dependencies, accountId);
      await assert.rejects(reopened.loadIndex(), { code: 'STORAGE' });
      assert.deepEqual(storage.data, beforeData);
      assert.deepEqual(keyStorage.data, beforeKeys);
    });
  }
});

test('disposing during a body write prevents the index commit and subsequent queued writes', async () => {
  const storage = memoryStorage();
  const keyStorage = memoryStorage();
  const crypto = testCrypto();
  const accountId = 'synthetic-dispose';
  const repository = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
  const index = await repository.loadIndex();
  const indexKey = accountRoot(accountId) + 'library-v2/index';
  const committed = storage.data.get(indexKey);
  const entered = deferred();
  const release = deferred();
  const multiSet = storage.multiSet.bind(storage);
  storage.multiSet = async (entries) => {
    await multiSet(entries);
    entered.resolve();
    await release.promise;
  };
  const edition = makeEdition('cancelled');
  const inFlight = assert.rejects(repository.commit(changesFor(edition, index)), { code: 'SESSION' });
  await entered.promise;
  const queued = assert.rejects(repository.commit(changesFor(makeEdition('queued'), index)), { code: 'SESSION' });
  repository.dispose();
  release.resolve();
  await Promise.all([inFlight, queued]);
  assert.equal(storage.data.get(indexKey), committed);
  await assert.rejects(repository.loadIndex(), { code: 'SESSION' });

  const reopened = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
  assert.deepEqual((await reopened.loadIndex()).newsletters, []);
  assert.deepEqual([...storage.data.keys()], [indexKey]);
});

test('startup shares one final inventory, removes only account garbage and rescans on reopen', async () => {
  const accountId = 'synthetic-inventory';
  const storage = memoryStorage();
  const keyStorage = memoryStorage();
  const dependencies = { storage, keyStorage, crypto: testCrypto() };
  const getAllKeys = storage.getAllKeys;
  let scans = 0;
  storage.getAllKeys = async () => { scans++; return getAllKeys(); };
  const repository = createEncryptedLibraryStorage(dependencies, accountId);
  await repository.loadIndex();
  assert.equal(scans, 3, 'fresh initialization retains both safety scans and one cleanup scan');
  const edition = makeEdition('live');
  const index = await repository.commit(changesFor(edition));
  const root = accountRoot(accountId);
  const orphan = root + 'library-v2/edition/orphan/revision';
  const legacy = root + 'library-v1/index';
  const foreign = accountRoot('other-account') + 'library-v1/index';
  storage.data.set(orphan, 'synthetic orphan');
  storage.data.set(legacy, 'obsolete source');
  storage.data.set(foreign, 'another account');
  scans = 0;
  const reopened = createEncryptedLibraryStorage(dependencies, accountId);
  const restored = await reopened.loadIndex();
  assert.equal(scans, 1);
  assert.equal(storage.data.has(orphan), false);
  assert.equal(storage.data.has(legacy), false);
  assert.equal(storage.data.get(foreign), 'another account');
  assert.equal(restored.newsletters[0].bodyRef, index.newsletters[0].bodyRef);
  assert.deepEqual(await reopened.readEditions(restored.newsletters), [edition]);

  storage.data.set(orphan, 'later orphan');
  await reopened.loadIndex();
  assert.equal(scans, 2, 'a later open must not reuse the previous inventory');
  assert.equal(storage.data.has(orphan), false);
});

test('migration cleanup scans after read-back and retries failed orphan removal', async (t) => {
  for (const encrypted of [false, true]) {
    await t.test(encrypted ? 'encrypted' : 'plaintext', async () => {
      const fixture = await legacyFixture(encrypted);
      const { storage, keyStorage, crypto, accountId, targetPrefix, bodyKey, articleState } = fixture;
      const getAllKeys = storage.getAllKeys;
      const multiGet = storage.multiGet;
      const multiRemove = storage.multiRemove;
      const orphan = targetPrefix + 'edition/interrupted/revision';
      let readBack = false;
      const scans = [];
      storage.getAllKeys = async () => {
        const keys = await getAllKeys();
        scans.push({ readBack, keys });
        return keys;
      };
      storage.multiGet = async (names) => {
        const result = await multiGet(names);
        readBack = true;
        storage.data.set(orphan, 'synthetic interrupted write');
        return result;
      };
      storage.multiRemove = async (names) => {
        assert.equal(readBack, true, 'source removal must follow migration read-back');
        if (names.includes(orphan)) throw new Error('Synthetic cleanup failure');
        return multiRemove(names);
      };
      const repository = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
      const index = await repository.loadIndex();
      assert.equal(scans.length, encrypted ? 2 : 3);
      assert.equal(scans.at(-1).readBack, true);
      assert.equal(scans.at(-1).keys.includes(index.newsletters[0].bodyRef), true);
      assert.equal(scans.at(-1).keys.includes(orphan), true);
      assert.equal(index.pendingCleanup.includes(orphan), true);
      assert.deepEqual(index.articleState, articleState);

      storage.multiGet = multiGet;
      storage.multiRemove = multiRemove;
      const restored = await repository.loadIndex();
      assert.equal(scans.length, encrypted ? 3 : 4);
      assert.deepEqual(restored.pendingCleanup, []);
      assert.equal(storage.data.has(orphan), false);
      assert.equal(storage.data.has(bodyKey), false);
      assert.equal(storage.data.has(restored.newsletters[0].bodyRef), true);
    });
  }
});
