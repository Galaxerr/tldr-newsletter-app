import { SecurityError } from './securityErrors.js';

// Static vocabulary only. No server-supplied error text, headers or MIME names.
export const IMPORT_DIAGNOSTIC_CODES = Object.freeze({
  SYNC_STARTED: ['sync', 'info'], SYNC_COMPLETED: ['sync', 'info'], IMPORT_FAILED: ['sync', 'error'],
  AUTH_PROFILE_MISMATCH: ['account', 'error'], AUTH_SESSION: ['account', 'error'], REQUEST_ABORTED: ['transport', 'error'],
  HTTP_ERROR: ['transport', 'error'], RATE_LIMIT: ['transport', 'error'], TRANSPORT_LIMIT: ['transport', 'rejected'],
  RESPONSE_JSON_INVALID: ['transport', 'error'], SUBJECT_MISSING: ['metadata', 'info'], RECEIVED_DATE_FALLBACK: ['metadata', 'info'],
  LIST_PAGE: ['listing', 'info'], LIST_INVALID: ['listing', 'error'], LIST_PAGE_CYCLE: ['listing', 'error'],
  KNOWN_MESSAGE: ['listing', 'ignored'], DUPLICATE_MESSAGE: ['listing', 'ignored'],
  MESSAGE_FETCHED: ['retrieval', 'info'], MESSAGE_GONE: ['retrieval', 'rejected'],
  TRUST_HEADER_SHAPE: ['verification', 'rejected'], TRUST_HEADER_CONTENT: ['verification', 'rejected'],
  TRUST_FROM_COUNT: ['verification', 'rejected'], TRUST_FROM_MAILBOX: ['verification', 'rejected'],
  TRUST_FORWARDED_SUBJECT: ['verification', 'rejected'], TRUST_FORWARDING_EVIDENCE: ['verification', 'rejected'],
  TRUST_RECEIVER_RESULT_COUNT: ['verification', 'rejected'], TRUST_RECEIVER_TRACE: ['verification', 'rejected'],
  TRUST_RESULT_SYNTAX: ['verification', 'rejected'], TRUST_DMARC_RESULT: ['verification', 'rejected'],
  TRUST_DMARC_DOMAIN: ['verification', 'rejected'], TRUST_VERIFIED: ['verification', 'info'],
  TRUST_DKIM_QUOTE_NORMALIZED: ['verification', 'info'],
  MIME_LIMIT: ['mime', 'rejected'], MIME_SHAPE: ['mime', 'rejected'], MIME_ENCAPSULATED: ['mime', 'ignored'],
  MIME_CANDIDATE_LIMIT: ['mime', 'rejected'],
  MIME_NO_HTML: ['mime', 'rejected'], MIME_HTML_NO_BODY: ['mime', 'rejected'], MIME_CANDIDATES: ['mime', 'info'],
  HTML_ATTACHMENT: ['body', 'info'], BODY_MISSING: ['body', 'rejected'], BODY_SIZE: ['body', 'rejected'],
  BODY_BASE64_INVALID: ['body', 'rejected'], BODY_NON_UTF8_CHARSET: ['body', 'info'], BODY_UTF8_REPLACEMENT: ['body', 'info'],
  HTML_SIZE: ['parser', 'rejected'], HTML_DEPTH: ['parser', 'rejected'], HTML_COMPLEXITY: ['parser', 'rejected'],
  PARSER_ERROR: ['parser', 'rejected'], PARSER_COUNTS: ['parser', 'info'], PARSER_NO_ARTICLES: ['parser', 'rejected'],
  HTML_CANDIDATE_EMPTY: ['parser', 'ignored'], CATEGORY_TECH_DEFAULT: ['recognition', 'info'],
  DATE_UNKNOWN: ['recognition', 'info'], EDITION_PARSED: ['parser', 'info'],
  BATCH_ABORTED: ['delivery', 'error'], DELIVERY_COMPLETED: ['delivery', 'info'],
  EDITION_INVALID: ['validation', 'error'], INDEX_INVALID: ['validation', 'error'],
  PERSIST_STARTED: ['persistence', 'info'], PERSIST_FAILED: ['persistence', 'error'],
  EDITION_COMMITTED: ['persistence', 'info'], RETENTION_DROPPED: ['retention', 'ignored'],
});

export const diagnosticReason = (error, fallback = 'IMPORT_FAILED') => {
  if (error?.name === 'AbortError') return 'REQUEST_ABORTED';
  if (!(error instanceof SecurityError)) return fallback;
  if (Object.hasOwn(IMPORT_DIAGNOSTIC_CODES, error.diagnosticCode)) return error.diagnosticCode;
  if (['SESSION', 'SIGN_IN_REQUIRED'].includes(error.code)) return 'AUTH_SESSION';
  if (error.status === 429) return 'RATE_LIMIT';
  if (error.code === 'NETWORK') return 'HTTP_ERROR';
  if (error.code === 'LIMIT') return 'TRANSPORT_LIMIT';
  return fallback;
};

// Observability must not affect import/verification/persistence behavior.
export const emitImportDiagnostic = (report, code, details = {}) => {
  try { report?.(code, details); } catch { /* A failed inspector is not an import failure. */ }
};

/** Account-owned, in-memory development recorder. Production does not construct it.
 * Raw message IDs are only lookup keys; snapshots expose per-run aliases instead.
 */
export const createImportDiagnostics = () => {
  let generation = 0;
  let recording = false;
  let events = [];
  const messages = new Map();
  let nextMessage = 0;
  const clear = () => { generation++; recording = false; events = []; messages.clear(); nextMessage = 0; };
  const snapshot = () => events.map((event) => ({ ...event }));
  return {
    clear,
    close() { recording = false; },
    snapshot,
    forMessage(id) {
      const alias = messages.get(id);
      return alias ? snapshot().filter((event) => event.message === alias) : [];
    },
    begin() {
      clear();
      recording = true;
      const run = generation;
      return (code, details = {}) => {
        if (!recording || run !== generation || !Object.hasOwn(IMPORT_DIAGNOSTIC_CODES, code)) return;
        const [stage, outcome] = IMPORT_DIAGNOSTIC_CODES[code];
        const event = { code, stage, outcome };
        if (typeof details.messageId === 'string' && details.messageId.length <= 8192) {
          if (!messages.has(details.messageId)) {
            if (messages.size >= 200) messages.delete(messages.keys().next().value);
            messages.set(details.messageId, `message-${++nextMessage}`);
          }
          event.message = messages.get(details.messageId);
        }
        // Explicit scalar allowlist: never spread incoming details into diagnostics.
        for (const key of ['count', 'candidate', 'bytes', 'status', 'links', 'shortTitles', 'noDuration', 'invalidUrls', 'sponsors', 'navigation', 'duplicates']) {
          if (Number.isSafeInteger(details[key]) && details[key] >= 0) event[key] = details[key];
        }
        if (Number.isFinite(details.receivedAt) && details.receivedAt > 0 && details.receivedAt < 8640000000000000) {
          event.receivedDay = new Date(details.receivedAt).toISOString().slice(0, 10);
        }
        if (['Tech', 'AI', 'InfoSec', 'Dev', 'IT', 'Hardware'].includes(details.category)) event.category = details.category;
        events.push(event);
        if (events.length > 300) events.shift();
      };
    },
  };
};
