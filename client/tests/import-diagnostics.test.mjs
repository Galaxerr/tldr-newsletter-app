import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importNewsletters } from '../src/services/gmail.js';
import { verifyNewsletter } from '../src/services/messageTrust.js';
import { MAX_HTML_BYTES } from '../src/services/parser.js';
import { createImportDiagnostics, diagnosticReason } from '../src/services/importDiagnostics.js';
import { createEncryptedLibraryStorage } from '../src/services/encryptedLibraryStorage.js';
import { createLibraryStore } from '../src/services/libraryStore.js';
import { editionMetadata, emptyLibrary, RETENTION_MS } from '../src/services/library.js';
import { makeEdition, memoryStorage, NOW, testCrypto } from './helpers.mjs';
import { body, headers, html, json, message, mockMessage, part, session } from './import-fixtures.mjs';

const collect = () => {
  const diagnostics = createImportDiagnostics();
  return { diagnostics, onDiagnostic: diagnostics.begin(), codes: () => diagnostics.snapshot().map(({ code }) => code) };
};
const run = async (value, options = {}) => importNewsletters({ token: session(), after: 0, before: 2000000000,
  onPage: async () => {}, ...options });
const replaceResult = (value) => headers().map((entry) => entry.name === 'Authentication-Results' ? { ...entry, value } : entry);
const quoted = 'mx.google.com; dkim=pass header.i=@tldrnewsletter.com header.b="AbC/123+"; dmarc=pass header.from=tldrnewsletter.com';

test('quoted DKIM support retains every trust rejection boundary and precise reasons', async (t) => {
  const base = () => replaceResult(quoted);
  const cases = [
    ['shape', () => null, '', 'TRUST_HEADER_SHAPE'],
    ['header controls', () => [...base(), { name: 'To', value: 'private\nInjected: value' }], '', 'TRUST_HEADER_CONTENT'],
    ['duplicate From', () => [...base(), headers()[2]], '', 'TRUST_FROM_COUNT'],
    ['spoofed From', () => base().map((h) => h.name === 'From' ? { ...h, value: 'TLDR <spoof@example.com>' } : h), '', 'TRUST_FROM_MAILBOX'],
    ['forward subject', base, 'Fwd: Newsletter', 'TRUST_FORWARDED_SUBJECT'],
    ['forward header', () => [...base(), { name: 'X-Forwarded-To', value: 'private@example.com' }], '', 'TRUST_FORWARDING_EVIDENCE'],
    ['resent', () => [...base(), { name: 'Resent-From', value: 'private@example.com' }], '', 'TRUST_FORWARDING_EVIDENCE'],
    ['ARC chain', () => [...base(), { name: 'ARC-Seal', value: 'i=2; synthetic' }], '', 'TRUST_FORWARDING_EVIDENCE'],
    ['missing result', () => base().filter((h) => h.name !== 'Authentication-Results'), '', 'TRUST_RECEIVER_RESULT_COUNT'],
    ['ambiguous result', () => [...base(), headers()[1]], '', 'TRUST_RECEIVER_RESULT_COUNT'],
    ['missing relay', () => base().slice(1), '', 'TRUST_RECEIVER_TRACE'],
    ['wrong relay order', () => [base()[1], base()[0], ...base().slice(2)], '', 'TRUST_RECEIVER_TRACE'],
    ['nested comment', () => replaceResult(quoted + ' (outer (inner))'), '', 'TRUST_RESULT_SYNTAX'],
    ['unrelated quotes', () => replaceResult(quoted + '; spf=fail reason="not checked"'), '', 'TRUST_RESULT_SYNTAX'],
    ['quoted injection', () => replaceResult('mx.google.com; dkim=pass header.b="abc; dmarc=pass header.from=tldrnewsletter.com"'), '', 'TRUST_RESULT_SYNTAX'],
    ['escaped token', () => replaceResult(quoted.replace('AbC/123+', 'AbC\\123')), '', 'TRUST_RESULT_SYNTAX'],
    ['unbalanced quote', () => replaceResult(quoted.replace('AbC/123+"', 'AbC/123+')), '', 'TRUST_RESULT_SYNTAX'],
    ['DMARC fail', () => replaceResult(quoted.replace('dmarc=pass', 'dmarc=fail')), '', 'TRUST_DMARC_RESULT'],
    ['duplicate DMARC', () => replaceResult(quoted + '; dmarc=pass header.from=tldrnewsletter.com'), '', 'TRUST_DMARC_RESULT'],
    ['wrong domain', () => replaceResult(quoted.replace('header.from=tldrnewsletter.com', 'header.from=example.com')), '', 'TRUST_DMARC_DOMAIN'],
    ['duplicate domain', () => replaceResult(quoted + ' header.from=tldrnewsletter.com'), '', 'TRUST_DMARC_DOMAIN'],
  ];
  for (const [name, fixture, subject, expected] of cases) await t.test(name, () => {
    const trace = collect();
    assert.equal(verifyNewsletter(fixture(), subject, trace.onDiagnostic), null);
    assert.deepEqual(trace.diagnostics.snapshot().filter(({ outcome }) => outcome === 'rejected').map(({ code }) => code), [expected]);
  });
});

test('recipient aliases and newsletter infrastructure headers do not replace sender/DMARC evidence', () => {
  const value = [...replaceResult(quoted),
    { name: 'To', value: 'alias+newsletter@example.com' }, { name: 'Delivered-To', value: 'primary@example.com' },
    { name: 'Sender', value: 'delivery@mailer.example' }, { name: 'Reply-To', value: 'support@reply.example' }];
  assert.deepEqual(verifyNewsletter(value), { version: 1, status: 'verified' });
  assert.equal(verifyNewsletter(value.filter(({ name }) => name !== 'From')), null);
  assert.deepEqual(verifyNewsletter(headers(), '', () => { throw new Error('Inspector failed'); }), { version: 1, status: 'verified' });
});

test('HTML body locations, filenames, dispositions and Gmail base64url variants preserve Unicode', async (t) => {
  for (const variant of ['direct', 'mixed', 'related', 'attachment', 'named', 'disposition', 'padded', 'transfer-header']) await t.test(variant, async (t) => {
    let candidate = part();
    if (variant === 'attachment') candidate.body = { attachmentId: 'synthetic-body', size: body().size };
    if (variant === 'named') candidate.filename = 'unusual-name.bin';
    if (variant === 'disposition') candidate.headers = [{ name: 'Content-Disposition', value: 'inline; filename="newsletter.htm"' }];
    if (variant === 'padded') candidate.body.data = candidate.body.data.padEnd(Math.ceil(candidate.body.data.length / 4) * 4, '=');
    if (variant === 'transfer-header') candidate.headers = [{ name: 'Content-Transfer-Encoding', value: 'quoted-printable' }];
    if (['mixed', 'related'].includes(variant)) candidate = { mimeType: 'multipart/' + variant, parts: [
      { mimeType: 'image/png', filename: 'logo.png', body: {} },
      { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: body('plain') }, candidate] },
    ] };
    const value = message(candidate);
    const requests = mockMessage(t, value, { 'synthetic-body': body() });
    const trace = collect();
    let imported;
    const result = await run(value, { onDiagnostic: trace.onDiagnostic, onPage: async ([edition]) => { imported = edition; } });
    assert.equal(result.imported, 1);
    assert.equal(imported.articles[0].summary, 'Résumé 🚀.');
    assert.equal(trace.codes().includes('HTML_ATTACHMENT'), variant === 'attachment');
    assert.equal(requests.length, variant === 'attachment' ? 2 : 1);
  });
});

test('a later HTML attachment is tried after an article-free candidate, but the first successful body wins', async (t) => {
  const attached = { mimeType: 'text/html', body: { attachmentId: 'second', size: body().size } };
  const value = message({ mimeType: 'multipart/mixed', parts: [part('<p>Preheader.</p>'), attached] });
  mockMessage(t, value, { second: body() });
  assert.equal((await run(value)).imported, 1);
  value.payload.parts[0] = part();
  const requests = mockMessage(t, value, {});
  assert.equal((await run(value)).imported, 1);
  assert.equal(requests.length, 1);
});

test('MIME, body and parser failures stay distinct and never fall through safety failures', async (t) => {
  const cases = [
    ['plain', { mimeType: 'text/plain', body: body('plain') }, 'MIME_NO_HTML', 'unsupported'],
    ['empty HTML', { mimeType: 'text/html', body: {} }, 'MIME_HTML_NO_BODY', 'unsupported'],
    ['encapsulated', { mimeType: 'Message/RFC822', parts: [part()] }, 'MIME_NO_HTML', 'unsupported'],
    ['MIME shape', { mimeType: 'multipart/mixed', parts: {} }, 'MIME_SHAPE', 'oversized'],
    ['MIME depth', Array.from({ length: 34 }).reduce((value) => ({ mimeType: 'multipart/mixed', parts: [value] }), part()), 'MIME_LIMIT', 'oversized'],
    ['MIME count', { mimeType: 'multipart/mixed', parts: Array.from({ length: 1001 }, () => ({ mimeType: 'text/plain' })) }, 'MIME_LIMIT', 'oversized'],
    ['declared size', { ...part(), body: { ...body(), size: MAX_HTML_BYTES + 1 } }, 'BODY_SIZE', 'oversized'],
    ['encoded size', { ...part(), body: { data: 'A'.repeat(Math.ceil(MAX_HTML_BYTES / 3) * 4 + 1) } }, 'BODY_SIZE', 'oversized'],
    ['invalid alphabet', { ...part(), body: { data: 'not!base64' } }, 'BODY_BASE64_INVALID', 'oversized'],
    ['invalid padding', { ...part(), body: { data: 'a===' } }, 'BODY_BASE64_INVALID', 'unsupported'],
    ['no articles', part('<p>No article links.</p>'), 'PARSER_NO_ARTICLES', 'unsupported'],
    ['HTML depth', part('<div>'.repeat(130) + html + '</div>'.repeat(130)), 'HTML_DEPTH', 'oversized'],
    ['HTML complexity', part('<br>'.repeat(50001)), 'HTML_COMPLEXITY', 'oversized'],
    ['candidate budget', { mimeType: 'multipart/mixed', parts: [...Array.from({ length: 8 }, () => part('<p>Preheader.</p>')), part()] }, 'MIME_CANDIDATE_LIMIT', 'oversized'],
    ['aggregate bytes', { mimeType: 'multipart/mixed', parts: [part('x'.repeat(MAX_HTML_BYTES - 10)), part()] }, 'BODY_SIZE', 'oversized'],
  ];
  for (const [name, payload, code, bucket] of cases) await t.test(name, async (t) => {
    // A later valid part must never mask a malformed/safety-limited first candidate.
    const value = message(['declared size', 'invalid alphabet', 'HTML depth'].includes(name)
      ? { mimeType: 'multipart/mixed', parts: [payload, part()] } : payload);
    mockMessage(t, value);
    const trace = collect();
    const result = await run(value, { onDiagnostic: trace.onDiagnostic });
    assert.equal(result.imported, 0);
    assert.equal(result.rejected[bucket], 1);
    assert.ok(trace.codes().includes(code), trace.codes().join(','));
  });
});

test('verification failure occurs before attachment retrieval or parsing', async (t) => {
  const value = message({ mimeType: 'text/html', body: { attachmentId: 'untrusted' } });
  value.payload.headers = replaceResult(quoted.replace('dmarc=pass', 'dmarc=fail'));
  const requests = mockMessage(t, value);
  const trace = collect();
  assert.equal((await run(value, { onDiagnostic: trace.onDiagnostic })).rejected.unverified, 1);
  assert.equal(requests.length, 1);
  assert.equal(trace.codes().includes('MIME_CANDIDATES'), false);
  assert.ok(trace.codes().includes('TRUST_DMARC_RESULT'));
});

test('attachment responses retain empty-body and declared-size checks', async (t) => {
  for (const [response, code, bucket] of [[{}, 'BODY_MISSING', 'unsupported'],
    [{ ...body(), size: MAX_HTML_BYTES + 1 }, 'BODY_SIZE', 'oversized']]) await t.test(code, async (t) => {
    const value = message({ mimeType: 'text/html', body: { attachmentId: 'external' } });
    mockMessage(t, value, { external: response });
    const trace = collect();
    assert.equal((await run(value, { onDiagnostic: trace.onDiagnostic })).rejected[bucket], 1);
    assert.ok(trace.codes().includes(code));
  });
});

test('diagnostics preserve metadata fallbacks and an inspector failure cannot reject mail', async (t) => {
  const value = message();
  value.payload.headers = value.payload.headers.filter(({ name }) => !['Date', 'Subject'].includes(name));
  delete value.internalDate;
  mockMessage(t, value);
  const trace = collect();
  let imported;
  assert.equal((await run(value, { onDiagnostic: trace.onDiagnostic, onPage: async ([edition]) => { imported = edition; } })).imported, 1);
  for (const code of ['SUBJECT_MISSING', 'DATE_UNKNOWN', 'RECEIVED_DATE_FALLBACK']) assert.ok(trace.codes().includes(code));
  assert.equal(imported.publishedAt, null);
  assert.equal(imported.receivedAt, 0);
  assert.equal((await run(value, { onDiagnostic: () => { throw new Error('Inspector failure'); } })).imported, 1);
});

test('listing and transport errors report stable codes without becoming cached content rejections', async (t) => {
  const cases = [
    ['invalid JSON', () => new Response('{'), 'RESPONSE_JSON_INVALID'],
    ['invalid page', () => json({ messages: 'malformed' }), 'LIST_INVALID'],
    ['invalid ID', () => json({ messages: [{}] }), 'LIST_INVALID'],
    ['repeated token', () => json({ messages: [], nextPageToken: 'same' }), 'LIST_PAGE_CYCLE'],
    ['rate limit', () => json({}, 429), 'RATE_LIMIT'],
    ['authentication', () => json({}, 401), 'AUTH_SESSION'],
    ['server error', () => json({}, 503), 'HTTP_ERROR'],
    ['transport', () => { throw new Error('private transport details'); }, 'IMPORT_FAILED'],
  ];
  for (const [name, response, expected] of cases) await t.test(name, async (t) => {
    t.mock.method(globalThis, 'fetch', response);
    const trace = collect();
    await assert.rejects(run(null, { onDiagnostic: trace.onDiagnostic }));
    assert.ok(trace.codes().includes(expected), trace.codes().join(','));
    assert.doesNotMatch(JSON.stringify(trace.diagnostics.snapshot()), /private transport/);
  });
});

test('known/duplicate skips, charset warnings and empty parser statistics are observable without content', async (t) => {
  const value = message(part('<a href="https://example.com/reference">Untimed reference</a>'));
  value.payload.headers.push({ name: 'Content-Type', value: 'text/html; charset=windows-1252' });
  t.mock.method(globalThis, 'fetch', async (input) => new URL(input).pathname.endsWith('/messages')
    ? json({ messages: [{ id: 'known' }, { id: value.id }, { id: value.id }] }) : json(value));
  const trace = collect();
  const result = await run(value, { knownIds: new Set(['known']), onDiagnostic: trace.onDiagnostic });
  assert.equal(result.skipped, 1);
  for (const code of ['KNOWN_MESSAGE', 'DUPLICATE_MESSAGE', 'BODY_NON_UTF8_CHARSET', 'PARSER_NO_ARTICLES']) assert.ok(trace.codes().includes(code));
  const counts = trace.diagnostics.snapshot().find(({ code }) => code === 'PARSER_COUNTS');
  assert.equal(counts.links, 1);
  assert.equal(counts.noDuration, 1);
  assert.doesNotMatch(JSON.stringify(trace.diagnostics.snapshot()), /reference|@|synthetic-message|windows-1252/);
});

test('diagnostics are bounded, detached, account-local and ignore late/unknown/sensitive data', () => {
  const first = collect();
  first.onDiagnostic('MESSAGE_FETCHED', { messageId: 'private@example.com', receivedAt: NOW, subject: 'secret', token: 'secret', headers: 'secret', status: 'secret' });
  const event = first.diagnostics.snapshot()[0];
  assert.deepEqual(event, { code: 'MESSAGE_FETCHED', stage: 'retrieval', outcome: 'info', message: 'message-1', receivedDay: '2026-09-21' });
  event.code = 'changed';
  assert.equal(first.diagnostics.forMessage('private@example.com')[0].code, 'MESSAGE_FETCHED');
  for (let i = 0; i < 500; i++) first.onDiagnostic('KNOWN_MESSAGE', { messageId: 'id-' + i });
  assert.equal(first.diagnostics.snapshot().length, 300);
  assert.deepEqual(first.diagnostics.forMessage('id-0'), []);
  const second = collect();
  assert.deepEqual(second.diagnostics.snapshot(), []);
  first.diagnostics.begin();
  first.onDiagnostic('MESSAGE_FETCHED', { messageId: 'stale' });
  assert.deepEqual(first.diagnostics.snapshot(), []);
  second.onDiagnostic('raw private error text', { body: 'private' });
  second.diagnostics.close();
  second.onDiagnostic('KNOWN_MESSAGE', { messageId: 'late' });
  assert.deepEqual(second.diagnostics.snapshot(), []);
  first.diagnostics.clear();
  assert.deepEqual(first.diagnostics.forMessage('private@example.com'), []);
  assert.equal(diagnosticReason(new Error('private server text')), 'IMPORT_FAILED');
});

test('invalid edition bodies fail storage validation before commit and are diagnosed', async (t) => {
  const dependencies = { storage: memoryStorage(), keyStorage: memoryStorage(), crypto: testCrypto() };
  const repository = createEncryptedLibraryStorage(dependencies, 'synthetic-validation');
  t.after(() => repository.dispose());
  const index = await repository.loadIndex();
  const value = message();
  mockMessage(t, value);
  const trace = collect();
  await assert.rejects(run(value, { onDiagnostic: trace.onDiagnostic, onPage: async ([edition]) => {
    const metadata = editionMetadata(edition);
    edition.articles[0].summary = 42;
    await repository.commit({ index: { ...index, newsletters: [metadata] }, editions: [edition] });
  } }), { code: 'STORAGE', diagnosticCode: 'EDITION_INVALID' });
  assert.ok(trace.codes().includes('EDITION_INVALID'));
  assert.equal(trace.codes().includes('DELIVERY_COMPLETED'), false);
  assert.deepEqual((await repository.loadIndex()).newsletters, []);
});

test('store diagnostics distinguish committed from retention-pruned imports and clear on account disposal', async () => {
  const dependencies = { storage: memoryStorage(), keyStorage: memoryStorage(), crypto: testCrypto() };
  const diagnostics = createImportDiagnostics();
  const store = createLibraryStore({ repository: createEncryptedLibraryStorage(dependencies, 'synthetic-diagnostics'),
    now: () => NOW, diagnostics, getToken: async () => session(), importer: async ({ onPage }) => {
      await onPage([makeEdition('recent'), makeEdition('expired', { receivedAt: NOW - RETENTION_MS - 1 })], { imported: 2 });
      return { imported: 2 };
    } });
  try {
    await store.hydrate();
    assert.equal(await store.sync(), true);
    assert.ok(diagnostics.forMessage('recent').some(({ code }) => code === 'EDITION_COMMITTED'));
    assert.ok(diagnostics.forMessage('expired').some(({ code }) => code === 'RETENTION_DROPPED'));
    assert.deepEqual(store.getSnapshot().library.newsletters.map(({ id }) => id), ['recent']);
    assert.deepEqual(Object.keys(store.getSnapshot().library).sort(), Object.keys(emptyLibrary()).sort());
  } finally { store.dispose(); }
  assert.deepEqual(diagnostics.snapshot(), []);
});

test('offline inspector prints only sanitized codes for Gmail JSON and original EML headers', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'tldr-inspect-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const extension of ['json', 'eml']) {
    const file = join(directory, 'synthetic.' + extension);
    const fixture = replaceResult(quoted);
    const text = extension === 'json' ? JSON.stringify({ payload: { headers: fixture } })
      : fixture.map(({ name, value }) => `${name}: ${value}`).join('\r\n') + '\r\n\r\nPrivate body must never print.';
    writeFileSync(file, text);
    const output = execFileSync(process.execPath, ['--experimental-default-type=module',
      new URL('../scripts/inspect-newsletter.mjs', import.meta.url).pathname, file], { encoding: 'utf8' });
    assert.equal(JSON.parse(output).verified, true);
    assert.ok(JSON.parse(output).diagnostics.some(({ code }) => code === 'TRUST_DKIM_QUOTE_NORMALIZED'));
    assert.doesNotMatch(output, /@|AbC|Private body|Synthetic AI/);
  }
});
