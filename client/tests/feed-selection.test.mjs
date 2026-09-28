import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceFeedCursors, selectFeedEditions } from '../src/services/feedSelection.js';
import { RETENTION_MS, buildArticleFeed, editionMetadata, filterArticles } from '../src/services/library.js';
import { makeEdition, NOW } from './helpers.mjs';

const DAY = 24 * 60 * 60 * 1000;
const edition = (id, category = 'Tech', age = 0, overrides = {}) =>
  makeEdition(id, { category, receivedAt: NOW - age, publishedAt: NOW - age, ...overrides });
const metadata = (...editions) => editions.map(editionMetadata);
const ids = (editions) => editions.map(({ id }) => id);

test('feed starts with the latest edition per category and offers one older edition per category', () => {
  const newsletters = metadata(edition('tech-old', 'Tech', 2 * DAY), edition('ai-new', 'AI'),
    edition('tech-new', 'Tech', 1), edition('ai-old', 'AI', DAY), edition('tech-next', 'Tech', DAY));
  const page = selectFeedEditions(newsletters, NOW);
  assert.deepEqual(ids(page.editions), ['ai-new', 'tech-new']);
  assert.deepEqual(ids(page.nextEditions), ['ai-old', 'tech-next']);
  assert.equal(page.hasMore, true);
});

test('seeding revealed editions preserves selection and repeated seeding is idempotent', () => {
  const newsletters = metadata(edition('tech-latest'), edition('tech-older', 'Tech', DAY),
    edition('ai-latest', 'AI', 1), edition('ai-older', 'AI', 2 * DAY));
  const initial = selectFeedEditions(newsletters, NOW);
  const cursors = advanceFeedCursors({}, initial.editions);
  const seeded = selectFeedEditions(newsletters, NOW, cursors);
  assert.deepEqual(seeded, initial);
  assert.equal(advanceFeedCursors(cursors, seeded.editions), cursors);

  const expandedCursors = advanceFeedCursors(cursors, seeded.nextEditions);
  const expanded = selectFeedEditions(newsletters, NOW, expandedCursors);
  assert.equal(advanceFeedCursors(expandedCursors, expanded.editions), expandedCursors);
  assert.deepEqual(selectFeedEditions(newsletters, NOW, expandedCursors), expanded);
});

test('category changes retain revealed history while restricting only the next editions', () => {
  const newsletters = metadata(edition('tech-new'), edition('tech-next', 'Tech', DAY),
    edition('tech-old', 'Tech', 2 * DAY), edition('ai-new', 'AI', 1), edition('ai-old', 'AI', DAY));
  let page = selectFeedEditions(newsletters, NOW, {}, 'Tech');
  assert.deepEqual(ids(page.nextEditions), ['tech-next']);
  const cursors = advanceFeedCursors({}, page.nextEditions);
  page = selectFeedEditions(newsletters, NOW, cursors, 'AI');
  assert.deepEqual(ids(page.editions), ['tech-new', 'ai-new', 'tech-next']);
  assert.deepEqual(ids(page.nextEditions), ['ai-old']);
  page = selectFeedEditions(newsletters, NOW, cursors, 'All');
  assert.deepEqual(ids(page.nextEditions), ['ai-old', 'tech-old']);
  const expanded = advanceFeedCursors(cursors, page.nextEditions);
  assert.deepEqual(ids(selectFeedEditions(newsletters, NOW, expanded, 'Tech').editions),
    ['tech-new', 'ai-new', 'ai-old', 'tech-next', 'tech-old']);
});

test('All keeps advancing categories with remaining editions after shorter histories are exhausted', () => {
  const newsletters = metadata(edition('tech-new'), edition('tech-middle', 'Tech', 2 * DAY),
    edition('tech-old', 'Tech', 4 * DAY), edition('ai-new', 'AI'), edition('ai-old', 'AI', 3 * DAY),
    edition('it-only', 'IT', DAY));
  let page = selectFeedEditions(newsletters, NOW);
  let cursors = advanceFeedCursors({}, page.nextEditions);
  page = selectFeedEditions(newsletters, NOW, cursors);
  assert.deepEqual(ids(page.nextEditions), ['tech-old']);
  assert.equal(selectFeedEditions(newsletters, NOW, cursors, 'AI').hasMore, false);
  cursors = advanceFeedCursors(cursors, page.nextEditions);
  page = selectFeedEditions(newsletters, NOW, cursors);
  assert.equal(page.hasMore, false);
  assert.deepEqual(page.nextEditions, []);
  assert.equal(page.editions.length, newsletters.length);
});

test('the exact seven-day boundary is eligible but expired saved editions never enter Feed', () => {
  const newsletters = metadata(edition('newest'), edition('boundary', 'Tech', RETENTION_MS),
    edition('expired-saved', 'Tech', RETENTION_MS + 1), edition('expired-category', 'AI', RETENTION_MS + 1));
  const first = selectFeedEditions(newsletters, NOW);
  assert.deepEqual(ids(first.editions), ['newest']);
  assert.deepEqual(ids(first.nextEditions), ['boundary']);
  const final = selectFeedEditions(newsletters, NOW, advanceFeedCursors({}, first.nextEditions));
  assert.deepEqual(ids(final.editions), ['newest', 'boundary']);
  assert.equal(final.hasMore, false);
});

test('equal timestamps advance by stable edition ID and duplicate metadata does not add pages', () => {
  const newsletters = metadata(edition('c'), edition('a'), edition('b'), edition('b'));
  let page = selectFeedEditions(newsletters, NOW);
  assert.deepEqual(ids(page.editions), ['a']);
  assert.deepEqual(ids(page.nextEditions), ['b']);
  let cursors = advanceFeedCursors({}, page.nextEditions);
  assert.deepEqual(cursors, { Tech: { time: NOW, id: 'b' } });
  page = selectFeedEditions(newsletters, NOW, cursors);
  assert.deepEqual(ids(page.editions), ['a', 'b']);
  assert.deepEqual(ids(page.nextEditions), ['c']);
  cursors = advanceFeedCursors(cursors, page.nextEditions);
  page = selectFeedEditions(newsletters, NOW, cursors);
  assert.deepEqual(ids(page.editions), ['a', 'b', 'c']);
  assert.equal(page.hasMore, false);
});

test('selection and cursors use arrival time with the existing publication fallback', () => {
  const newsletters = metadata(edition('late-arrival', 'Tech', 0, { publishedAt: NOW - 10 * DAY }),
    edition('published-later', 'Tech', DAY, { publishedAt: NOW }),
    edition('fallback', 'AI', 2 * DAY, { receivedAt: null }),
    edition('undated', 'IT', 0, { receivedAt: null, publishedAt: null }));
  const page = selectFeedEditions(newsletters, NOW);
  assert.deepEqual(ids(page.editions), ['late-arrival', 'fallback']);
  assert.deepEqual(ids(page.nextEditions), ['published-later']);
  assert.deepEqual(advanceFeedCursors({}, [newsletters[2]]), { AI: { time: NOW - 2 * DAY, id: 'fallback' } });
});

test('refresh adds newer and newly discovered editions without collapsing revealed history', () => {
  const newsletters = metadata(edition('current'), edition('revealed', 'Tech', 2 * DAY),
    edition('next', 'Tech', 3 * DAY), edition('ai-current', 'AI', DAY));
  const initial = selectFeedEditions(newsletters, NOW, {}, 'Tech');
  const revealedCursors = advanceFeedCursors({}, initial.editions);
  const cursors = advanceFeedCursors(revealedCursors, initial.nextEditions);
  const refreshed = [...newsletters, ...metadata(edition('newest', 'Tech', -1),
    edition('discovered', 'Tech', DAY), edition('new-ai', 'AI'))];
  const page = selectFeedEditions(refreshed, NOW + 1, cursors);
  assert.deepEqual(ids(page.editions), ['newest', 'current', 'new-ai', 'ai-current', 'discovered', 'revealed']);
  assert.deepEqual(ids(page.nextEditions), ['next']);
});

test('clock advancement removes expired history and updates next-page availability', () => {
  const newsletters = metadata(edition('newest'), edition('boundary', 'Tech', RETENTION_MS));
  const cursors = advanceFeedCursors({}, selectFeedEditions(newsletters, NOW).nextEditions);
  const page = selectFeedEditions(newsletters, NOW + 1, cursors);
  assert.deepEqual(ids(page.editions), ['newest']);
  assert.equal(page.hasMore, false);
  assert.deepEqual(selectFeedEditions(newsletters, NOW + RETENTION_MS + 1, cursors),
    { editions: [], nextEditions: [], hasMore: false });
});

test('saved, read and search filters run after edition selection and do not suppress pagination', () => {
  const newsletters = [edition('latest'), edition('older', 'Tech', DAY), edition('ai-latest', 'AI')];
  const page = selectFeedEditions(newsletters, NOW, {}, 'Tech');
  const feed = buildArticleFeed(page.editions);
  for (const filters of [{ savedOnly: true }, { reading: 'read' }, { query: 'missing phrase' }]) {
    assert.deepEqual(filterArticles(feed, {}, { category: 'Tech', ...filters }), []);
    assert.deepEqual(ids(page.nextEditions), ['older']);
    assert.equal(page.hasMore, true);
  }
});

test('repeated article URLs can add no cards while still completing an edition page', () => {
  const latest = edition('latest');
  const older = edition('older', 'Tech', DAY, { articles: latest.articles });
  const newsletters = [older, latest];
  const first = selectFeedEditions(newsletters, NOW);
  const final = selectFeedEditions(newsletters, NOW, advanceFeedCursors({}, first.nextEditions));
  const feed = buildArticleFeed(final.editions);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].occurrences.length, 2);
  assert.equal(final.hasMore, false);
});

test('cursor updates are immutable and repeated or stale pages cannot rewind history', () => {
  const first = edition('b');
  const oldest = edition('oldest', 'Tech', DAY);
  const initial = Object.freeze({ AI: Object.freeze({ time: NOW - DAY, id: 'ai-old' }) });
  const cursors = advanceFeedCursors(initial, [first, oldest]);
  assert.deepEqual(initial, { AI: { time: NOW - DAY, id: 'ai-old' } });
  assert.deepEqual(cursors, { AI: initial.AI, Tech: { time: NOW - DAY, id: 'oldest' } });
  assert.equal(advanceFeedCursors(cursors, [first, oldest, edition('a')]), cursors);
  assert.equal(advanceFeedCursors(cursors, []), cursors);
  assert.deepEqual(ids(selectFeedEditions(metadata(oldest, first, edition('latest', 'Tech', -1)), NOW, cursors).editions),
    ['latest', 'b', 'oldest']);
});

test('empty libraries and categories without history offer no next page', () => {
  assert.deepEqual(selectFeedEditions([], NOW), { editions: [], nextEditions: [], hasMore: false });
  const page = selectFeedEditions(metadata(edition('latest'), edition('older', 'Tech', DAY)), NOW, {}, 'Hardware');
  assert.deepEqual(ids(page.editions), ['latest']);
  assert.deepEqual(page.nextEditions, []);
  assert.equal(page.hasMore, false);
});
