import { emitImportDiagnostic } from './importDiagnostics.js';

const VERIFICATION_VERSION = 1;
const DOMAIN = 'tldrnewsletter.com';

// This is intentionally a narrow receiver-header check, not a full DKIM or SPF
// verifier. We only trust the single Google SMTP result that appears in the Gmail
// API metadata. This assumes Gmail removes forged receiver results at its trust
// boundary. Observable forwarding and ambiguous evidence are rejected; headers
// alone cannot establish that every possible forwarding route was absent.
export const verifyNewsletter = (headers, subject = '', onDiagnostic) => {
  const reject = (code) => { emitImportDiagnostic(onDiagnostic, code); return null; };
  if (!Array.isArray(headers) || headers.length > 1000 || typeof subject !== 'string' ||
    headers.some((entry) => !entry || typeof entry.name !== 'string' || typeof entry.value !== 'string')) {
    return reject('TRUST_HEADER_SHAPE');
  }

  const entries = headers.map(({ name, value }) => ({
    name: name.toLowerCase(),
    value: value.replace(/\r?\n[ \t]+/g, ' ').trim(),
  }));

  if (entries.some(({ value }) => /[\r\n\0]/.test(value) || value.length > 16384)) {
    return reject('TRUST_HEADER_CONTENT');
  }

  const values = (name) => entries.filter((h) => h.name === name).map((h) => h.value);
  const from = values('from');

  if (from.length !== 1) return reject('TRUST_FROM_COUNT');
  if (/^(?:fwd?|inoltro)\s*:/i.test(subject)) return reject('TRUST_FORWARDED_SUBJECT');

  // Reject lists, comments and ambiguous mailbox expressions, including any
  // display-name spoofing that would hide the real sender address.
  const mailbox = from[0].match(/^(?:[^<>@,;()]*<)?([a-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([a-z0-9.-]+)>?$/i);
  if (!mailbox || mailbox[2].toLowerCase() !== DOMAIN || from[0].includes('<') !== from[0].endsWith('>')) {
    return reject('TRUST_FROM_MAILBOX');
  }

  if (
    entries.some(
      ({ name, value }) =>
        name.startsWith('resent-') ||
        name.startsWith('x-forwarded-') ||
        (name === 'arc-seal' && !/^i=1\s*;/i.test(value))
    )
  ) {
    return reject('TRUST_FORWARDING_EVIDENCE');
  }

  const results = entries.filter(
    (h) => h.name === 'authentication-results' && /^mx\.google\.com\s*;/i.test(h.value)
  );

  if (results.length !== 1) {
    return reject('TRUST_RECEIVER_RESULT_COUNT');
  }

  const result = results[0];

  // A Google SMTP receiver must appear before its result. We fail closed when the
  // direct delivery trace is missing, because that means the message cannot be
  // tied to a trusted Google relay path.
  const position = entries.indexOf(result);
  if (!entries.slice(0, position).some((h) => h.name === 'received' && /\bby mx\.google\.com\s/i.test(h.value))) {
    return reject('TRUST_RECEIVER_TRACE');
  }

  // RFC 8601 permits quoted property values; RFC 6008 defines header.b as a
  // DKIM signature prefix. Unquote ONLY this delimiter-free base64 token in a
  // DKIM clause. Other quotes/escapes remain fail-closed; DMARC is unchanged.
  const safeTokens = result.value.split(';').map((part) => /^\s*dkim=[a-z]+(?:\s|$)/i.test(part)
    ? part.replace(/(\sheader\.b=)"([A-Za-z0-9+/]+={0,2})"(?=\s|$)/gi, '$1$2') : part).join(';');
  if (safeTokens !== result.value) emitImportDiagnostic(onDiagnostic, 'TRUST_DKIM_QUOTE_NORMALIZED');
  // Strip RFC comments before interpreting method/property tokens. Nested comments
  // and all other quoted strings remain suspicious rather than being loosely parsed.
  const uncommented = safeTokens.replace(/\([^()]*\)/g, '');
  if (/[()"\\]/.test(uncommented)) {
    return reject('TRUST_RESULT_SYNTAX');
  }

  const methods = uncommented
    .split(';')
    .slice(1)
    .map((part) => part.trim())
    .filter(Boolean);

  const dmarc = methods.filter((part) => /^dmarc\s*=/i.test(part));
  if (dmarc.length !== 1 || !/^dmarc=pass(?:\s|$)/i.test(dmarc[0])) {
    return reject('TRUST_DMARC_RESULT');
  }

  const domains = [...dmarc[0].matchAll(/\bheader\.from=([^\s;]+)/gi)];
  if (domains.length !== 1 || domains[0][1].toLowerCase() !== DOMAIN) {
    return reject('TRUST_DMARC_DOMAIN');
  }

  emitImportDiagnostic(onDiagnostic, 'TRUST_VERIFIED');
  return {
    version: VERIFICATION_VERSION,
    status: 'verified',
  };
};

export const isVerifiedEdition = (edition) =>
  edition.verification?.version === VERIFICATION_VERSION &&
  edition.verification?.status === 'verified';
