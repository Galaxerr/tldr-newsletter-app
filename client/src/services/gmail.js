// Gmail transport: fetch email HTML and deliver parsed editions one page at a time.
// Local persistence is supplied by the caller through onPage, keeping this service reusable.
import { parseTLDREmail } from './parser.js';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TLDR_QUERY = '(from:dan@tldrnewsletter.com OR subject:TLDR)';
// Limit simultaneous full-message requests; the listing page can contain 50 IDs.
const BATCH_SIZE = 6;

/** Bound the fetch request to 20 seconds; also used to verify the selected Gmail mailbox. */
export const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    // Release the timer on success and failure so it cannot abort a later operation.
    clearTimeout(timeout);
  }
};

// Preserve HTTP failures as errors rather than treating them as an empty inbox.
const gmailGet = async (authorization, path) => {
  // Strings remain supported for isolated transport tests; the app supplies a
  // session-bound token source. Refresh exactly once on 401, never on rate limits.
  const session = typeof authorization === 'string' ? null : authorization;
  let token = session ? await session.getToken() : authorization;
  for (let attempt = 0; attempt < 2; attempt++) {
    session?.assertActive();
    const response = await fetchWithTimeout(`${GMAIL_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    session?.assertActive();
    if (response.status === 401 && session && attempt === 0) {
      token = await session.getToken(token);
      continue;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const denied = response.status === 401 || (response.status === 403 &&
        (body.error?.errors?.some(({ reason }) => reason === 'insufficientPermissions' || reason === 'authError') ||
          body.error?.details?.some(({ reason }) => reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')));
      if (denied) session?.onAuthError();
      const error = new Error(denied
        ? 'Accesso Gmail scaduto o non autorizzato. Accedi nuovamente da Account.'
        : `Gmail non disponibile (${response.status}). Riprova; verifica che Gmail API sia attiva nel progetto Google.`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
};

/** Recursively find a MIME body, including HTML nested inside multipart messages. */
export const findBodyPart = (payload, mimeType) => {
  if (!payload) return null;
  if (payload.mimeType === mimeType && (payload.body?.data || payload.body?.attachmentId)) return payload;
  for (const part of payload.parts || []) {
    const found = findBodyPart(part, mimeType);
    if (found) return found;
  }
  return null;
};

// Gmail uses URL-safe base64, often without padding. Decode bytes as UTF-8 so
// accented characters and emoji survive; atob alone produces a byte string.
export const decodeBase64Url = (data) => {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
};

/** Fetch one edition. null means deleted, unsupported or unparseable content. */
const fetchMessage = async (token, messageId) => {
  let message;
  try {
    message = await gmailGet(token, `/messages/${messageId}?format=full`);
  } catch (error) {
    // A message can disappear between listing its ID and fetching its body.
    if (error.status === 404) return null;
    throw error;
  }
  // Header names are case-insensitive. This reader imports HTML, not plain text.
  const headers = message.payload?.headers || [];
  const header = (name) => headers.find((h) => h.name.toLowerCase() === name)?.value || '';
  const part = findBodyPart(message.payload, 'text/html');
  if (!part) return null;
  // Gmail may store the HTML body separately and return only its attachment ID.
  const body = part.body.data ? part.body : await gmailGet(token, `/messages/${messageId}/attachments/${part.body.attachmentId}`);
  if (!body.data) return null;
  let parsed;
  try {
    parsed = parseTLDREmail(decodeBase64Url(body.data), header('subject'), header('date'), header('from'));
  } catch {
    return null; // Malformed content is reported as skipped; HTTP failures still propagate.
  }
  if (!parsed.articlesCount) return null;
  // Preserve receipt time for ordering; the parser keeps publication date separately.
  const receivedAt = Number(message.internalDate) || parsed.publishedAt || 0;
  return { ...parsed, id: messageId, receivedAt };
};

/**
 * Import a fixed [after, before) window expressed in epoch seconds.
 * knownIds contains editions the library already has at the current parser version.
 * Await onPage(editions, { imported, skipped }) before requesting another page.
 * Network/storage errors stop the import; unsupported content increments skipped.
 */
export const importNewsletters = async ({ token, after, before, knownIds = new Set(), onPage }) => {
  // Gmail's after boundary is exclusive; subtract one second to include our start.
  const query = `${TLDR_QUERY} after:${after - 1} before:${before}`;
  let pageToken = '';
  let imported = 0;
  let skipped = 0;
  // Guard both repeated pagination tokens and duplicate IDs across result pages.
  const visitedPages = new Set();
  const seenMessages = new Set(knownIds);
  do {
    const params = `q=${encodeURIComponent(query)}&maxResults=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const page = await gmailGet(token, `/messages?${params}`);
    const messages = (page.messages || []).filter(({ id }) => {
      if (seenMessages.has(id)) return false;
      seenMessages.add(id);
      return true;
    });
    // Finish this page in bounded batches; a failed batch prevents page delivery.
    const newsletters = [];
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const results = await Promise.all(messages.slice(i, i + BATCH_SIZE).map(({ id }) => fetchMessage(token, id)));
      newsletters.push(...results.filter(Boolean));
      skipped += results.filter((result) => !result).length;
    }
    // Commit the completed page before moving forward, making retries resumable.
    imported += newsletters.length;
    // A logout/account switch invalidates results already in flight.
    if (typeof token !== 'string') token.assertActive();
    await onPage(newsletters, { imported, skipped });
    pageToken = page.nextPageToken || '';
    if (pageToken && visitedPages.has(pageToken)) throw new Error('Paginazione Gmail interrotta. Riprova.');
    visitedPages.add(pageToken);
  } while (pageToken);
  return { imported, skipped };
};
