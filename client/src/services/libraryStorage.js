import { emptyLibrary, editionMetadata, mergeNewsletters } from './library.js';
import { SecurityError } from './securityErrors.js';

export const readRecord = (raw) => {
  try { return JSON.parse(raw); } catch { throw new SecurityError('STORAGE'); }
};
const validId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 8192;
const validFlags = (flags) => flags && typeof flags === 'object' && !Array.isArray(flags) &&
  Object.values(flags).every((state) => state && typeof state === 'object' &&
    ['read', 'bookmarked'].every((field) => state[field] == null || typeof state[field] === 'boolean'));
const validateEdition = (edition, id) => {
  if (!edition || edition.id !== id || !Array.isArray(edition.articles) ||
    ['subject', 'category', 'date', 'from'].some((field) => typeof edition[field] !== 'string') ||
    !edition.articles.every((article) => article &&
      ['url', 'title', 'summary'].every((field) => typeof article[field] === 'string') &&
      validId(article.id || article.url) &&
      (article.readingMinutes == null || (Number.isFinite(article.readingMinutes) && article.readingMinutes >= 0)) &&
      (article.section == null || typeof article.section === 'string'))) throw new SecurityError('STORAGE');
  return edition;
};

// Only migration reads old full-library indexes. Never assign unscoped caches to an account.
export const loadLegacyLibrary = async (storage, prefix, raw) => {
  const index = readRecord(raw);
  if (!index || index.version !== 1 || !Array.isArray(index.ids) ||
    !index.ids.every(validId) || new Set(index.ids).size !== index.ids.length ||
    !validFlags(index.articleState) ||
    (index.lastSyncedAt !== null && !Number.isFinite(index.lastSyncedAt))) throw new SecurityError('STORAGE');
  const newsletters = [];
  for (let i = 0; i < index.ids.length; i += 6) {
    newsletters.push(...await Promise.all(index.ids.slice(i, i + 6).map(async (id) =>
      validateEdition(readRecord(await storage.getItem(prefix + 'edition/' + id)), id))));
  }
  return { ...emptyLibrary(), newsletters, articleState: index.articleState, lastSyncedAt: index.lastSyncedAt };
};

/** Metadata and immutable edition records share an encrypted storage adapter.
 * Bodies are written first; replacing the single index is the commit point.
 * Expired/superseded records are deleted only after that point, with retryable cleanup.
 */
export const createLibraryStorage = (storage, prefix, { revision, assertActive = () => {} }) => {
  const indexKey = prefix + 'index';
  let current = emptyLibrary();
  const bodyKey = (key) => typeof key === 'string' && key.startsWith(prefix + 'edition/');
  const validateIndex = (index) => {
    if (!index || index.version !== 3 || !Array.isArray(index.newsletters) ||
      !validFlags(index.articleState) || !Array.isArray(index.pendingCleanup) ||
      !index.pendingCleanup.every(bodyKey) ||
      (index.lastSyncedAt !== null && !Number.isFinite(index.lastSyncedAt)) ||
      new Set(index.newsletters.map((edition) => edition?.id)).size !== index.newsletters.length ||
      !index.newsletters.every((edition) => edition && validId(edition.id) && bodyKey(edition.bodyRef) &&
        edition.bodyRef.startsWith(prefix + 'edition/' + encodeURIComponent(edition.id) + '/') &&
        ['subject', 'category', 'from'].every((field) => typeof edition[field] === 'string') &&
        Array.isArray(edition.articleIds) && edition.articleIds.every(validId) &&
        Array.isArray(edition.unverifiedArticleIds) && edition.unverifiedArticleIds.every((id) => edition.articleIds.includes(id)) &&
        edition.articlesCount === edition.articleIds.length &&
        ['receivedAt', 'publishedAt'].every((field) => edition[field] === null || Number.isFinite(edition[field])))) {
      throw new SecurityError('STORAGE');
    }
    return index;
  };
  const cleanup = async (keys) => {
    const live = new Set(current.newsletters.map((edition) => edition.bodyRef));
    const pending = [...new Set(keys)].filter((key) => bodyKey(key) && !live.has(key));
    if (!pending.length) return [];
    try {
      assertActive();
      await storage.multiRemove(pending);
      return [];
    } catch {
      // The index is already durable. A cleanup failure must not roll back a bookmark.
      return pending;
    }
  };
  return {
    async loadIndex(decoded, { onKeyScan } = {}) {
      const raw = decoded ? null : await storage.getItem(indexKey);
      current = decoded ? validateIndex(decoded) : raw === null ? emptyLibrary() : validateIndex(readRecord(raw));
      // One key scan also recovers orphaned revisions from a crash before index commit.
      const keys = await storage.getAllKeys();
      // Share this validated load's inventory with the enclosing migration adapter.
      onKeyScan?.(keys);
      const pendingCleanup = await cleanup([...current.pendingCleanup, ...keys.filter(bodyKey)]);
      current = { ...current, pendingCleanup };
      return current;
    },
    async readEditions(metadata) {
      if (!Array.isArray(metadata) || metadata.some((item) => !item || !validId(item.id) ||
        !bodyKey(item.bodyRef) || !item.bodyRef.startsWith(prefix + 'edition/' + encodeURIComponent(item.id) + '/'))) {
        throw new SecurityError('STORAGE');
      }
      const editions = [];
      for (let i = 0; i < metadata.length; i += 6) {
        assertActive();
        const batch = metadata.slice(i, i + 6);
        const records = new Map(await storage.multiGet(batch.map((item) => item.bodyRef)));
        editions.push(...batch.map((item) => validateEdition(readRecord(records.get(item.bodyRef)), item.id)));
      }
      assertActive();
      return editions;
    },
    async commit({ index, editions = [] }) {
      assertActive();
      const requested = new Set(index.newsletters.map((edition) => edition.id));
      const bodies = editions.filter((edition) => requested.has(edition.id));
      const updates = bodies.map((edition) => ({
        ...editionMetadata(validateEdition(edition, edition.id)),
        bodyRef: prefix + 'edition/' + encodeURIComponent(edition.id) + '/' + revision(),
      }));
      const newsletters = updates.length ? mergeNewsletters(index.newsletters, updates) : index.newsletters;
      const live = new Set(newsletters.map((edition) => edition.bodyRef));
      const pendingCleanup = [...new Set([...current.pendingCleanup,
        ...current.newsletters.map((edition) => edition.bodyRef).filter((key) => !live.has(key)),
      ])];
      const next = validateIndex({ ...index, version: 3, newsletters, pendingCleanup });
      if (bodies.length) {
        await storage.multiSet(bodies.map((edition, i) => [updates[i].bodyRef, JSON.stringify(edition)]));
      }
      assertActive();
      await storage.setItem(indexKey, JSON.stringify(next));
      current = next;
      const remaining = await cleanup(pendingCleanup);
      current = { ...current, pendingCleanup: remaining };
      return current;
    },
  };
};
