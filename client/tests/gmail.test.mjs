import assert from 'node:assert/strict';
import test from 'node:test';
import { importNewsletters } from '../src/services/gmail.js';
import { parseTLDREmail, MAX_HTML_BYTES } from '../src/services/parser.js';
import { isVerifiedEdition, verifyNewsletter } from '../src/services/messageTrust.js';
import { createEncryptedLibraryStorage } from '../src/services/encryptedLibraryStorage.js';
import { articleId, editionDate, editionMetadata } from '../src/services/library.js';
import { fetchWithTimeout } from '../src/services/network.js';
import { SecurityError } from '../src/services/securityErrors.js';
import { deferred, memoryStorage, NOW, testCrypto } from './helpers.mjs';

const html = '<h2>News</h2><a href="https://example.com/story?utm_source=fixture">Café computing (3 min read)</a><p>A synthetic résumé 🚀.</p>';
const headers = () => [
  { name: 'Received', value: 'from mail.example.com by mx.google.com with ESMTPS' },
  { name: 'Authentication-Results', value: 'mx.google.com; dmarc=pass header.from=tldrnewsletter.com' },
  { name: 'From', value: 'TLDR <fixture@tldrnewsletter.com>' },
  { name: 'Subject', value: 'TLDR Tech synthetic edition' },
  { name: 'Date', value: new Date(NOW - 86400000).toUTCString() },
];
const body = () => ({ data: Buffer.from(html).toString('base64url'), size: Buffer.byteLength(html) });
const message = (id, attachment = false) => ({
  id,
  internalDate: String(NOW),
  payload: {
    headers: headers(),
    mimeType: 'multipart/alternative',
    parts: [{ mimeType: 'text/html', body: attachment ? { attachmentId: 'body', size: body().size } : body() }],
  },
});
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const authorization = (overrides = {}) => ({
  signal: new AbortController().signal,
  getToken: async () => 'synthetic-access',
  assertActive() {},
  onAuthError() {},
  ...overrides,
});
const importOptions = (overrides = {}) => ({
  token: authorization(), after: 100, before: 200, onPage: async () => {}, ...overrides,
});

test('parser preserves Unicode summaries, article boundaries and normalized identity', () => {
  const source = html + '<a href="https://example.com/ad">Sponsored offer (2 min read) (sponsored)</a><p>Advertisement only.</p>' +
    '<a href="https://example.com/second">Second real article (4 min read)</a><p>Second summary.</p>' +
    '<a href="https://example.com/story?utm_source=duplicate">Duplicate article (3 min read)</a><p>Duplicate summary.</p>' +
    '<footer>Unsubscribe from this synthetic fixture.</footer>';
  const edition = parseTLDREmail(source, 'TLDR AI', new Date(NOW).toUTCString(), 'TLDR DevOps <fixture@tldrnewsletter.com>');
  assert.equal(edition.category, 'IT');
  assert.equal(edition.publishedAt, NOW);
  assert.equal(edition.articlesCount, 2);
  assert.equal(Object.hasOwn(edition, 'date'), false);
  assert.equal(Object.hasOwn(edition, 'from'), false);
  assert.deepEqual(edition.articles.map(({ id, summary, readingMinutes }) => ({ id, summary, readingMinutes })), [
    { id: 'https://example.com/story', summary: 'A synthetic résumé 🚀.', readingMinutes: 3 },
    { id: 'https://example.com/second', summary: 'Second summary.', readingMinutes: 4 },
  ]);
  for (const article of edition.articles) {
    assert.equal(Object.hasOwn(article, 'readingTime'), false);
    assert.equal(Object.hasOwn(article, 'contentType'), false);
  }
});

test('type and adjacent duration labels still delimit articles without storing derived labels', () => {
  const source = html + '<a href="https://example.com/resource">Untimed resource (website)</a><p>Resource description.</p>' +
    '<p><a href="https://example.com/paper">Timed research (paper)</a> (5 min read)</p><p>Research summary.</p>';
  const { articles } = parseTLDREmail(source);
  assert.deepEqual(articles, [
    {
      id: 'https://example.com/story', url: 'https://example.com/story?utm_source=fixture',
      title: 'Café computing', readingMinutes: 3, section: 'News', summary: 'A synthetic résumé 🚀.',
    },
    {
      id: 'https://example.com/paper', url: 'https://example.com/paper',
      title: 'Timed research', readingMinutes: 5, section: 'News', summary: 'Research summary.',
    },
  ]);
});

test('parser leaves an invalid date unknown and rejects oversized or deeply nested HTML', () => {
  for (const header of ['', 'invalid date']) {
    const parsed = parseTLDREmail(html, 'TLDR AI', header, 'TLDR DevOps <fixture@tldrnewsletter.com>');
    assert.equal(parsed.publishedAt, null);
    assert.equal(editionDate(parsed), 'Date unavailable');
    assert.equal(parsed.category, 'IT', 'sender still takes precedence over the subject');
    assert.equal(Object.hasOwn(parsed, 'date'), false);
    assert.equal(Object.hasOwn(parsed, 'from'), false);
  }
  assert.throws(() => parseTLDREmail('x'.repeat(MAX_HTML_BYTES + 1)), { code: 'LIMIT' });
  assert.throws(() => parseTLDREmail('<div>'.repeat(130) + html + '</div>'.repeat(130)), { code: 'LIMIT' });
});

test('newsletter verification rejects spoofed, forwarded and ambiguous receiver evidence', () => {
  const verification = verifyNewsletter(headers());
  assert.deepEqual(verification, { version: 1, status: 'verified' });
  assert.equal(isVerifiedEdition({ verification }), true);
  assert.equal(verifyNewsletter(headers(), 'Fwd: TLDR Tech'), null);
  assert.equal(verifyNewsletter(headers().filter((entry) => entry.name !== 'Received')), null);
  assert.equal(verifyNewsletter([...headers(), headers()[1]]), null);
  assert.equal(verifyNewsletter([...headers(), { name: 'X-Forwarded-To', value: 'reader@example.com' }]), null);
  const spoofed = headers().map((entry) => entry.name === 'From'
    ? { ...entry, value: 'TLDR <fixture@example.com>' } : entry);
  assert.equal(verifyNewsletter(spoofed), null);
  const failed = headers().map((entry) => entry.name === 'Authentication-Results'
    ? { ...entry, value: 'mx.google.com; dmarc=fail header.from=tldrnewsletter.com' } : entry);
  assert.equal(verifyNewsletter(failed), null);
});

test('import paginates, skips known and duplicate IDs, and decodes HTML attachments', async (t) => {
  const fetched = [];
  const delivered = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/messages')) {
      assert.match(url.searchParams.get('q'), /after:99 before:200$/);
      return json(url.searchParams.has('pageToken')
        ? { messages: [{ id: 'inline' }, { id: 'attached' }] }
        : { messages: [{ id: 'known' }, { id: 'inline' }], nextPageToken: 'next' });
    }
    fetched.push(url.pathname.split('/messages/')[1]);
    if (url.pathname.endsWith('/attachments/body')) return json(body());
    const id = url.pathname.split('/').at(-1);
    return json(message(id, id === 'attached'));
  });
  const progress = await importNewsletters(importOptions({
    knownIds: new Set(['known']), onPage: async (editions) => delivered.push(...editions),
  }));
  assert.deepEqual(fetched, ['inline', 'attached', 'attached/attachments/body']);
  assert.equal(progress.imported, 2);
  assert.equal(progress.skipped, 0);
  assert.deepEqual(delivered.map((edition) => edition.id), ['inline', 'attached']);
  assert.equal(delivered[0].articles[0].summary, 'A synthetic résumé 🚀.');
  assert.equal(delivered[0].receivedAt, NOW);
  assert.equal(delivered[0].publishedAt, NOW - 86400000);
});

test('compact imported editions round-trip through encrypted storage with unchanged metadata and flags', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => new URL(input).pathname.endsWith('/messages')
    ? json({ messages: [{ id: 'compact' }] }) : json(message('compact')));
  const dependencies = { storage: memoryStorage(), keyStorage: memoryStorage(), crypto: testCrypto() };
  const repository = createEncryptedLibraryStorage(dependencies, 'synthetic-compact');
  const index = await repository.loadIndex();
  let imported;
  await importNewsletters(importOptions({ onPage: async ([edition]) => {
    imported = edition;
    await repository.commit({
      index: {
        ...index, newsletters: [editionMetadata(edition)],
        articleState: { [edition.articles[0].id]: { bookmarked: true, read: true } },
      },
      editions: [edition],
    });
  } }));
  const reopened = createEncryptedLibraryStorage(dependencies, 'synthetic-compact');
  const restored = await reopened.loadIndex();
  const [edition] = await reopened.readEditions(restored.newsletters);
  assert.deepEqual(edition, imported);
  assert.deepEqual(restored.articleState, { 'https://example.com/story': { bookmarked: true, read: true } });
  assert.equal(editionDate(edition), new Date(NOW - 86400000).toLocaleDateString('en-US'));
  assert.equal(Object.hasOwn(edition, 'date'), false);
  assert.equal(Object.hasOwn(edition, 'from'), false);
  assert.equal(Object.hasOwn(restored.newsletters[0], 'from'), false);
  assert.equal(Object.hasOwn(edition.articles[0], 'date'), false);
  assert.equal(Object.hasOwn(edition.articles[0], 'from'), false);
  assert.equal(articleId(edition.articles[0]), 'https://example.com/story');
  assert.equal(edition.receivedAt, NOW);
  assert.equal(isVerifiedEdition(edition), true);
  assert.equal(Object.hasOwn(edition.articles[0], 'readingTime'), false);
  assert.equal(Object.hasOwn(edition.articles[0], 'contentType'), false);
  assert.deepEqual(edition.verification, { version: 1, status: 'verified' });
  assert.deepEqual(restored.newsletters[0].verification, edition.verification);
});

test('import waits for persistence before fetching the next page', async (t) => {
  const delivered = deferred();
  const persisted = deferred();
  let pages = 0;
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/messages')) {
      pages++;
      return json(pages === 1 ? { messages: [{ id: 'first' }], nextPageToken: 'next' } : {});
    }
    return json(message('first'));
  });
  const importing = importNewsletters(importOptions({ onPage: async () => { delivered.resolve(); await persisted.promise; } }));
  await delivered.promise;
  assert.equal(pages, 1);
  persisted.resolve();
  await importing;
  assert.equal(pages, 2);
});

test('import counts content rejections without delivering rejected editions', async (t) => {
  const ids = ['unverified', 'oversized', 'plain', 'gone'];
  const delivered = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/messages')) return json({ messages: ids.map((id) => ({ id })) });
    const id = url.pathname.split('/').at(-1);
    if (id === 'gone') return json({}, 404);
    const value = message(id);
    if (id === 'unverified') value.payload.headers = [];
    if (id === 'oversized') value.payload.parts[0].body.size = MAX_HTML_BYTES + 1;
    if (id === 'plain') value.payload.parts[0].mimeType = 'text/plain';
    return json(value);
  });
  const progress = await importNewsletters(importOptions({ onPage: async (editions) => delivered.push(...editions) }));
  assert.deepEqual(delivered, []);
  assert.deepEqual(progress, { imported: 0, skipped: 4, rejected: { unverified: 1, oversized: 1, unsupported: 2 } });
});

test('one failed message prevents delivery of a partial batch', async (t) => {
  const delivered = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/messages')) return json({ messages: [{ id: 'good' }, { id: 'failed' }] });
    return url.pathname.endsWith('/failed') ? json({}, 500) : json(message('good'));
  });
  await assert.rejects(importNewsletters(importOptions({ onPage: async (editions) => delivered.push(...editions) })), { code: 'NETWORK' });
  assert.deepEqual(delivered, []);
});

test('401 refreshes once; a second 401 expires the session', async (t) => {
  const rejected = [];
  let requests = 0;
  let expired = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return json({}, 401); });
  const token = authorization({
    getToken: async (value) => { rejected.push(value); return value ? 'synthetic-refreshed' : 'synthetic-first'; },
    onAuthError: () => { expired++; },
  });
  await assert.rejects(importNewsletters(importOptions({ token })), { code: 'SESSION', status: 401 });
  assert.equal(requests, 2);
  assert.deepEqual(rejected, [undefined, 'synthetic-first']);
  assert.equal(expired, 1);
});

test('rate limits do not refresh credentials or expire the session', async (t) => {
  let tokens = 0;
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return json({}, 429); });
  const token = authorization({
    getToken: async () => { tokens++; return 'synthetic-access'; },
    onAuthError: () => assert.fail('Rate limiting must not invalidate the account'),
  });
  await assert.rejects(importNewsletters(importOptions({ token })), { code: 'NETWORK', status: 429 });
  assert.equal(requests, 1);
  assert.equal(tokens, 1);
});

test('an account change after a message response prevents delivery', async (t) => {
  let active = true;
  t.mock.method(globalThis, 'fetch', async (input) => {
    if (new URL(input).pathname.endsWith('/messages')) return json({ messages: [{ id: 'old-account' }] });
    active = false;
    return json(message('old-account'));
  });
  await assert.rejects(importNewsletters(importOptions({
    token: authorization({ assertActive() { if (!active) throw new SecurityError('SESSION'); } }),
    onPage: () => assert.fail('Old account content must not be delivered'),
  })), { code: 'SESSION' });
});

test('Gmail imports honor session cancellation even when fetch ignores its signal', async (t) => {
  const requested = deferred();
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => { requested.resolve(); return new Promise(() => {}); });
  const importing = importNewsletters(importOptions({
    token: authorization({ signal: controller.signal }),
    onPage: () => assert.fail('Cancelled content must not be delivered'),
  }));
  const rejected = assert.rejects(importing, { name: 'AbortError' });
  await requested.promise;
  controller.abort();
  await rejected;
});

test('transport rejects excessive streamed and buffered response bodies', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(20)));
  await assert.rejects(fetchWithTimeout('https://example.com', {}, { maxBytes: 10 }), { code: 'LIMIT' });
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, text: async () => 'é'.repeat(6) }));
  await assert.rejects(fetchWithTimeout('https://example.com', {}, { maxBytes: 10 }), { code: 'LIMIT' });
});

test('transport cancellation rejects even when native fetch ignores its signal', async (t) => {
  const requested = deferred();
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => { requested.resolve(); return new Promise(() => {}); });
  const request = fetchWithTimeout('https://example.com', { signal: controller.signal });
  const rejected = assert.rejects(request, { name: 'AbortError' });
  await requested.promise;
  controller.abort();
  await rejected;
});
