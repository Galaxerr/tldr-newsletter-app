import { emptyLibrary } from './library.js';

// Namespace and format version for device-local records; this is not a Gmail ID.
const PREFIX = '@tldr/library-v1/';
const INDEX_KEY = PREFIX + 'index';

/**
 * Adapt an asynchronous getItem/setItem storage API to library load/save.
 * Production injects AsyncStorage; tests inject an in-memory implementation.
 *
 * Layout:
 *   index: version, ordered edition IDs, article flags and import timestamps.
 *   edition/<messageId>: one complete newsletter with its article summaries.
 *
 * Separate edition records keep content out of one large storage entry.
 * Writing the index last avoids referencing a newly added edition before it is
 * saved. This is not a multi-key database transaction: an interrupted write may
 * leave unindexed editions or an updated existing record. No credentials are stored.
 */
export const createLibraryStorage = (storage) => ({
  // Reconstruct the library from the index and the edition records it references.
  async load() {
    const raw = await storage.getItem(INDEX_KEY);
    // No index means first use; malformed existing data is an error, not a reset.
    if (!raw) return emptyLibrary();
    const index = JSON.parse(raw);
    if (index.version !== 1 || !Array.isArray(index.ids) || !index.articleState || typeof index.articleState !== 'object' || Array.isArray(index.articleState) ||
      (index.historyBefore !== null && !Number.isFinite(index.historyBefore)) ||
      (index.lastSyncedAt !== null && !Number.isFinite(index.lastSyncedAt))) {
      throw new Error('Archivio locale non riconosciuto. I dati non sono stati modificati.');
    }
    // Limit concurrent reads to 25 while preserving the index's display order.
    const newsletters = [];
    for (let i = 0; i < index.ids.length; i += 25) {
      const batch = await Promise.all(index.ids.slice(i, i + 25).map(async (id) => {
        const value = await storage.getItem(PREFIX + 'edition/' + id);
        const edition = value && JSON.parse(value);
        // Reject missing or incompatible records before they reach rendering/search.
        if (!edition || edition.id !== id || !Array.isArray(edition.articles) ||
          edition.articles.some((article) => typeof article.url !== 'string' || typeof article.title !== 'string' || typeof article.summary !== 'string')) {
          throw new Error('Impossibile leggere un’edizione salvata. Riprova senza cancellare i dati.');
        }
        return edition;
      }));
      newsletters.push(...batch);
    }
    return { newsletters, articleState: index.articleState, lastSyncedAt: index.lastSyncedAt, historyBefore: index.historyBefore };
  },

  // The store serializes calls. Compare edition object identities to avoid
  // rewriting unchanged summaries whenever only a read/bookmark flag changes.
  async save(next, previous) {
    const existing = new Map(previous.newsletters.map((edition) => [edition.id, edition]));
    for (const edition of next.newsletters) {
      if (existing.get(edition.id) !== edition) {
        await storage.setItem(PREFIX + 'edition/' + edition.id, JSON.stringify(edition));
      }
    }
    // The index is small relative to content and records the latest flags/cursors.
    // Resolving this write lets the store publish the newly durable state.
    await storage.setItem(INDEX_KEY, JSON.stringify({
      version: 1, ids: next.newsletters.map((edition) => edition.id),
      articleState: next.articleState, lastSyncedAt: next.lastSyncedAt, historyBefore: next.historyBefore,
    }));
  },
});
