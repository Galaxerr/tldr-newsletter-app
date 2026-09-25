import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryStorage } from '../src/services/libraryStorage.js';
import { createEncryptedLibraryStorage } from '../src/services/encryptedLibraryStorage.js';
import { articleId, editionDate, emptyLibrary, editionMetadata } from '../src/services/library.js';
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

test('encrypted storage uses injected revisions and disposes sessions on reopen and shutdown', async () => {
  const crypto = testCrypto();
  const createSession = crypto.createSession;
  let revisions = 0;
  let sessions = 0;
  let disposals = 0;
  crypto.revision = () => `synthetic-revision-${++revisions}`;
  crypto.createSession = (key) => {
    sessions++;
    const session = createSession(key);
    return { ...session, dispose() { disposals++; session.dispose(); } };
  };
  const repository = createEncryptedLibraryStorage({ storage: memoryStorage(), keyStorage: memoryStorage(), crypto }, 'synthetic-contract');
  await repository.loadIndex();
  const edition = makeEdition('contract');
  const index = await repository.commit(changesFor(edition));
  assert.equal(index.newsletters[0].bodyRef, accountRoot('synthetic-contract') + 'library-v2/edition/contract/synthetic-revision-1');
  assert.equal(revisions, 1);
  assert.deepEqual(await repository.readEditions(index.newsletters), [edition]);
  const reopened = await repository.loadIndex();
  assert.equal(sessions, 2);
  assert.equal(disposals, 1);
  assert.deepEqual(await repository.readEditions(reopened.newsletters), [edition]);
  repository.dispose();
  assert.equal(disposals, 2);
  await assert.rejects(repository.readEditions(reopened.newsletters), { code: 'SESSION' });
});

test('storage validates incoming and persisted bodies independently of prepared metadata', async () => {
  const storage = memoryStorage();
  const repository = repositoryFor(storage);
  await repository.loadIndex();
  const edition = makeEdition('validation');
  const index = await repository.commit(changesFor(edition));
  const committed = new Map(storage.data);
  for (const patch of [
    { url: null }, { title: 42 }, { summary: null }, { id: 'x'.repeat(8193) },
    { readingMinutes: -1 }, { section: 42 },
  ]) {
    const invalid = structuredClone(edition);
    Object.assign(invalid.articles[0], patch);
    await assert.rejects(repository.commit({ index, editions: [invalid] }), { code: 'STORAGE' });
    assert.deepEqual(storage.data, committed, 'invalid bodies cannot replace a committed revision');
    storage.data.set(index.newsletters[0].bodyRef, JSON.stringify(invalid));
    await assert.rejects(repository.readEditions(index.newsletters), { code: 'STORAGE' });
    storage.data.set(index.newsletters[0].bodyRef, committed.get(index.newsletters[0].bodyRef));
  }
  assert.deepEqual(await repository.readEditions(index.newsletters), [edition]);
});

test('legacy and compact encrypted records reopen without rewriting bodies, metadata or bookmark keys', async (t) => {
  for (const legacy of [true, false]) {
    await t.test(legacy ? 'legacy fields' : 'compact fields and unknown date', async () => {
      const accountId = 'synthetic-optional-fields';
      const dependencies = { storage: memoryStorage(), keyStorage: memoryStorage(), crypto: testCrypto() };
      const { storage, keyStorage, crypto } = dependencies;
      const repository = createEncryptedLibraryStorage(dependencies, accountId);
      await repository.loadIndex();
      const edition = makeEdition('optional', legacy
        ? { date: '9/21/2026', from: 'TLDR <fixture@tldrnewsletter.com>' }
        : { publishedAt: null });
      const key = 'https://example.com/optional';
      edition.articles[0].url += '?utm_source=fixture';
      const articleState = { [key]: { bookmarked: true, read: true } };
      const index = await repository.commit(changesFor(edition, { ...emptyLibrary(), articleState }));
      if (legacy) {
        // Reproduce a current-format index written by an older APK, including sender metadata.
        index.newsletters[0].from = edition.from;
        const name = accountRoot(accountId) + 'library-v2/index';
        const session = crypto.createSession(keyStorage.data.get(accountKey(accountId)));
        storage.data.set(name, JSON.stringify({ version: 2, sealed: await session.encrypt(JSON.stringify(index), name) }));
        session.dispose();
      }
      repository.dispose();
      const before = new Map(storage.data);
      const beforeKeys = new Map(keyStorage.data);
      const reopened = createEncryptedLibraryStorage(dependencies, accountId);
      const restored = await reopened.loadIndex();
      const [body] = await reopened.readEditions(restored.newsletters);
      assert.deepEqual(body, edition);
      assert.deepEqual(restored, index);
      assert.deepEqual(restored.articleState, articleState);
      assert.deepEqual(restored.newsletters[0].articleIds, [key]);
      assert.equal(articleId(body.articles[0]), key);
      assert.equal(editionDate(body), legacy ? new Date(NOW).toLocaleDateString('en-US') : 'Date unavailable');
      assert.deepEqual(storage.data, before);
      assert.deepEqual(keyStorage.data, beforeKeys);
      reopened.dispose();
    });
  }
});

test('optional legacy fields still reject malformed values in bodies and sender metadata', async () => {
  const storage = memoryStorage();
  const repository = repositoryFor(storage);
  await repository.loadIndex();
  const edition = makeEdition('optional-validation');
  const index = await repository.commit(changesFor(edition));
  const before = new Map(storage.data);
  for (const field of ['date', 'from']) {
    for (const value of [null, 42, {}]) {
      const invalid = { ...edition, [field]: value };
      await assert.rejects(repository.commit({ index, editions: [invalid] }), { code: 'STORAGE' });
      assert.deepEqual(storage.data, before);
      storage.data.set(index.newsletters[0].bodyRef, JSON.stringify(invalid));
      await assert.rejects(repository.readEditions(index.newsletters), { code: 'STORAGE' });
      storage.data.set(index.newsletters[0].bodyRef, before.get(index.newsletters[0].bodyRef));
      if (field === 'from') {
        const invalidIndex = { ...index, newsletters: [{ ...index.newsletters[0], from: value }] };
        storage.data.set(PREFIX + 'index', JSON.stringify(invalidIndex));
        await assert.rejects(repositoryFor(storage).loadIndex(), { code: 'STORAGE' });
        assert.equal(storage.data.get(index.newsletters[0].bodyRef), before.get(index.newsletters[0].bodyRef));
        storage.data.set(PREFIX + 'index', before.get(PREFIX + 'index'));
      }
    }
  }
});

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
    date: '9/21/2026', from: 'TLDR <fixture@tldrnewsletter.com>',
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

const writeEncryptedFixture = async (fixture, name, value) => {
  const { storage, keyStorage, crypto, accountId } = fixture;
  const session = crypto.createSession(keyStorage.data.get(accountKey(accountId)));
  storage.data.set(name, JSON.stringify({ version: 2, sealed: await session.encrypt(JSON.stringify(value), name) }));
  session.dispose();
};

// Stop after the index commit, before migration read-back authorizes source cleanup.
const pendingMigration = async (encrypted) => {
  const fixture = await legacyFixture(encrypted);
  const { storage, keyStorage, crypto, accountId } = fixture;
  const multiGet = storage.multiGet;
  storage.multiGet = async () => { throw new Error('Synthetic interrupted read-back'); };
  const repository = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
  await assert.rejects(repository.loadIndex(), /Synthetic interrupted read-back/);
  repository.dispose();
  storage.multiGet = multiGet;
  return fixture;
};

test('migration failures before commit retain the original index and restart from its source', async (t) => {
  for (const encrypted of [false, true]) {
    for (const failure of ['marker', 'body', 'index']) {
      await t.test(`${encrypted ? 'encrypted' : 'plaintext'} ${failure}`, async () => {
        const fixture = await legacyFixture(encrypted);
        const { storage, keyStorage, crypto, accountId, prefix, targetPrefix, edition, bodyKey, articleState } = fixture;
        const sourceIndex = storage.data.get(prefix + 'index');
        const sourceBody = storage.data.get(bodyKey);
        const foreignKey = accountRoot('other-account') + 'library-v2/index';
        storage.data.set(foreignKey, 'Other account data');
        const setItem = storage.setItem;
        const multiSet = storage.multiSet;
        storage.setItem = async (name, value) => {
          if (name === targetPrefix + (failure === 'marker' ? 'migration' : 'index')) throw new Error('Synthetic precommit failure');
          return setItem(name, value);
        };
        storage.multiSet = async (entries) => {
          await multiSet(entries);
          if (failure === 'body') throw new Error('Synthetic precommit failure');
        };
        const repository = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
        await assert.rejects(repository.loadIndex(), /Synthetic precommit failure/);
        repository.dispose();
        assert.equal(storage.data.get(prefix + 'index'), sourceIndex);
        assert.equal(storage.data.get(bodyKey), sourceBody);
        assert.equal(storage.data.has(targetPrefix + 'migration'), failure !== 'marker');
        storage.setItem = setItem;
        storage.multiSet = multiSet;
        const reopened = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
        const restored = await reopened.loadIndex();
        assert.deepEqual(restored.articleState, articleState);
        assert.deepEqual(await reopened.readEditions(restored.newsletters), [encrypted ? edition : { ...edition, verification: null }]);
        assert.deepEqual([...storage.data.keys()].sort(), [foreignKey, targetPrefix + 'index', restored.newsletters[0].bodyRef].sort());
        assert.equal(storage.data.get(foreignKey), 'Other account data');
        reopened.dispose();
      });
    }
  }
});

test('older payload-bearing markers resume read-back without rewriting the committed index', async (t) => {
  for (const encrypted of [false, true]) {
    await t.test(encrypted ? 'encrypted' : 'plaintext', async () => {
      const fixture = await pendingMigration(encrypted);
      const { storage, keyStorage, crypto, accountId, targetPrefix, legacyIndex, bodyKey, articleState, edition } = fixture;
      await writeEncryptedFixture(fixture, targetPrefix + 'migration', { sourceIndex: legacyIndex });
      const indexBytes = storage.data.get(targetPrefix + 'index');
      let reads = 0;
      const multiGet = storage.multiGet;
      storage.multiGet = async (names) => { reads++; return multiGet(names); };
      storage.setItem = async () => assert.fail('Resuming a committed migration must not rewrite records');
      storage.multiSet = async () => assert.fail('Resuming a committed migration must not rewrite bodies');
      const removeItem = storage.removeItem;
      storage.removeItem = async (name) => {
        assert.ok(reads > 0, 'read-back must precede marker removal');
        assert.equal(storage.data.has(bodyKey), true, 'source survives until read-back completes');
        return removeItem(name);
      };
      const reopened = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
      const restored = await reopened.loadIndex();
      assert.equal(reads, 1);
      assert.equal(storage.data.get(targetPrefix + 'index'), indexBytes);
      assert.equal(storage.data.has(targetPrefix + 'migration'), false);
      assert.equal(storage.data.has(bodyKey), false);
      assert.deepEqual(restored.articleState, articleState);
      assert.deepEqual(await reopened.readEditions(restored.newsletters), [encrypted ? edition : { ...edition, verification: null }]);
      reopened.dispose();
    });
  }
});

test('new migration markers contain only an encrypted boolean and healthy reopen does not rewrite them', async () => {
  const fixture = await pendingMigration(true);
  const { storage, keyStorage, crypto, accountId, targetPrefix, articleState } = fixture;
  const markerKey = targetPrefix + 'migration';
  const marker = JSON.parse(storage.data.get(markerKey));
  assert.equal(marker.version, 2);
  const session = crypto.createSession(keyStorage.data.get(accountKey(accountId)));
  assert.equal(await session.decrypt(marker.sealed, markerKey), 'true');
  session.dispose();
  const repository = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
  const migrated = await repository.loadIndex();
  assert.deepEqual(migrated.articleState, articleState);
  assert.equal(storage.data.has(markerKey), false);
  repository.dispose();
  const before = new Map(storage.data);
  const reopened = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
  assert.deepEqual(await reopened.loadIndex(), migrated);
  assert.deepEqual(storage.data, before);
  reopened.dispose();
});

test('an interrupted empty initialization without any committed index remains fail-closed', async () => {
  const storage = memoryStorage();
  const keyStorage = memoryStorage();
  const crypto = testCrypto();
  const accountId = 'synthetic-empty-interruption';
  const setItem = storage.setItem;
  const indexKey = accountRoot(accountId) + 'library-v2/index';
  storage.setItem = async (name, value) => {
    if (name === indexKey) throw new Error('Synthetic initial index failure');
    return setItem(name, value);
  };
  const repository = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
  await assert.rejects(repository.loadIndex(), /Synthetic initial index failure/);
  repository.dispose();
  storage.setItem = setItem;
  const before = new Map(storage.data);
  const beforeKeys = new Map(keyStorage.data);
  const reopened = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
  await assert.rejects(reopened.loadIndex(), { code: 'STORAGE' });
  assert.deepEqual(storage.data, before);
  assert.deepEqual(keyStorage.data, beforeKeys);
  reopened.dispose();
});

test('failed marker removal retains sources and retries read-back on restart', async (t) => {
  for (const encrypted of [false, true]) {
    await t.test(encrypted ? 'encrypted' : 'plaintext', async () => {
      const fixture = await legacyFixture(encrypted);
      const { storage, keyStorage, crypto, accountId, targetPrefix, bodyKey, articleState } = fixture;
      const removeItem = storage.removeItem;
      storage.removeItem = async () => { throw new Error('Synthetic marker removal failure'); };
      const repository = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
      await assert.rejects(repository.loadIndex(), /Synthetic marker removal failure/);
      repository.dispose();
      assert.equal(storage.data.has(targetPrefix + 'migration'), true);
      assert.equal(storage.data.has(bodyKey), true);
      storage.removeItem = removeItem;
      const reopened = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
      const restored = await reopened.loadIndex();
      assert.deepEqual(restored.articleState, articleState);
      assert.equal(storage.data.has(targetPrefix + 'migration'), false);
      assert.equal(storage.data.has(bodyKey), false);
      reopened.dispose();
    });
  }
});

test('pending migrations fail closed on missing keys or corrupt records without deleting recovery data', async (t) => {
  for (const encrypted of [false, true]) {
    for (const corruption of ['missing-key', 'invalid-envelope', 'invalid-index', 'invalid-body']) {
      await t.test(`${encrypted ? 'encrypted' : 'plaintext'} ${corruption}`, async () => {
        const fixture = await pendingMigration(encrypted);
        const { storage, keyStorage, crypto, accountId, targetPrefix } = fixture;
        const name = targetPrefix + 'index';
        const session = crypto.createSession(keyStorage.data.get(accountKey(accountId)));
        const index = JSON.parse(await session.decrypt(JSON.parse(storage.data.get(name)).sealed, name));
        session.dispose();
        if (corruption === 'missing-key') keyStorage.data.delete(accountKey(accountId));
        if (corruption === 'invalid-envelope') storage.data.set(name, '{broken');
        if (corruption === 'invalid-index') await writeEncryptedFixture(fixture, name, { ...index, articleState: [] });
        if (corruption === 'invalid-body') await writeEncryptedFixture(fixture, index.newsletters[0].bodyRef, { id: 'legacy', articles: [] });
        const before = new Map(storage.data);
        const beforeKeys = new Map(keyStorage.data);
        const reopened = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
        await assert.rejects(reopened.loadIndex(), { code: 'STORAGE' });
        assert.deepEqual(storage.data, before);
        assert.deepEqual(keyStorage.data, beforeKeys);
        reopened.dispose();
      });
    }
  }
});

test('plaintext source cleanup failure is retried after the verified migration commit', async () => {
  const fixture = await legacyFixture(false);
  const { storage, keyStorage, crypto, accountId, prefix, targetPrefix, bodyKey, articleState } = fixture;
  const multiRemove = storage.multiRemove;
  storage.multiRemove = async (names) => {
    if (names.some((name) => name.startsWith(prefix))) throw new Error('Synthetic source cleanup failure');
    return multiRemove(names);
  };
  const repository = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
  await assert.rejects(repository.loadIndex(), /Synthetic source cleanup failure/);
  repository.dispose();
  assert.equal(storage.data.has(bodyKey), true);
  assert.equal(storage.data.has(targetPrefix + 'migration'), false);
  const indexBytes = storage.data.get(targetPrefix + 'index');
  storage.multiRemove = multiRemove;
  const reopened = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
  const restored = await reopened.loadIndex();
  assert.deepEqual(restored.articleState, articleState);
  assert.equal(storage.data.get(targetPrefix + 'index'), indexBytes);
  assert.equal(storage.data.has(bodyKey), false);
  reopened.dispose();
});

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
      assert.equal(Object.hasOwn(index.newsletters[0], 'from'), false);
      assert.equal(Object.hasOwn(index.newsletters[0], 'date'), false);
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

      repository.dispose();
      const beforeRetry = new Map(storage.data);
      const stillFailing = createEncryptedLibraryStorage({ storage, keyStorage, crypto }, accountId);
      await assert.rejects(stillFailing.loadIndex(), /Synthetic migration read-back failure/);
      assert.deepEqual(storage.data, beforeRetry, 'a repeated read-back failure retains every recovery record');
      stillFailing.dispose();

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
