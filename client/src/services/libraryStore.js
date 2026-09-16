import { emptyLibrary, mergeNewsletters } from './library.js';
import { PARSER_VERSION } from './parser.js';
import { isVerifiedEdition } from './messageTrust.js';
import { safeMessage, SecurityError } from './securityErrors.js';

// Gmail query windows use seconds; MONTH is a fixed 30 days, not a calendar month.
const MONTH = 30 * 24 * 60 * 60;
const DAY = 24 * 60 * 60;

/**
 * Coordinate the library's lifecycle and publish snapshots for the UI.
 * repository supplies load/save, importer downloads pages, getToken authenticates,
 * and now supplies the clock. Injecting these lets tests run without a device,
 * real storage, Gmail credentials or network requests.
 *
 * library.js supplies data transformations; libraryStorage.js implements the
 * repository. This store decides when to call them and in what order.
 */
export const createLibraryStore = ({ repository, importer, getToken, assertActive = () => {}, now = Date.now }) => {
  // Only snapshot.library is persisted. Loading/error/progress fields are session UI state.
  let snapshot = {
    library: emptyLibrary(), ready: false, hydrationError: null,
    syncMode: null, lastSyncMode: 'refresh', syncError: null, progress: 0, lastImport: null,
  };
  // Subscribers are notified after a new snapshot replaces the previous object.
  const listeners = new Set();
  // Queue writes separately from downloads; one import can overlap user actions.
  let queue = Promise.resolve();
  // Reuse in-flight promises to prevent duplicate hydration or import operations.
  let hydrating = null;
  let syncing = null;
  let deleting = null;
  let epoch = 0;
  let syncController;
  const check = (version = epoch) => {
    assertActive();
    if (deleting || version !== epoch) throw new SecurityError('SESSION');
  };
  // A new object reference tells useSyncExternalStore that consumers must update.
  const publish = (patch) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  /**
   * Compute changes against the latest state when their turn in the queue arrives.
   * Save first, then publish: a failed write must not look successful in the UI.
   */
  const commit = (change) => {
    const version = epoch;
    const operation = queue.then(async () => {
      // Queued writes from a closed account must stop before touching storage.
      check(version);
      const previous = snapshot.library;
      const next = change(previous);
      await repository.save(next, previous);
      check(version);
      publish({ library: next });
    });
    // Keep the queue usable after a failure, while returning the rejecting
    // operation to its caller so the UI can report that this save failed.
    queue = operation.catch(() => {});
    return operation;
  };
  // Hydration means restoring saved data into memory. It never authenticates or
  // downloads, allowing startup without Internet. Read failures do not reset data.
  const hydrate = () => {
    if (snapshot.ready || deleting) return Promise.resolve();
    if (hydrating) return hydrating;
    publish({ hydrationError: null });
    const version = epoch;
    hydrating = repository.load().then((library) => {
      check(version);
      publish({ library, ready: true });
    })
      .catch(() => publish({ hydrationError: 'Impossibile caricare la libreria locale. Riprova; i dati salvati non verranno cancellati.' }))
      .finally(() => { hydrating = null; });
    return hydrating;
  };

  /**
   * 'refresh' imports recent mail; 'older' extends the previous history boundary.
   * Returns true on completion or false after recording an actionable error.
   */
  const sync = (mode = 'refresh') => {
    if (syncing) return syncing;
    if (!snapshot.ready || deleting) return Promise.resolve(false);
    publish({ syncMode: mode, lastSyncMode: mode, syncError: null, progress: 0, lastImport: null });
    const version = epoch;
    syncController = new AbortController();
    let releaseSignal = () => {};
    syncing = (async () => {
      const startedAt = now();
      const current = snapshot.library;
      // Freeze the upper boundary for this import so pagination uses one window.
      const end = Math.floor(startedAt / 1000) + 1;
      const before = mode === 'older' && current.historyBefore !== null ? current.historyBefore : end;
      // Refresh at least 30 days, or the whole gap since the last successful
      // refresh with two days of overlap. Older imports use contiguous windows.
      const after = mode === 'older' ? before - MONTH : Math.min(
        end - MONTH,
        current.lastSyncedAt ? Math.floor(current.lastSyncedAt / 1000) - 2 * DAY : end - MONTH,
      );
      // Authenticate only for an explicit/automatic sync, never for local reading.
      check(version);
      const session = await getToken();
      check(version);
      const cancel = () => syncController?.abort();
      session.signal?.addEventListener('abort', cancel, { once: true });
      releaseSignal = () => session.signal?.removeEventListener('abort', cancel);
      if (session.signal?.aborted) cancel();
      const token = {
        ...session,
        signal: syncController.signal,
        assertActive: () => {
          session.assertActive();
          check(version);
        },
      };
      // Skip editions already parsed with this version. A parser version change
      // makes matching editions eligible for parsing again when their window is imported.
      const knownIds = new Set(current.newsletters.filter((edition) => edition.parserVersion === PARSER_VERSION && isVerifiedEdition(edition)).map((edition) => edition.id));
      const result = await importer({
        token, after, before, knownIds,
        revalidateIds: current.newsletters.filter((edition) => !isVerifiedEdition(edition)).map((edition) => edition.id),
        // Persist completed pages immediately; later failures cannot discard them.
        onPage: async (newsletters, progress) => {
          check(version);
          if (newsletters.length) await commit((library) => ({
            ...library, newsletters: mergeNewsletters(library.newsletters, newsletters),
          }));
          publish({ progress: progress.imported });
        },
      });
      check(version);
      // Advance completion markers only after every page succeeds. On failure,
      // retry the window and skip the editions already saved by onPage.
      await commit((library) => ({
        ...library,
        lastSyncedAt: mode === 'refresh' ? startedAt : library.lastSyncedAt,
        historyBefore: Math.min(library.historyBefore ?? after, after),
      }));
      publish({ lastImport: { ...result, after, before } });
      return true;
    })().catch((error) => {
      // Retain the local library while exposing the error next to retry controls.
      publish({ syncError: error.name === 'AbortError'
        ? 'La connessione impiega troppo tempo. I sommari salvati restano disponibili.'
        : safeMessage(error) });
      return false;
    }).finally(() => {
      releaseSignal();
      syncController = null;
      syncing = null;
      publish({ syncMode: null });
    });
    return syncing;
  };

  // Toggle one local flag without changing the other flag or any Gmail labels.
  // Evaluate the previous value inside commit so rapid taps are applied in order.
  const toggleArticle = (id, field) => {
    if (!snapshot.ready || deleting || !['read', 'bookmarked'].includes(field)) return Promise.reject(new Error('Libreria non disponibile.'));
    return commit((library) => {
      const previous = library.articleState[id] || {};
      return {
        ...library,
        articleState: { ...library.articleState, [id]: { ...previous, [field]: !previous[field] } },
      };
    });
  };

  const clear = () => {
    if (deleting) return deleting;
    epoch++;
    syncController?.abort();
    publish({ ready: false, library: emptyLibrary(), hydrationError: null });
    deleting = (async () => {
      // Wait for started work; queued writes see the epoch change and fail closed.
      await Promise.allSettled([syncing, hydrating, queue]);
      await repository.clear();
      publish({ ready: false, library: emptyLibrary(), lastImport: null, syncError: null });
    })().catch(() => {
      publish({ hydrationError: 'Eliminazione non completata. Riprova a eliminare i dati locali. (DATA-02)' });
      throw new SecurityError('STORAGE');
    }).finally(() => {
      deleting = null;
    });
    return deleting;
  };

  // Minimal external-store interface; React connects through LibraryContext.
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    hydrate, sync, toggleArticle, clear,
  };
};
