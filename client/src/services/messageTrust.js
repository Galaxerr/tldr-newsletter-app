const VERIFICATION_VERSION = 1;
const DOMAIN = 'tldrnewsletter.com';

// This is intentionally a narrow receiver-header check, not a full DKIM or SPF
// verifier. We only trust the single Google SMTP result that appears in the Gmail
// API metadata. This assumes Gmail removes forged receiver results at its trust
// boundary. Observable forwarding and ambiguous evidence are rejected; headers
// alone cannot establish that every possible forwarding route was absent.
export const verifyNewsletter = (headers, subject = '') => {
  if (!Array.isArray(headers) || headers.length > 1000 || typeof subject !== 'string' ||
    headers.some((entry) => !entry || typeof entry.name !== 'string' || typeof entry.value !== 'string')) {
    return null;
  }

  const entries = headers.map(({ name, value }) => ({
    name: name.toLowerCase(),
    value: value.replace(/\r?\n[ \t]+/g, ' ').trim(),
  }));

  if (entries.some(({ value }) => /[\r\n\0]/.test(value) || value.length > 16384)) {
    return null;
  }

  const values = (name) => entries.filter((h) => h.name === name).map((h) => h.value);
  const from = values('from');

  if (from.length !== 1 || /^(?:fwd?|inoltro)\s*:/i.test(subject)) {
    return null;
  }

  // Reject lists, comments and ambiguous mailbox expressions, including any
  // display-name spoofing that would hide the real sender address.
  const mailbox = from[0].match(/^(?:[^<>@,;()]*<)?([a-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([a-z0-9.-]+)>?$/i);
  if (!mailbox || mailbox[2].toLowerCase() !== DOMAIN || from[0].includes('<') !== from[0].endsWith('>')) {
    return null;
  }

  if (
    entries.some(
      ({ name, value }) =>
        name.startsWith('resent-') ||
        name.startsWith('x-forwarded-') ||
        (name === 'arc-seal' && !/^i=1\s*;/i.test(value))
    )
  ) {
    return null;
  }

  const results = entries.filter(
    (h) => h.name === 'authentication-results' && /^mx\.google\.com\s*;/i.test(h.value)
  );

  if (results.length !== 1) {
    return null;
  }

  const result = results[0];

  // A Google SMTP receiver must appear before its result. We fail closed when the
  // direct delivery trace is missing, because that means the message cannot be
  // tied to a trusted Google relay path.
  const position = entries.indexOf(result);
  if (!entries.slice(0, position).some((h) => h.name === 'received' && /\bby mx\.google\.com\s/i.test(h.value))) {
    return null;
  }

  // Strip RFC comments before interpreting method/property tokens. Nested comments
  // and quoted strings are treated as suspicious rather than being loosely parsed.
  const uncommented = result.value.replace(/\([^()]*\)/g, '');
  if (/[()"\\]/.test(uncommented)) {
    return null;
  }

  const methods = uncommented
    .split(';')
    .slice(1)
    .map((part) => part.trim())
    .filter(Boolean);

  const dmarc = methods.filter((part) => /^dmarc\s*=/i.test(part));
  if (dmarc.length !== 1 || !/^dmarc=pass(?:\s|$)/i.test(dmarc[0])) {
    return null;
  }

  const domains = [...dmarc[0].matchAll(/\bheader\.from=([^\s;]+)/gi)];
  if (domains.length !== 1 || domains[0][1].toLowerCase() !== DOMAIN) {
    return null;
  }

  return {
    version: VERIFICATION_VERSION,
    status: 'verified',
  };
};

export const isVerifiedEdition = (edition) =>
  edition.verification?.version === VERIFICATION_VERSION &&
  edition.verification?.status === 'verified';
