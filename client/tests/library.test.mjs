import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RETENTION_MS, articleId, buildArticleFeed, countRead, editionDate, editionMetadata,
  emptyLibrary, filterArticles, isRecentEdition, latestEditions, pruneLibrary,
} from '../src/services/library.js';
import { createLibraryStore } from '../src/services/libraryStore.js';
import { NOW, deferred, makeEdition } from './helpers.mjs';

const metadata = (edition) => ({ ...editionMetadata(edition), bodyRef: `body:${edition.id}` });
const indexFor = (editions, articleState = {}) => ({
  ...emptyLibrary(), newsletters: editions.map(metadata), articleState,
});

// Model the repository's durable boundary without native storage or encryption.
const repositoryFor = (editions, articleState = {}) => {
  let durable = indexFor(editions, articleState);
  const bodies = new Map(editions.map((edition) => [edition.id, edition]));
  return {
    loadIndex: async () => durable,
    readEditions: async (entries) => entries.map((entry) => bodies.get(entry.id)),
    commit: async ({ index, editions: incoming = [] }) => {
      incoming.forEach((edition) => bodies.set(edition.id, edition));
      durable = { ...index, newsletters: index.newsletters.map((entry) => ({
        ...entry, bodyRef: entry.bodyRef || `body:${entry.id}`,
      })) };
      return durable;
    },
  };
};

const storeFor = (repository, overrides = {}) => createLibraryStore({
  repository,
  importer: async () => ({ imported: 0 }),
  getToken: async () => ({ getToken: async () => 'synthetic-token', assertActive() {} }),
  now: () => NOW,
  ...overrides,
});

test('retention includes the seven-day boundary and uses arrival before publication', () => {
  const cutoff = NOW - RETENTION_MS;
  assert.equal(isRecentEdition({ receivedAt: cutoff, publishedAt: NOW }, NOW), true);
  assert.equal(isRecentEdition({ receivedAt: cutoff - 1, publishedAt: NOW }, NOW), false);
  assert.equal(isRecentEdition({ receivedAt: NOW, publishedAt: cutoff - 1 }, NOW), true);
  assert.equal(isRecentEdition({ receivedAt: null, publishedAt: cutoff }, NOW), true);
  assert.equal(isRecentEdition({ receivedAt: NaN, publishedAt: null }, NOW), false);
});

test('retention keeps bookmarked and pinned editions but drops orphaned and empty state', () => {
  const expiredAt = NOW - RETENTION_MS - 1;
  const recent = makeEdition('recent');
  const saved = makeEdition('saved', { receivedAt: expiredAt });
  const pinned = makeEdition('pinned', { receivedAt: expiredAt });
  const read = makeEdition('read', { receivedAt: expiredAt });
  const savedId = articleId(saved.articles[0]);
  const pinnedId = articleId(pinned.articles[0]);
  const library = indexFor([recent, saved, pinned, read], {
    [savedId]: { bookmarked: true },
    [pinnedId]: { read: true },
    [articleId(read.articles[0])]: { read: true },
    [articleId(recent.articles[0])]: { bookmarked: false, read: false },
    orphan: { bookmarked: true },
  });

  const retained = pruneLibrary(library, NOW, new Set(['pinned']));
  assert.deepEqual(retained.newsletters.map(({ id }) => id), ['recent', 'saved', 'pinned']);
  assert.deepEqual(retained.articleState, {
    [savedId]: { bookmarked: true }, [pinnedId]: { read: true },
  });
  assert.equal(library.newsletters.length, 4, 'pruning does not mutate its input');
  assert.deepEqual(pruneLibrary(retained, NOW).newsletters.map(({ id }) => id), ['recent', 'saved']);
  assert.equal(pruneLibrary(indexFor([recent]), NOW).newsletters.length, 1);
});

test('latest editions choose the most recently received edition per category', () => {
  const editions = [
    makeEdition('older', { category: 'Tech', receivedAt: NOW - 2, publishedAt: NOW }),
    makeEdition('newer', { category: 'Tech', receivedAt: NOW - 1, publishedAt: NOW - RETENTION_MS }),
    makeEdition('ai', { category: 'AI', receivedAt: NOW }),
    makeEdition('expired', { category: 'Design', receivedAt: NOW - RETENTION_MS - 1 }),
  ];
  assert.deepEqual(latestEditions(editions.map(metadata), NOW).map(({ id }) => id), ['ai', 'newer']);
});

test('shared article identity preserves provenance and searches alternate newsletter wording', () => {
  const newest = makeEdition('newest', { category: 'Tech', subject: 'Newest issue' });
  newest.articles[0] = {
    ...newest.articles[0], url: 'https://example.com/story?id=7&utm_source=email',
    title: 'A new title', summary: 'Current summary',
  };
  const older = makeEdition('older', { category: 'AI', subject: 'Café research' });
  older.articles[0] = {
    ...older.articles[0], url: 'https://example.com/story?id=7&fbclid=tracking',
    title: 'Alternate wording', summary: 'An older discovery',
  };
  const originals = structuredClone([newest, older]);
  const feed = buildArticleFeed([newest, older]);
  const id = 'https://example.com/story?id=7';
  assert.equal(feed.length, 1);
  assert.equal(feed[0].id, id);
  assert.equal(feed[0].title, 'A new title');
  assert.deepEqual(feed[0].categories, ['Tech', 'AI']);
  assert.deepEqual(feed[0].occurrences, [
    { category: 'Tech', date: editionDate(newest) },
    { category: 'AI', date: editionDate(older) },
  ]);
  assert.equal(Object.hasOwn(feed[0], 'receivedAt'), false);
  assert.equal(feed[0].newsletterId, newest.id);
  assert.equal(feed[0].subject, newest.subject);
  assert.equal(feed[0].section, newest.articles[0].section);
  assert.equal(feed[0].date, editionDate(newest));
  assert.deepEqual([newest, older], originals);
  assert.equal(countRead(newest.articles, { [id]: { read: true } }), 1);
  assert.equal(countRead(metadata(older).articleIds, { [id]: { read: true } }), 1);

  const flags = { [id]: { bookmarked: true, read: true } };
  const filters = { query: 'CAFE alternate', category: 'AI', reading: 'read', savedOnly: true };
  assert.equal(filterArticles(feed, flags, filters).length, 1);
  for (const rejected of [
    { query: 'missing' }, { category: 'Design' }, { reading: 'unread' },
  ]) assert.equal(filterArticles(feed, flags, { ...filters, ...rejected }).length, 0);
  assert.equal(filterArticles(feed, {}, filters).length, 0);
});

test('content selectors remain distinct and an older verified copy cannot upgrade the displayed source', () => {
  const unverified = makeEdition('unverified', { verification: null });
  unverified.articles[0].url = 'https://example.com/story?id=1#part';
  const verified = makeEdition('verified');
  verified.articles[0].url = 'https://example.com/story?id=1&utm_source=email#part';
  const another = makeEdition('another');
  another.articles[0].url = 'https://example.com/story?id=2#part';
  const feed = buildArticleFeed([unverified, verified, another]);
  assert.equal(feed.length, 2);
  assert.equal(feed[0].sourceVerified, false);
  assert.equal(feed[1].sourceVerified, true);
  assert.notEqual(articleId({ url: 'https://example.com/story#one' }), articleId({ url: 'https://example.com/story#two' }));
});

test('hydration deduplicates concurrent loads and retries safely after storage failure', async () => {
  const loaded = deferred();
  let attempts = 0;
  const repository = repositoryFor([makeEdition('existing')]);
  const read = repository.loadIndex;
  repository.loadIndex = () => ++attempts === 1 ? loaded.promise : read();
  const store = storeFor(repository);
  const first = store.hydrate();
  assert.equal(store.hydrate(), first);
  loaded.reject(new Error('private storage details'));
  await first;
  assert.equal(store.getSnapshot().ready, false);
  assert.match(store.getSnapshot().hydrationError, /DATA-01/);
  assert.doesNotMatch(store.getSnapshot().hydrationError, /private/);
  await store.hydrate();
  assert.equal(store.getSnapshot().ready, true);
  assert.equal(store.getSnapshot().hydrationError, null);
  assert.equal(attempts, 2);
  store.dispose();
});

test('failed durable mutations remain invisible and do not poison later mutations', async () => {
  const edition = makeEdition('existing');
  const id = articleId(edition.articles[0]);
  const repository = repositoryFor([edition]);
  const commit = repository.commit;
  const started = deferred();
  const writing = deferred();
  repository.commit = async (update) => {
    started.resolve();
    await writing.promise;
    return commit(update);
  };
  const store = storeFor(repository);
  await store.hydrate();
  const before = store.getSnapshot().library;
  const saving = store.toggleArticle(id, 'bookmarked');
  const rejected = assert.rejects(saving, /synthetic write failure/);
  await started.promise;
  assert.equal(store.getSnapshot().library, before);
  writing.reject(new Error('synthetic write failure'));
  await rejected;
  assert.equal(store.getSnapshot().library, before);
  repository.commit = commit;
  await Promise.all([store.toggleArticle(id, 'bookmarked'), store.toggleArticle(id, 'read')]);
  assert.deepEqual(store.getSnapshot().library.articleState[id], { bookmarked: true, read: true });
  store.dispose();
});

test('overlapping body requests share reads and subsequent requests use the cache', async () => {
  const editions = ['a', 'b', 'c'].map((id) => makeEdition(id));
  const repository = repositoryFor(editions);
  const release = deferred();
  const batches = [];
  repository.readEditions = async (entries) => {
    batches.push(entries.map(({ id }) => id));
    await release.promise;
    return entries.map((entry) => editions.find(({ id }) => id === entry.id));
  };
  const store = storeFor(repository);
  await store.hydrate();
  const first = store.readEditions(['a', 'b', 'a']);
  const second = store.readEditions(['b', 'c']);
  assert.deepEqual(batches, [['a', 'b'], ['c']]);
  release.resolve();
  assert.deepEqual((await first).map(({ id }) => id), ['a', 'b']);
  assert.deepEqual((await second).map(({ id }) => id), ['b', 'c']);
  await store.readEditions(['c', 'b', 'a']);
  assert.equal(batches.length, 2);
  store.dispose();
});

test('an open reader pins an edition through expiry until its final release', async () => {
  let clock = NOW;
  const edition = makeEdition('reading', { receivedAt: NOW - RETENTION_MS });
  const store = storeFor(repositoryFor([edition]), { now: () => clock });
  await store.hydrate();
  const [article] = buildArticleFeed([edition]);
  const firstRelease = store.pinEdition(article.newsletterId);
  const lastRelease = store.pinEdition(article.newsletterId);
  clock++;
  await store.cleanup();
  assert.equal(store.getSnapshot().library.newsletters.length, 1);
  firstRelease();
  firstRelease();
  await store.cleanup();
  assert.equal(store.getSnapshot().library.newsletters.length, 1);
  lastRelease();
  await store.cleanup();
  assert.equal(store.getSnapshot().library.newsletters.length, 0);
  store.dispose();
});

test('revalidation preserves missing bookmarked articles without claiming they are verified', async () => {
  const previous = makeEdition('reparsed', { parserVersion: 0 });
  const savedId = articleId(previous.articles[0]);
  const replacement = makeEdition('reparsed');
  replacement.articles[0].url = 'https://example.com/replacement';
  const repository = repositoryFor([previous], { [savedId]: { bookmarked: true } });
  const store = storeFor(repository, {
    importer: async ({ knownIds, revalidateIds, onPage }) => {
      assert.equal(knownIds.has(previous.id), false);
      assert.deepEqual(revalidateIds, [previous.id]);
      await onPage([replacement], { imported: 1 });
      return { imported: 1 };
    },
  });
  await store.hydrate();
  assert.equal(await store.sync(), true);
  const [stored] = await repository.readEditions([{ id: previous.id }]);
  assert.equal(stored.articles.length, 2);
  assert.equal(stored.articles.find((article) => articleId(article) === savedId).sourceVerified, false);
  assert.deepEqual(store.getSnapshot().library.articleState[savedId], { bookmarked: true });
  assert.equal(store.getSnapshot().library.lastSyncedAt, NOW);
  store.dispose();
});

test('disposal aborts an old account sync and prevents late imports from being committed', async () => {
  const started = deferred();
  const complete = deferred();
  let request;
  let commits = 0;
  const repository = repositoryFor([]);
  const commit = repository.commit;
  repository.commit = async (update) => { commits++; return commit(update); };
  const store = storeFor(repository, {
    importer: async (options) => {
      request = options;
      started.resolve();
      return complete.promise;
    },
  });
  await store.hydrate();
  const syncing = store.sync();
  assert.equal(store.sync(), syncing);
  await started.promise;
  assert.equal(request.after, Math.floor((NOW - RETENTION_MS) / 1000));
  assert.equal(request.before, Math.floor(NOW / 1000) + 1);
  store.dispose();
  const disposedSnapshot = store.getSnapshot();
  assert.equal(request.token.signal.aborted, true);
  assert.throws(() => request.token.assertActive(), { code: 'SESSION' });
  await assert.rejects(request.onPage([makeEdition('late')], { imported: 1 }), { code: 'SESSION' });
  complete.resolve({ imported: 0 });
  assert.equal(await syncing, false);
  assert.equal(commits, 0);
  assert.equal(store.getSnapshot(), disposedSnapshot);
});
