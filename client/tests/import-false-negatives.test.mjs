import assert from 'node:assert/strict';
import test from 'node:test';
import { importNewsletters } from '../src/services/gmail.js';
import { parseTLDREmail } from '../src/services/parser.js';
import { verifyNewsletter } from '../src/services/messageTrust.js';
import { headers, message, mockMessage, part, session } from './import-fixtures.mjs';

test('a quoted DKIM signature prefix does not invalidate independent Google DMARC evidence', () => {
  const original = headers();
  const quoted = original.map((header) => header.name === 'Authentication-Results'
    ? { ...header, value: header.value.replace('header.b=AbC/123+', 'header.b="AbC/123+"') } : header);
  assert.deepEqual(verifyNewsletter(quoted), verifyNewsletter(original));
  assert.ok(verifyNewsletter(quoted));
});

test('case-insensitive HTML media types are recognized inside nested multipart bodies', async (t) => {
  const value = message({ mimeType: 'multipart/mixed', parts: [{ mimeType: 'multipart/alternative', parts: [
    { mimeType: 'text/plain', body: { data: Buffer.from('Plain alternative').toString('base64url') } },
    { ...part(), mimeType: 'Text/HTML' },
  ] }] });
  mockMessage(t, value);
  const delivered = [];
  const progress = await importNewsletters({ token: session(), after: 0, before: 2000000000, onPage: async (editions) => delivered.push(...editions) });
  assert.equal(progress.imported, 1);
  assert.equal(delivered[0].articles[0].summary, 'Résumé 🚀.');
});

test('an earlier article-free HTML part does not hide a later usable newsletter body', async (t) => {
  const value = message({ mimeType: 'multipart/mixed', parts: [part('<p>Preheader only.</p>'),
    { mimeType: 'multipart/alternative', parts: [part()] }] });
  mockMessage(t, value);
  const delivered = [];
  const progress = await importNewsletters({ token: session(), after: 0, before: 2000000000, onPage: async (editions) => delivered.push(...editions) });
  assert.equal(progress.imported, 1);
  assert.equal(delivered[0].articles[0].id, 'https://example.com/ai');
});

test('formatting whitespace before an adjacent duration does not hide a valid title', () => {
  const template = (spacing) => '<h2>News</h2><div><a href="https://example.com/research">Synthetic café research</a>' +
    spacing + '<span>(3 min read)</span><p>Résumé 🚀.</p></div>';
  const compact = parseTLDREmail(template(''), 'TLDR AI', 'invalid date');
  assert.equal(compact.articlesCount, 1);
  assert.deepEqual(parseTLDREmail(template('\n  \t\u200b'), 'TLDR AI', 'invalid date'), compact);
});
