import { editionTime, isRecentEdition, mergeNewsletters } from './library.js';

// Match the metadata's newest-first order, including its stable ID tie-break.
const compareWithCursor = (edition, cursor) =>
  cursor.time - editionTime(edition) || edition.id.localeCompare(cursor.id);

const categoryCursor = (cursors, category) => Object.hasOwn(cursors, category) ? cursors[category] : null;

/**
 * Keep each category's latest edition and any history revealed this session.
 * Only the next page uses the category filter; article filters run afterwards.
 */
export const selectFeedEditions = (newsletters, now, cursors = {}, category = 'All') => {
  const editions = [];
  const nextEditions = [];
  const latestCategories = new Set();
  const nextCategories = new Set();

  for (const edition of mergeNewsletters([], newsletters)) {
    if (!isRecentEdition(edition, now)) continue;
    const cursor = categoryCursor(cursors, edition.category);
    const latest = !latestCategories.has(edition.category);
    latestCategories.add(edition.category);
    if (latest || (cursor && compareWithCursor(edition, cursor) <= 0)) {
      editions.push(edition);
    } else if ((category === 'All' || category === edition.category) && !nextCategories.has(edition.category)) {
      nextEditions.push(edition);
      nextCategories.add(edition.category);
    }
  }

  return { editions, nextEditions, hasMore: nextEditions.length > 0 };
};

// A cursor survives refreshes and removals without depending on a page count.
export const advanceFeedCursors = (cursors, editions) => {
  let next = cursors;
  for (const edition of editions) {
    const cursor = categoryCursor(next, edition.category);
    if (cursor && compareWithCursor(edition, cursor) <= 0) continue;
    next = { ...next, [edition.category]: { time: editionTime(edition), id: edition.id } };
  }
  return next;
};
