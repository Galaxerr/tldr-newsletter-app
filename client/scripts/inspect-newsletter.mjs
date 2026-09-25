// Offline, headers-only inspection. No network, logging of input, or persistence.
// Usage: node --experimental-default-type=module scripts/inspect-newsletter.mjs /tmp/message.eml
// Also accepts a Gmail format=full JSON response or a JSON header array.
import { readFileSync, statSync } from 'node:fs';
import { verifyNewsletter } from '../src/services/messageTrust.js';
import { createImportDiagnostics } from '../src/services/importDiagnostics.js';

try {
  const [file, ...extra] = process.argv.slice(2);
  if (!file || extra.length || statSync(file).size > 8 * 1024 * 1024) throw new Error();
  const text = readFileSync(file, 'utf8');
  let headers;
  if (/^\s*[\[{]/.test(text)) {
    const value = JSON.parse(text);
    headers = Array.isArray(value) ? value : value.payload?.headers;
  } else {
    headers = [];
    for (const line of text.split(/\r?\n\r?\n/, 1)[0].split(/\r?\n/)) {
      if (/^[ \t]/.test(line) && headers.length) headers[headers.length - 1].value += '\n' + line;
      else {
        const colon = line.indexOf(':');
        if (colon < 1) throw new Error();
        headers.push({ name: line.slice(0, colon), value: line.slice(colon + 1).trim() });
      }
    }
  }
  const diagnostics = createImportDiagnostics();
  const report = diagnostics.begin();
  const subject = headers?.find((entry) => typeof entry?.name === 'string' && entry.name.toLowerCase() === 'subject')?.value || '';
  const verification = verifyNewsletter(headers, subject, report);
  diagnostics.close();
  console.log(JSON.stringify({ scope: 'headers-only; no MIME, account or persistence checks', verified: !!verification,
    diagnostics: diagnostics.snapshot() }, null, 2));
} catch {
  console.error('MAIL_INSPECTION_INPUT_INVALID: provide one readable EML or Gmail JSON file, at most 8 MiB.');
  process.exitCode = 1;
}
