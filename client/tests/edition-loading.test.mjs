import assert from 'node:assert/strict';
import test from 'node:test';
import { editionRequestKey, indexEditions } from '../src/services/editionSelection.js';
import { editionResultView, emptyEditionResult, startEditionRead } from '../src/services/editionLoading.js';
import { createLibraryStore } from '../src/services/libraryStore.js';
import { editionMetadata, emptyLibrary } from '../src/services/library.js';
import { NOW, deferred, makeEdition } from './helpers.mjs';

const body = (id, overrides = {}) => ({ ...makeEdition(id), bodyRef: `body:${id}`, ...overrides });
const keyFor = (editions) => editionRequestKey(editions.map(({ id }) => id), indexEditions(editions));
const fakeStore = () => {
  const reads = [];
  const retained = new Set();
  const pinned = new Set();
  return {
    reads, retained, pinned,
    readEditions: (ids) => {
      const work = deferred();
      reads.push({ ids, ...work });
      return work.promise;
    },
    retainBodies: (ids) => {
      const token = { ids };
      retained.add(token);
      return () => retained.delete(token);
    },
    pinEdition: (id) => {
      const token = { id };
      pinned.add(token);
      return () => pinned.delete(token);
    },
  };
};
const harnessFor = (store, incremental = true) => {
  let result = emptyEditionResult();
  let request;
  let options = { store, key: '[]', incremental };
  return {
    get result() { return result; },
    view: (updates = {}) => editionResultView(result, { ...options, ...updates }),
    start: (editions, updates = {}) => {
      request?.cancel();
      options = { ...options, key: keyFor(editions), ...updates };
      request = startEditionRead({ ...options, previous: result, onChange: (next) => { result = next; } });
      return request;
    },
    blur: () => { request?.cancel(); result = emptyEditionResult(); },
  };
};
const finishRead = async (store, request, editions) => {
  await Promise.resolve();
  store.reads.at(-1).resolve(editions);
  await request.completion;
};

test('incremental loading retains matching bodies during growth and reads only newly requested editions', async () => {
  const store = fakeStore();
  const harness = harnessFor(store);
  const a = body('a');
  const b = body('b');
  await finishRead(store, harness.start([a]), [a]);
  const beforeEffect = harness.view({ key: keyFor([b, a]) });
  assert.deepEqual(beforeEffect, { editions: [a], loading: true, error: null });

  const expanded = harness.start([b, a]);
  assert.deepEqual(harness.view(), beforeEffect);
  await finishRead(store, expanded, [b]);
  assert.deepEqual(store.reads.map(({ ids }) => ids), [['a'], ['b']]);
  assert.deepEqual(harness.view(), { editions: [b, a], loading: false, error: null });
  assert.equal(harness.view().editions[1], a, 'already-visible body identity is retained');

  const narrowed = harness.start([a]);
  await narrowed.completion;
  assert.deepEqual(harness.view().editions, [a]);
  assert.equal(store.reads.length, 2, 'narrowing to existing bodies requires no read');
  harness.blur();
  assert.equal(store.retained.size, 0);
});

test('failed expansion keeps valid articles and retries exactly the failed batch', async () => {
  const store = fakeStore();
  const harness = harnessFor(store);
  const a = body('a');
  const b = body('b');
  await finishRead(store, harness.start([a]), [a]);
  const expanded = harness.start([a, b]);
  await Promise.resolve();
  store.reads.at(-1).reject(new Error('Synthetic sensitive failure'));
  await expanded.completion;
  assert.deepEqual(harness.view().editions, [a]);
  assert.equal(harness.view().loading, false);
  assert.match(harness.view().error, /DATA-01/);
  assert.doesNotMatch(harness.view().error, /sensitive/);
  assert.deepEqual(harness.view({ attempt: 1 }), { editions: [a], loading: true, error: null },
    'retry is loading immediately, before the effect restarts the request');

  const retried = harness.start([a, b], { attempt: 1 });
  await finishRead(store, retried, [b]);
  assert.deepEqual(store.reads.map(({ ids }) => ids), [['a'], ['b'], ['b']]);
  assert.deepEqual(harness.view(), { editions: [a, b], loading: false, error: null });
  harness.blur();
});

test('revision, verification and removal changes hide invalid bodies before a new read begins', async () => {
  const store = fakeStore();
  const harness = harnessFor(store);
  const a = body('a');
  const b = body('b');
  const c = body('c');
  await finishRead(store, harness.start([a, b, c]), [a, b, c]);
  const revised = body('a', { bodyRef: 'body:a:new' });
  const revoked = body('b', { verification: null });
  assert.deepEqual(harness.view({ key: keyFor([revised, b]) }).editions, [b]);
  assert.deepEqual(harness.view({ key: keyFor([a, revoked]) }).editions, [a]);
  const updated = harness.start([revised, revoked]);
  assert.deepEqual(harness.view().editions, []);
  await finishRead(store, updated, [revised, revoked]);
  assert.deepEqual(store.reads.at(-1).ids, ['a', 'b']);
  assert.deepEqual(harness.view().editions, [revised, revoked]);
  harness.blur();
});

test('replacing a selection ignores stale success and releases its body retains and pins', async () => {
  const store = fakeStore();
  const harness = harnessFor(store);
  const a = body('a');
  const b = body('b');
  const first = harness.start([a], { pin: true });
  await Promise.resolve();
  const second = harness.start([b]);
  await Promise.resolve();
  assert.deepEqual([...store.retained].map(({ ids }) => ids), [['b']]);
  assert.deepEqual([...store.pinned].map(({ id }) => id), ['b']);
  store.reads[1].resolve([b]);
  await second.completion;
  store.reads[0].resolve([a]);
  await first.completion;
  assert.deepEqual(harness.view().editions, [b]);
  harness.blur();
  assert.equal(store.retained.size, 0);
  assert.equal(store.pinned.size, 0);
});

test('blur clears all screen body state and ignores a pending rejection', async () => {
  const store = fakeStore();
  const harness = harnessFor(store);
  const a = body('a');
  const b = body('b');
  await finishRead(store, harness.start([a]), [a]);
  const expanded = harness.start([a, b], { pin: true });
  await Promise.resolve();
  assert.deepEqual(harness.view({ focused: false }), { editions: [], loading: false, error: null });
  harness.blur();
  store.reads.at(-1).reject(new Error('Ignored after blur'));
  await expanded.completion;
  assert.deepEqual(harness.result, emptyEditionResult());
  assert.equal(store.retained.size, 0);
  assert.equal(store.pinned.size, 0);
  const refocused = harness.start([a, b]);
  assert.deepEqual(harness.view().editions, []);
  await finishRead(store, refocused, [a, b]);
  assert.deepEqual(store.reads.at(-1).ids, ['a', 'b']);
  harness.blur();
});

test('account changes cannot reuse bodies even if edition IDs and revisions match', async () => {
  const store = fakeStore();
  const nextStore = fakeStore();
  const harness = harnessFor(store);
  const a = body('same-id');
  const b = body('pending');
  await finishRead(store, harness.start([a]), [a]);
  const pending = harness.start([a, b]);
  await Promise.resolve();
  assert.deepEqual(harness.view({ store: nextStore }), { editions: [], loading: true, error: null });
  const changed = harness.start([a], { store: nextStore });
  await finishRead(nextStore, changed, [a]);
  store.reads.at(-1).resolve([b]);
  await pending.completion;
  assert.deepEqual(nextStore.reads[0].ids, ['same-id']);
  assert.deepEqual(harness.view().editions, [a]);
  assert.equal(store.retained.size, 0);
  harness.blur();
});

test('default loading remains all-or-nothing during request changes and failure', async () => {
  const store = fakeStore();
  const harness = harnessFor(store, false);
  const a = body('a');
  const b = body('b');
  await finishRead(store, harness.start([a]), [a]);
  assert.deepEqual(harness.view({ key: keyFor([a, b]) }).editions, []);
  const changed = harness.start([a, b]);
  assert.deepEqual(harness.view().editions, []);
  await Promise.resolve();
  assert.deepEqual(store.reads.at(-1).ids, ['a', 'b']);
  store.reads.at(-1).reject(new Error('Synthetic failure'));
  await changed.completion;
  assert.deepEqual(harness.view().editions, []);
  assert.equal(harness.view().loading, false);
  assert.match(harness.view().error, /DATA-01/);
  harness.blur();
});

test('real store expansion reads only the next local body even beyond the inactive cache limit', async () => {
  const editions = Array.from({ length: 15 }, (_, index) => body(String(index)));
  const metadata = editions.map((edition) => ({ ...editionMetadata(edition), bodyRef: edition.bodyRef }));
  const byId = indexEditions(editions);
  const reads = [];
  let imports = 0;
  const store = createLibraryStore({
    repository: {
      loadIndex: async () => ({ ...emptyLibrary(), newsletters: metadata }),
      readEditions: async (entries) => { reads.push(entries.map(({ id }) => id)); return entries.map(({ id }) => byId.get(id)); },
      commit: async ({ index }) => index,
    },
    importer: async () => { imports += 1; return { imported: 0 }; },
    getToken: async () => { throw new Error('Offline loading must not access Gmail'); },
    now: () => NOW,
  });
  await store.hydrate();
  const harness = harnessFor(store);
  await harness.start(metadata.slice(0, 14)).completion;
  const before = reads.length;
  const expanded = harness.start(metadata);
  assert.equal(harness.view().editions.length, 14);
  await expanded.completion;
  assert.deepEqual(reads.slice(before), [['14']]);
  assert.equal(harness.view().editions.length, 15);
  assert.equal(imports, 0);
  harness.blur();
  store.dispose();
});
