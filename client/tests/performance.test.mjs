import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTLDREmail, MAX_HTML_BYTES } from '../src/services/parser.js';
import { measureEditionLookup, measureParser, measureRejections, measureSaved, nestedNewsletter, sharedTitleNewsletter } from './performance-fixtures.mjs';
import { NOW } from './helpers.mjs';

test('metadata lookup replaces quadratic scans without changing request keys', () => {
  assert.deepEqual(measureEditionLookup(), {
    editions: 2000, beforeComparisons: 2001000, afterMapEntries: 2000, afterLookups: 2000,
  });
});

test('nested irrelevant wrappers do not multiply subtree text work or change parser output', () => {
  const flat = measureParser(parseTLDREmail, nestedNewsletter(0));
  const nested = measureParser(parseTLDREmail);
  assert.deepEqual(nested.edition, flat.edition);
  assert.equal(nested.edition.articles.length, 60);
  assert.equal(nested.metrics.textReads, flat.metrics.textReads);
  assert.equal(nested.metrics.rawCharacters, flat.metrics.rawCharacters);
  assert.ok(nested.metrics.rawCharacters < 100000, 'avoid reading the entire newsletter for each wrapper');
  assert.deepEqual(nested.edition.articles[0], {
    id: 'https://example.com/story-0', url: 'https://example.com/story-0?utm_source=fixture',
    title: 'Unicode café 0', readingMinutes: 3, section: 'News',
    summary: 'Résumé 🚀 synthetic summary. '.repeat(40).trim(),
  });
});

test('category fallback stays lazy and preserves sender, subject, body precedence', () => {
  const source = '<body>TLDR Hardware ' + nestedNewsletter(20, 3) + '</body>';
  const sender = measureParser(parseTLDREmail, source, 'TLDR AI', 'TLDR DevOps');
  const subject = measureParser(parseTLDREmail, source, 'TLDR AI');
  const body = measureParser(parseTLDREmail, source, 'Unknown');
  assert.equal(sender.edition.category, 'IT');
  assert.equal(subject.edition.category, 'AI');
  assert.equal(body.edition.category, 'Hardware');
  assert.equal(sender.metrics.textReads, subject.metrics.textReads);
  assert.equal(body.metrics.textReads, subject.metrics.textReads + 1);
  assert.equal(parseTLDREmail('<body>' + 'x'.repeat(1000) + 'TLDR AI</body>').category, 'Tech');
});

test('title wrappers preserve split entities, invisible Unicode and distant duration labels', () => {
  const source = '<h2>🧪 Research</h2><p>' + '<span>'.repeat(110) +
    '<a href="https://example.com/café?utm_source=test">Caf<span>&eacute;</span>\u200b 🚀 title</a>' +
    '</span>'.repeat(110) + ' (5 min read)</p><p>Résumé &amp; preserved.</p>' +
    '<p><a href="https://example.com/entity">Entity title</a> (&#<span>51;</span> min read)</p><p>Second summary.</p>';
  const parsed = parseTLDREmail(source, '', 'invalid date');
  assert.equal(parsed.publishedAt, null);
  assert.deepEqual(parsed.articles.map(({ title, readingMinutes, section, summary }) => ({ title, readingMinutes, section, summary })), [
    { title: 'Café 🚀 title', readingMinutes: 5, section: 'Research', summary: 'Résumé & preserved.' },
    // Preserve the existing text-node summary behavior even for split entities.
    { title: 'Entity title', readingMinutes: 3, section: 'Research', summary: '(&#51; min read) Second summary.' },
  ]);
});

test('large shared title wrappers reuse length checks without swallowing article boundaries', () => {
  const { edition, metrics } = measureParser(parseTLDREmail, sharedTitleNewsletter());
  assert.equal(edition.articles.length, 2);
  assert.match(edition.articles[0].summary, /Inline reference 39$/);
  assert.equal(edition.articles[1].summary, 'Last summary.');
  assert.ok(metrics.textReads < 100, 'each oversized shared wrapper must be measured once, including equivalent ancestors');
});

test('parser byte, tree depth and node complexity limits remain enforced', () => {
  assert.throws(() => parseTLDREmail('é'.repeat(MAX_HTML_BYTES / 2 + 1)), { code: 'LIMIT' });
  assert.throws(() => parseTLDREmail('<span>'.repeat(129) + '</span>'.repeat(129)), { code: 'LIMIT' });
  assert.throws(() => parseTLDREmail('<br>'.repeat(50001)), { code: 'LIMIT' });
  assert.equal(parseTLDREmail(nestedNewsletter(120, 1), '', new Date(NOW).toUTCString()).articles.length, 1);
});

test('rejected messages repeat on refresh while accepted messages remain skipped', async () => {
  const result = await measureRejections(2, 4);
  assert.equal(result.listRequests, 4);
  assert.equal(result.acceptedBodyRequests, 1);
  assert.equal(result.rejectedBodyRequests, 8);
  assert.equal(result.repeatRejectedRequests, 6);
  assert.equal(result.repeatRejectedBytes, result.rejectedResponseBytes * 3 / 4);
});

test('Saved measures full encrypted bodies, complete search and the inactive cache bound', async () => {
  const result = await measureSaved(24, 25, 1200);
  assert.equal(result.coldBodyDecrypts, 24);
  assert.equal(result.bodyArticles, 600);
  assert.equal(result.projectedArticles, 600);
  assert.equal(result.occurrences, 600);
  assert.equal(result.savedResults, 24);
  assert.equal(result.activeRereadDecrypts, 0);
  assert.equal(result.refocusBodyDecrypts, 12);
  assert.equal(result.inactiveCachedEditions, 12);
});
