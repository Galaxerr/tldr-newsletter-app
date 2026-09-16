// Data-model helpers: transform supplied values without storage, network or React.
import { normalizeArticleUrl } from './articleIdentity.js';
import { isVerifiedEdition } from './messageTrust.js';

/**
 * Create independent initial state for a device's library.
 * newsletters contains editions and their summaries; articleState maps article
 * identities to { read, bookmarked }. lastSyncedAt is epoch milliseconds;
 * historyBefore is the oldest completed import boundary in epoch seconds.
 */
export const emptyLibrary = () => ({
  newsletters: [], articleState: {}, lastSyncedAt: null, historyBefore: null,
});

/**
 * Upsert by Gmail message ID without deleting older editions.
 * Sort newest first; this order also determines which duplicate article's
 * title and summary become the main entry in buildArticleFeed.
 */
export const mergeNewsletters = (existing, incoming) => {
  const merged = new Map(existing.map((edition) => [edition.id, edition]));
  for (const edition of incoming) merged.set(edition.id, edition);
  return [...merged.values()].sort((a, b) => (b.receivedAt || b.publishedAt || 0) - (a.receivedAt || a.publishedAt || 0) || a.id.localeCompare(b.id));
};

// Reuse URL normalization when an edition's article enters the shared library.
// Fall back to its existing ID if its URL cannot be normalized.
export const articleId = (article) => normalizeArticleUrl(article.url) || article.id;

/**
 * Flatten newest-first editions into unique article entries for the feed.
 * The returned entries are derived views; editions retain their original
 * articles. Each occurrence records where a repeated link appeared.
 */
export const buildArticleFeed = (newsletters) => {
  const items = new Map();
  for (const edition of newsletters) {
    for (const article of edition.articles) {
      const id = articleId(article);
      const occurrence = {
        newsletterId: edition.id, category: edition.category,
        subject: edition.subject, date: edition.date, section: article.section,
      };
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
          ...article, id, sourceVerified: isVerifiedEdition(edition), category: edition.category, categories: [edition.category],
          newsletterId: edition.id, date: edition.date, subject: edition.subject,
          receivedAt: edition.receivedAt, occurrences: [occurrence],
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
export const filterArticles = (articles, articleState, { query = '', category = 'Tutte', reading = 'all', savedOnly = false } = {}) => {
  const terms = searchable(query).split(/\s+/).filter(Boolean);
  return articles.filter((article) => {
    const state = articleState[article.id] || {};
    if (savedOnly && !state.bookmarked) return false;
    if (reading === 'unread' && state.read) return false;
    if (reading === 'read' && !state.read) return false;
    if (category !== 'Tutte' && !article.categories.includes(category)) return false;
    const text = searchable(article.searchText);
    return terms.every((term) => text.includes(term));
  });
};

// Count reviewed articles in an edition using the same identities as the feed.
export const countRead = (articles, articleState) =>
  articles.filter((article) => articleState[articleId(article)]?.read).length;
