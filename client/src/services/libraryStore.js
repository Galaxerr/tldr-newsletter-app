import { emptyLibrary, mergeNewsletters } from './library.js';
import { PARSER_VERSION } from './parser.js';

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
export const createLibraryStore = ({ repository, importer, getToken, now = Date.now }) => {
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
    const operation = queue.then(async () => {
      const previous = snapshot.library;
      const next = change(previous);
      await repository.save(next, previous);
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
    if (snapshot.ready) return Promise.resolve();
    if (hydrating) return hydrating;
    publish({ hydrationError: null });
    hydrating = repository.load().then((library) => publish({ library, ready: true }))
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
    if (!snapshot.ready) return Promise.resolve(false);
    publish({ syncMode: mode, lastSyncMode: mode, syncError: null, progress: 0, lastImport: null });
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
      const token = await getToken();
      // Skip editions already parsed with this version. A parser version change
      // makes matching editions eligible for parsing again when their window is imported.
      const knownIds = new Set(current.newsletters.filter((edition) => edition.parserVersion === PARSER_VERSION).map((edition) => edition.id));
      const result = await importer({
        token, after, before, knownIds,
        // Persist completed pages immediately; later failures cannot discard them.
        onPage: async (newsletters, progress) => {
          if (newsletters.length) await commit((library) => ({
            ...library, newsletters: mergeNewsletters(library.newsletters, newsletters),
          }));
          publish({ progress: progress.imported });
        },
      });
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
        : (error.message || 'Sincronizzazione non riuscita. Riprova.') });
      return false;
    }).finally(() => {
      syncing = null;
      publish({ syncMode: null });
    });
    return syncing;
  };

  // Toggle one local flag without changing the other flag or any Gmail labels.
  // Evaluate the previous value inside commit so rapid taps are applied in order.
  const toggleArticle = (id, field) => {
    if (!snapshot.ready || !['read', 'bookmarked'].includes(field)) return Promise.reject(new Error('Libreria non disponibile.'));
    return commit((library) => {
      const previous = library.articleState[id] || {};
      return {
        ...library,
        articleState: { ...library.articleState, [id]: { ...previous, [field]: !previous[field] } },
      };
    });
  };

  // Minimal external-store interface; React connects through LibraryContext.
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    hydrate, sync, toggleArticle,
  };
};
