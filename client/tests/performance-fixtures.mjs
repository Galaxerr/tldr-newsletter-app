import { HTMLElement } from 'node-html-parser';
import assert from 'node:assert/strict';
import { makeEdition, memoryStorage, NOW, testCrypto } from './helpers.mjs';
import { createEncryptedLibraryStorage } from '../src/services/encryptedLibraryStorage.js';
import { createLibraryStore } from '../src/services/libraryStore.js';
import { buildArticleFeed, editionMetadata, emptyLibrary, filterArticles } from '../src/services/library.js';
import { importNewsletters } from '../src/services/gmail.js';
import { editionRequestKey, indexEditions } from '../src/services/editionSelection.js';

export const nestedNewsletter = (depth = 60, count = 60) => '<span>'.repeat(depth) + '<h2>News</h2>' +
  Array.from({ length: count }, (_, i) => `<p><a href="https://example.com/story-${i}?utm_source=fixture">Unicode café ${i} (3 min read)</a></p><p>${'Résumé 🚀 synthetic summary. '.repeat(40)}</p>`).join('') + '</span>'.repeat(depth);

export const sharedTitleNewsletter = () => '<h2>News</h2><a href="https://example.com/first">First real title (3 min read)</a>' +
  '<span>'.repeat(60) + 'x'.repeat(5000) +
  Array.from({ length: 40 }, (_, i) => `<a href="https://example.com/ref-${i}">Inline reference ${i}</a>`).join('') +
  '</span>'.repeat(60) + '<a href="https://example.com/last">Last real title (2 min read)</a><p>Last summary.</p>';

// Counts getter work, not native heap allocation. Restore the dependency after each probe.
export const measureParser = (parse, html = nestedNewsletter(), subject = 'TLDR AI', from = '') => {
  const metrics = { htmlBytes: Buffer.byteLength(html), textReads: 0, textCharacters: 0, rawReads: 0, rawCharacters: 0 };
  const descriptors = {};
  for (const [property, reads, characters] of [['text', 'textReads', 'textCharacters'], ['rawText', 'rawReads', 'rawCharacters']]) {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, property);
    descriptors[property] = original;
    Object.defineProperty(HTMLElement.prototype, property, { ...original, get() {
      const value = original.get.call(this);
      metrics[reads]++;
      metrics[characters] += value.length;
      return value;
    } });
  }
  try {
    const edition = parse(html, subject, new Date(NOW).toUTCString(), from);
    return { metrics, edition };
  } finally {
    for (const [property, descriptor] of Object.entries(descriptors)) Object.defineProperty(HTMLElement.prototype, property, descriptor);
  }
};

export const savedLibrary = (count, articlesPerEdition = 25, summaryLength = 1200) => {
  const editions = Array.from({ length: count }, (_, editionNumber) => {
    const edition = makeEdition(`saved-${editionNumber}`);
    edition.articles = Array.from({ length: articlesPerEdition }, (_, articleNumber) => ({
      ...edition.articles[0], id: `https://example.com/${editionNumber}/${articleNumber}`,
      url: `https://example.com/${editionNumber}/${articleNumber}`,
      title: `Article ${editionNumber}/${articleNumber}`, summary: 'Synthetic summary. '.repeat(Math.ceil(summaryLength / 19)).slice(0, summaryLength),
    }));
    edition.articlesCount = edition.articles.length;
    return edition;
  });
  return { editions, articleState: Object.fromEntries(editions.map((edition) => [edition.articles[0].id, { bookmarked: true }])) };
};

export const measureEditionLookup = (count = 2000) => {
  const newsletters = Array.from({ length: count }, (_, i) => ({ id: String(i), bodyRef: `revision-${i}`, verification: null }));
  const ids = newsletters.map(({ id }) => id);
  let beforeComparisons = 0;
  const before = JSON.stringify(ids.map((id) => {
    const meta = newsletters.find((edition) => { beforeComparisons++; return edition.id === id; });
    return [id, meta?.bodyRef, meta?.verification];
  }));
  assert.equal(editionRequestKey(ids, indexEditions(newsletters)), before);
  return { editions: count, beforeComparisons, afterMapEntries: count, afterLookups: count };
};

// Real encrypted repository/store, synthetic AES adapter and in-memory disk.
// Bytes and object counts are deterministic; they are not Android heap/latency estimates.
export const measureSaved = async (count, articlesPerEdition = 25, summaryLength = 1200) => {
  let fixture = savedLibrary(count, articlesPerEdition, summaryLength);
  const crypto = testCrypto();
  const createSession = crypto.createSession;
  const counters = { editions: 0, bytes: 0 };
  crypto.createSession = (key) => {
    const session = createSession(key);
    return { ...session, async decrypt(value, name) {
      const text = await session.decrypt(value, name);
      if (name.includes('/edition/')) { counters.editions++; counters.bytes += Buffer.byteLength(text); }
      return text;
    } };
  };
  const dependencies = { storage: memoryStorage(), keyStorage: memoryStorage(), crypto };
  const writer = createEncryptedLibraryStorage(dependencies, 'synthetic-saved-benchmark');
  await writer.loadIndex();
  await writer.commit({ index: { ...emptyLibrary(), newsletters: fixture.editions.map(editionMetadata),
    articleState: fixture.articleState }, editions: fixture.editions });
  writer.dispose();
  fixture = null;
  const store = createLibraryStore({ repository: createEncryptedLibraryStorage(dependencies, 'synthetic-saved-benchmark'), now: () => NOW });
  try {
    await store.hydrate();
    assert.equal(store.getSnapshot().ready, true);
    assert.equal(counters.editions, 0, 'startup must remain metadata-only');
    const { newsletters, articleState } = store.getSnapshot().library;
    const ids = newsletters.map(({ id }) => id);
    const release = store.retainBodies(ids);
    let bodies = await store.readEditions(ids);
    let feed = buildArticleFeed(bodies);
    const visible = filterArticles(feed, articleState, { savedOnly: true });
    assert.equal(visible.length, count);
    assert.equal(filterArticles(feed, articleState, { savedOnly: true, query: 'synthetic summary' }).length, count);
    const result = { editions: count, articlesPerEdition, summaryLength, coldBodyDecrypts: counters.editions,
      decryptedBodyBytes: counters.bytes, bodyArticles: bodies.reduce((sum, edition) => sum + edition.articles.length, 0),
      projectedArticles: feed.length, occurrences: feed.reduce((sum, article) => sum + article.occurrences.length, 0),
      searchCharacters: feed.reduce((sum, article) => sum + article.searchText.length, 0), savedResults: visible.length };
    counters.editions = 0;
    await store.readEditions(ids);
    result.activeRereadDecrypts = counters.editions;
    bodies = null;
    feed = null;
    release();
    const releaseAgain = store.retainBodies(ids);
    await store.readEditions(ids);
    result.refocusBodyDecrypts = counters.editions;
    result.inactiveCachedEditions = count - counters.editions;
    releaseAgain();
    return result;
  } finally { store.dispose(); }
};

export const measureRejections = async (rejectedCount, refreshes = 10) => {
  const source = '<a href="https://example.com/accepted">Accepted fixture (3 min read)</a><p>' + 'Synthetic summary. '.repeat(2500) + '</p>';
  const makeMessage = (id) => ({ id, internalDate: String(NOW), payload: {
    mimeType: 'text/html', body: { data: Buffer.from(source).toString('base64url'), size: Buffer.byteLength(source) },
    headers: [
      { name: 'Received', value: 'from mail.example.com by mx.google.com with ESMTPS' },
      { name: 'Authentication-Results', value: `mx.google.com; dmarc=${id === 'accepted' ? 'pass' : 'fail'} header.from=tldrnewsletter.com` },
      { name: 'From', value: 'TLDR <fixture@tldrnewsletter.com>' },
      { name: 'Subject', value: 'TLDR Tech synthetic edition' },
      { name: 'Date', value: new Date(NOW).toUTCString() },
    ],
  } });
  const ids = ['accepted', ...Array.from({ length: rejectedCount }, (_, i) => `rejected-${i}`)];
  const result = { rejectedMessages: rejectedCount, refreshes, listRequests: 0, acceptedBodyRequests: 0,
    rejectedBodyRequests: 0, rejectedResponseBytes: 0, repeatRejectedRequests: 0, repeatRejectedBytes: 0 };
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/messages')) {
      result.listRequests++;
      return new Response(JSON.stringify({ messages: ids.map((id) => ({ id })) }));
    }
    const id = url.pathname.split('/').at(-1);
    const body = JSON.stringify(makeMessage(id));
    if (id === 'accepted') result.acceptedBodyRequests++;
    else {
      result.rejectedBodyRequests++;
      result.rejectedResponseBytes += Buffer.byteLength(body);
      if (result.listRequests > 1) { result.repeatRejectedRequests++; result.repeatRejectedBytes += Buffer.byteLength(body); }
    }
    return new Response(body);
  };
  const token = { getToken: async () => 'synthetic-access', assertActive() {}, onAuthError() {} };
  const knownIds = new Set();
  try {
    for (let i = 0; i < refreshes; i++) {
      const progress = await importNewsletters({ token, after: NOW / 1000 - 7 * 86400, before: NOW / 1000 + 1, knownIds,
        onPage: async (editions) => editions.forEach((edition) => knownIds.add(edition.id)) });
      assert.equal(progress.skipped, rejectedCount);
      assert.equal(progress.imported, i === 0 ? 1 : 0);
    }
    return result;
  } finally { globalThis.fetch = previous; }
};
