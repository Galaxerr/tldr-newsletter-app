import {
  emptyLibrary, mergeNewsletters, editionMetadata, articleId, pruneLibrary,
  hasSavedArticles, isRecentEdition, RETENTION_MS,
} from './library.js';
import { PARSER_VERSION } from './parser.js';
import { isVerifiedEdition } from './messageTrust.js';
import { safeMessage, SecurityError } from './securityErrors.js';

/** Own metadata, durable mutations and a bounded body cache. No screen needs to
 * hydrate the whole library. Storage, Gmail and the clock are injectable for tests.
 */
export const createLibraryStore = ({ repository, importer, getToken, assertActive = () => {}, now = Date.now }) => {
  let snapshot = {
    library: emptyLibrary(), ready: false, hydrationError: null, cleanupError: null,
    syncing: false, syncError: null, progress: 0, lastImport: null, clock: now(),
  };
  const listeners = new Set();
  const cache = new Map();
  const inFlight = new Map();
  const bodyUsers = new Map();
  const readingPins = new Map();
  let queue = Promise.resolve();
  let hydrating = null;
  let syncing = null;
  let deleting = null;
  let disposed = false;
  let epoch = 0;
  let syncController;
  const check = (version = epoch) => {
    assertActive();
    if (disposed || deleting || version !== epoch) throw new SecurityError('SESSION');
  };
  const publish = (patch) => {
    if (disposed) return;
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const trimCache = () => {
    const live = new Set(snapshot.library.newsletters.map((edition) => edition.bodyRef));
    for (const [ref] of cache) if (!live.has(ref)) cache.delete(ref);
    const inactive = [...cache].filter(([, edition]) => !bodyUsers.has(edition.id) && !readingPins.has(edition.id));
    for (const [ref] of inactive.slice(0, Math.max(0, inactive.length - 12))) cache.delete(ref);
  };
  const persist = async (index, editions = []) => {
    const library = await repository.commit({ index, editions });
    check();
    publish({ library, clock: now(), cleanupError: library.pendingCleanup.length
      ? 'Some expired local records could not be removed. Cleanup will be retried.' : null });
    trimCache();
    return library;
  };
  const mutate = (change) => {
    const version = epoch;
    const operation = queue.then(async () => {
      check(version);
      const result = await change(snapshot.library);
      check(version);
      const index = pruneLibrary(result.index, now(), new Set(readingPins.keys()));
      if (index !== snapshot.library || result.editions?.length || index.pendingCleanup.length) {
        return persist(index, result.editions);
      }
      publish({ clock: now(), cleanupError: null });
      return index;
    });
    queue = operation.catch(() => {});
    return operation;
  };
  const cleanup = () => {
    if (!snapshot.ready || deleting || disposed) return Promise.resolve();
    return mutate((index) => ({ index })).catch((error) => {
      if (!disposed) publish({ cleanupError: safeMessage(error, 'STORAGE') });
    });
  };
  const hydrate = () => {
    if (snapshot.ready || deleting || disposed) return Promise.resolve();
    if (hydrating) return hydrating;
    const version = epoch;
    publish({ hydrationError: null });
    hydrating = (async () => {
      const loaded = await repository.loadIndex();
      check(version);
      const retained = pruneLibrary(loaded, now());
      const library = retained !== loaded ? await repository.commit({ index: retained }) : loaded;
      check(version);
      publish({ library, ready: true, clock: now(), cleanupError: library.pendingCleanup.length
        ? 'Some expired local records could not be removed. Cleanup will be retried.' : null });
    })().catch((error) => { if (version === epoch) publish({ hydrationError: safeMessage(error, 'STORAGE') }); })
      .finally(() => { hydrating = null; });
    return hydrating;
  };

  const readEditions = async (ids) => {
    const version = epoch;
    check(version);
    const byId = new Map(snapshot.library.newsletters.map((edition) => [edition.id, edition]));
    const metadata = [...new Set(ids)].map((id) => byId.get(id));
    if (metadata.some((edition) => !edition)) throw new SecurityError('STORAGE');
    const missing = metadata.filter((edition) => !cache.has(edition.bodyRef) && !inFlight.has(edition.bodyRef));
    // Group requests before the first await, so overlapping screens share each body read.
    for (let i = 0; i < missing.length; i += 6) {
      const batch = missing.slice(i, i + 6);
      const work = repository.readEditions(batch);
      batch.forEach((meta, position) => {
        const promise = work.then((editions) => {
          check(version);
          cache.set(meta.bodyRef, editions[position]);
          trimCache();
          return editions[position];
        }).finally(() => inFlight.delete(meta.bodyRef));
        // Attach rejection handling immediately even if a later batch is still pending.
        promise.catch(() => {});
        inFlight.set(meta.bodyRef, promise);
      });
    }
    const result = await Promise.all(metadata.map(async (meta) => {
      const body = cache.get(meta.bodyRef) || await inFlight.get(meta.bodyRef);
      check(version);
      if (!body) throw new SecurityError('STORAGE');
      if (cache.has(meta.bodyRef)) { cache.delete(meta.bodyRef); cache.set(meta.bodyRef, body); }
      return { ...body, ...meta };
    }));
    check(version);
    return result;
  };
  const retainBodies = (ids) => {
    ids.forEach((id) => bodyUsers.set(id, (bodyUsers.get(id) || 0) + 1));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      ids.forEach((id) => {
        const count = (bodyUsers.get(id) || 0) - 1;
        if (count > 0) bodyUsers.set(id, count); else bodyUsers.delete(id);
      });
      trimCache();
    };
  };
  const pinEdition = (id) => {
    readingPins.set(id, (readingPins.get(id) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (readingPins.get(id) || 0) - 1;
      if (count > 0) readingPins.set(id, count); else readingPins.delete(id);
      trimCache();
      cleanup();
    };
  };
  const sync = () => {
    if (syncing) return syncing;
    if (!snapshot.ready || deleting || disposed) return Promise.resolve(false);
    const version = epoch;
    syncController = new AbortController();
    let releaseSignal = () => {};
    publish({ syncing: true, syncError: null, progress: 0, lastImport: null });
    syncing = (async () => {
      await mutate((index) => ({ index }));
      check(version);
      const startedAt = now();
      const current = snapshot.library;
      const after = Math.floor((startedAt - RETENTION_MS) / 1000);
      const before = Math.floor(startedAt / 1000) + 1;
      const stale = current.newsletters.filter((edition) =>
        (isRecentEdition(edition, startedAt) || hasSavedArticles(edition, current.articleState)) &&
        (edition.parserVersion !== PARSER_VERSION || !isVerifiedEdition(edition)));
      const staleIds = new Set(stale.map((edition) => edition.id));
      if (stale.length) await mutate((index) => ({ index: { ...index,
        newsletters: index.newsletters.map((edition) => staleIds.has(edition.id) ? { ...edition, verification: null } : edition),
      } }));
      check(version);
      const session = await getToken();
      check(version);
      const cancel = () => syncController?.abort();
      session.signal?.addEventListener('abort', cancel, { once: true });
      releaseSignal = () => session.signal?.removeEventListener('abort', cancel);
      if (session.signal?.aborted) cancel();
      const token = { ...session, signal: syncController.signal, assertActive: () => { session.assertActive(); check(version); } };
      const knownIds = new Set(current.newsletters.filter((edition) => !staleIds.has(edition.id)).map((edition) => edition.id));
      const result = await importer({ token, after, before, knownIds, revalidateIds: [...staleIds],
        onPage: async (incoming, progress) => {
          check(version);
          if (incoming.length) await mutate(async (index) => {
            const editions = [];
            for (const edition of incoming) {
              const previous = index.newsletters.find((item) => item.id === edition.id);
              // Re-parsing must not orphan a saved article if extraction rules have changed.
              const newIds = new Set(edition.articles.map(articleId));
              const missingSaved = previous?.articleIds.filter((id) => index.articleState[id]?.bookmarked && !newIds.has(id)) || [];
              if (missingSaved.length) {
                const [old] = await readEditions([edition.id]);
                const articles = [...edition.articles,
                  ...old.articles.filter((article) => missingSaved.includes(articleId(article)))
                    .map((article) => ({ ...article, sourceVerified: false })),
                ];
                editions.push({ ...edition, articles, articlesCount: articles.length });
              } else editions.push(edition);
            }
            return { index: { ...index, newsletters: mergeNewsletters(index.newsletters, editions.map(editionMetadata)) }, editions };
          });
          check(version);
          publish({ progress: progress.imported });
        },
      });
      check(version);
      await mutate((index) => ({ index: { ...index, lastSyncedAt: startedAt } }));
      publish({ lastImport: result });
      return true;
    })().catch((error) => {
      if (version === epoch) publish({ syncError: error.name === 'AbortError'
        ? 'The connection is taking too long. Saved summaries remain available.' : safeMessage(error) });
      return false;
    }).finally(() => {
      releaseSignal();
      syncController?.abort();
      syncController = null;
      syncing = null;
      publish({ syncing: false });
    });
    return syncing;
  };
  const toggleArticle = (id, field) => {
    if (!snapshot.ready || !['read', 'bookmarked'].includes(field)) return Promise.reject(new SecurityError('STORAGE'));
    return mutate((index) => {
      if (!index.newsletters.some((edition) => edition.articleIds.includes(id))) throw new SecurityError('STORAGE');
      const previous = index.articleState[id] || {};
      return { index: { ...index, articleState: { ...index.articleState, [id]: { ...previous, [field]: !previous[field] } } } };
    });
  };
  const clear = () => {
    if (deleting) return deleting;
    epoch++;
    syncController?.abort();
    cache.clear();
    publish({ ready: false, library: emptyLibrary(), hydrationError: null });
    deleting = (async () => {
      await Promise.allSettled([syncing, hydrating, queue, ...inFlight.values()]);
      await repository.clear();
      publish({ lastImport: null, syncError: null, cleanupError: null });
    })().catch(() => {
      publish({ hydrationError: 'Deletion incomplete. Try deleting local data again. (DATA-02)' });
      throw new SecurityError('STORAGE');
    }).finally(() => { deleting = null; });
    return deleting;
  };
  const dispose = () => {
    disposed = true;
    epoch++;
    syncController?.abort();
    cache.clear();
    inFlight.clear();
    bodyUsers.clear();
    readingPins.clear();
    listeners.clear();
    repository.dispose?.();
  };
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    hydrate, sync, cleanup, toggleArticle, clear, readEditions, retainBodies, pinEdition, dispose,
  };
};
