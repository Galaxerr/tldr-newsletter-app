// Run with Node 22: node --experimental-default-type=module tests/benchmark.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseTLDREmail } from '../src/services/parser.js';
import { measureEditionLookup, measureParser, measureRejections, measureSaved, nestedNewsletter, sharedTitleNewsletter } from './performance-fixtures.mjs';

// Optional comparison against the parser immediately before this optimization pass.
// Resolve its unchanged dependencies locally; no checkout or production files are modified.
let baseline;
if (process.argv.includes('--baseline')) {
  let source = execFileSync('git', ['show', '23cbdc9:client/src/services/parser.js'], { encoding: 'utf8' });
  for (const specifier of ['node-html-parser', './articleIdentity.js', './securityErrors.js']) {
    const resolved = import.meta.resolve(specifier.startsWith('.') ? '../src/services/' + specifier.slice(2) : specifier);
    source = source.replace(`'${specifier}'`, JSON.stringify(resolved));
  }
  baseline = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).parseTLDREmail;
}
console.log(JSON.stringify({ lookup: measureEditionLookup() }));
for (const [fixture, html] of [['nested', nestedNewsletter()], ['sharedTitles', sharedTitleNewsletter()]]) {
  const after = measureParser(parseTLDREmail, html);
  const before = baseline && measureParser(baseline, html);
  // A later extraction fix intentionally increments parserVersion; these two
  // workload fixtures still compare their complete article/metadata output.
  if (before) assert.deepEqual({ ...after.edition, parserVersion: before.edition.parserVersion }, before.edition);
  console.log(JSON.stringify({ parser: { fixture, before: before?.metrics, after: after.metrics } }));
}
for (const count of [0, 2, 10]) console.log(JSON.stringify({ gmail: await measureRejections(count) }));
for (const count of [100, 500, 2000]) console.log(JSON.stringify({ saved: await measureSaved(count) }));
