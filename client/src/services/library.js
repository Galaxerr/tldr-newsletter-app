// Data-model helpers: transform supplied values without storage, network or React.
import { normalizeArticleUrl } from './articleIdentity.js';
import { isVerifiedEdition } from './messageTrust.js';

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// Only metadata and local flags live in the index; article bodies are read on demand.
export const emptyLibrary = () => ({
  version: 3, newsletters: [], articleState: {}, lastSyncedAt: null, pendingCleanup: [],
});

export const editionTime = (edition) =>
  [edition.receivedAt, edition.publishedAt].find((value) => Number.isFinite(value) && value > 0) || 0;

export const isRecentEdition = (edition, now) => editionTime(edition) > 0 && editionTime(edition) >= now - RETENTION_MS;
export const hasSavedArticles = (edition, flags) => edition.articleIds.some((id) => flags[id]?.bookmarked);
export const editionDate = (edition) => Number.isFinite(edition.publishedAt)
  ? new Date(edition.publishedAt).toLocaleDateString('en-US') : 'Date unavailable';

export const mergeNewsletters = (existing, incoming) => {
  const merged = new Map(existing.map((edition) => [edition.id, edition]));
  for (const edition of incoming) merged.set(edition.id, edition);
  return [...merged.values()].sort((a, b) => editionTime(b) - editionTime(a) || a.id.localeCompare(b.id));
};

// The metadata alone supports cards, retention and read counts without decryption of bodies.
export const editionMetadata = (edition) => ({
  id: edition.id, subject: edition.subject, category: edition.category, from: edition.from,
  receivedAt: Number.isFinite(edition.receivedAt) ? edition.receivedAt : null,
  publishedAt: Number.isFinite(edition.publishedAt) ? edition.publishedAt : null,
  parserVersion: edition.parserVersion ?? null, verification: edition.verification ?? null,
  articleIds: edition.articles.map(articleId),
  unverifiedArticleIds: edition.articles.filter((article) => article.sourceVerified === false).map(articleId),
  articlesCount: edition.articles.length,
});

export const latestEditions = (editions, now) => {
  const categories = new Set();
  return mergeNewsletters([], editions).filter((edition) => {
    if (!isRecentEdition(edition, now) || categories.has(edition.category)) return false;
    categories.add(edition.category);
    return true;
  });
};

// Reading an expired edition temporarily pins it; bookmarks retain it across restarts.
export const pruneLibrary = (library, now, pins = new Set()) => {
  const newsletters = library.newsletters.filter((edition) =>
    isRecentEdition(edition, now) || hasSavedArticles(edition, library.articleState) || pins.has(edition.id));
  const liveIds = new Set(newsletters.flatMap((edition) => edition.articleIds));
  const articleState = Object.fromEntries(Object.entries(library.articleState).filter(([id, state]) =>
    liveIds.has(id) && (state.read || state.bookmarked)));
  if (newsletters.length === library.newsletters.length &&
    Object.keys(articleState).length === Object.keys(library.articleState).length) return library;
  return { ...library, newsletters, articleState };
};

// Reuse URL normalization when an edition's article enters the shared library.
// Fall back to its existing ID if its URL cannot be normalized.
export const articleId = (article) => normalizeArticleUrl(article.url) || article.id;

// Shared reader provenance; preserve original IDs and leave feed-only data to the feed.
// A precomputed date lets the feed keep formatting once per edition.
export const decorateArticle = (article, edition, date = editionDate(edition)) => ({
  ...article,
  sourceVerified: isVerifiedEdition(edition) && article.sourceVerified !== false,
  category: edition.category, date, subject: edition.subject, newsletterId: edition.id,
});

/**
 * Flatten newest-first editions into unique article entries for the feed.
 * The returned entries are derived views; editions retain their original
 * articles. Each occurrence records where a repeated link appeared.
 */
export const buildArticleFeed = (newsletters) => {
  const items = new Map();
  for (const edition of newsletters) {
    const date = editionDate(edition);
    for (const article of edition.articles) {
      const id = articleId(article);
      const occurrence = { category: edition.category, date };
      // Repeated links share reading/bookmark state but retain all provenance.
      if (items.has(id)) {
        const item = items.get(id);
        item.occurrences.push(occurrence);
        if (!item.categories.includes(edition.category)) item.categories.push(edition.category);
        // Searching includes alternate newsletter wording as well as the newest.
        item.searchText += ' ' + article.title + ' ' + article.summary + ' ' + edition.subject;
      } else {
        // The first occurrence supplies the card's displayed title and summary.
        items.set(id, {
          ...decorateArticle(article, edition, date), id, categories: [edition.category],
          occurrences: [occurrence],
          searchText: [article.title, article.summary, edition.subject, article.section || ''].join(' '),
        });
      }
    }
  }
  return [...items.values()];
};

// Normalize accents and case so searches such as CAFE also match café.
const searchable = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

/**
 * Apply all selected filters together to the imported feed.
 * Every query word must occur somewhere in searchText (order is irrelevant).
 * Missing article state means unread and not bookmarked.
 */
export const filterArticles = (articles, articleState, { query = '', category = 'All', reading = 'all', savedOnly = false } = {}) => {
  const terms = searchable(query).split(/\s+/).filter(Boolean);
  return articles.filter((article) => {
    const state = articleState[article.id] || {};
    if (savedOnly && !state.bookmarked) return false;
    if (reading === 'unread' && state.read) return false;
    if (reading === 'read' && !state.read) return false;
    if (category !== 'All' && !article.categories.includes(category)) return false;
    if (!terms.length) return true;
    const text = searchable(article.searchText);
    return terms.every((term) => text.includes(term));
  });
};

// Count reviewed articles in an edition using the same identities as the feed.
export const countRead = (articles, articleState) =>
  articles.filter((article) => articleState[typeof article === 'string' ? article : articleId(article)]?.read).length;
