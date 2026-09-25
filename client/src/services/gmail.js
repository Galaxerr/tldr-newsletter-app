// Gmail transport: fetch email HTML and deliver parsed editions in durable batches.
// Local persistence is supplied by the caller through onPage, keeping this service reusable.
import { parseTLDREmail, MAX_HTML_BYTES } from './parser.js';
import { fetchWithTimeout } from './network.js';
import { verifyNewsletter } from './messageTrust.js';
import { SecurityError } from './securityErrors.js';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TLDR_QUERY = 'from:(@tldrnewsletter.com) -in:spam -in:trash';
// Limit simultaneous full-message requests; the listing page can contain 50 IDs.
const BATCH_SIZE = 6;

// Preserve HTTP failures as errors rather than treating them as an empty inbox.
const gmailGet = async (session, path) => {
  // Refresh the account-bound token exactly once on 401, never on rate limits.
  let token = await session.getToken();
  for (let attempt = 0; attempt < 2; attempt++) {
    session.assertActive();
    const response = await fetchWithTimeout(`${GMAIL_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: session.signal,
    });
    session.assertActive();
    if (response.status === 401 && attempt === 0) {
      token = await session.getToken(token);
      continue;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const reasons = [...(Array.isArray(body?.error?.errors) ? body.error.errors : []),
        ...(Array.isArray(body?.error?.details) ? body.error.details : [])];
      const scopeDenied = reasons.some((entry) =>
        ['insufficientPermissions', 'authError', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'].includes(entry?.reason));
      const denied = response.status === 401 || (response.status === 403 && scopeDenied);
      if (denied) session.onAuthError();
      const error = new SecurityError(denied ? 'SESSION' : 'NETWORK', { status: response.status });
      throw error;
    }
    return response.json();
  }
};

/** Iteratively inspect MIME parts, bounding both depth and total work. */
const findBodyPart = (payload, mimeType) => {
  const stack = [{ part: payload, depth: 0 }];
  let count = 0;
  let found = null;
  while (stack.length) {
    const { part, depth } = stack.pop();
    if (!part) continue;
    if (++count > 1000 || depth > 32) throw new SecurityError('LIMIT');
    if (part.mimeType === 'message/rfc822') continue;
    if (!found && part.mimeType === mimeType && (part.body?.data || part.body?.attachmentId)) found = part;

    const children = part.parts || [];
    if (!Array.isArray(children) || children.length + stack.length + count > 1000) {
      throw new SecurityError('LIMIT');
    }

    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ part: children[i], depth: depth + 1 });
    }
  }
  return found;
};

// Gmail uses URL-safe base64, often without padding. Decode bytes as UTF-8 so
// accented characters and emoji survive; atob alone produces a byte string.
const decodeBase64Url = (data) => {
  const maxEncodedLength = Math.ceil(MAX_HTML_BYTES / 3) * 4;
  if (typeof data !== 'string' || data.length > maxEncodedLength || !/^[A-Za-z0-9_=-]*$/.test(data)) {
    throw new SecurityError('LIMIT');
  }

  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_HTML_BYTES) throw new SecurityError('LIMIT');
  return new TextDecoder('utf-8').decode(bytes);
};

/** Return a parsed edition or a rejection category for import progress. */
const fetchMessage = async (token, messageId) => {
  let message;
  try {
    message = await gmailGet(token, `/messages/${encodeURIComponent(messageId)}?format=full&fields=id,internalDate,payload`);
  } catch (error) {
    // A message can disappear between listing its ID and fetching its body.
    if (error.status === 404) return { skipped: 'unsupported' };
    if (error.code === 'LIMIT') return { skipped: 'oversized' };
    throw error;
  }
  // Header names are case-insensitive. This reader imports HTML, not plain text.
  const headers = message?.payload?.headers;
  const header = (name) => Array.isArray(headers)
    ? headers.find((entry) => typeof entry?.name === 'string' && entry.name.toLowerCase() === name)?.value || ''
    : '';
  const verification = verifyNewsletter(headers, header('subject'));
  if (!verification) return { skipped: 'unverified' };
  let part;
  try {
    part = findBodyPart(message.payload, 'text/html');
  } catch {
    return { skipped: 'oversized' };
  }
  if (!part) return { skipped: 'unsupported' };
  if (part.body.size > MAX_HTML_BYTES) return { skipped: 'oversized' };
  // Gmail may store the HTML body separately and return only its attachment ID.
  let body;
  try {
    body = part.body.data ? part.body : await gmailGet(token, `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}?fields=data,size`);
  } catch (error) {
    if (error.code === 'LIMIT') return { skipped: 'oversized' };
    throw error;
  }
  if (!body.data) return { skipped: 'unsupported' };
  let parsed;
  try {
    parsed = parseTLDREmail(decodeBase64Url(body.data), header('subject'), header('date'), header('from'));
  } catch (error) {
    return { skipped: error.code === 'LIMIT' ? 'oversized' : 'unsupported' };
  }
  if (!parsed.articlesCount) return { skipped: 'unsupported' };
  // Preserve receipt time for ordering; the parser keeps publication date separately.
  const receivedAt = Number(message.internalDate) || parsed.publishedAt || 0;
  return { ...parsed, verification, id: messageId, receivedAt };
};

// Both cached-message revalidation and ordinary pages use the same accounting.
// A failed request rejects its batch; the caller never commits a partial batch.
const fetchBatch = async (token, ids, progress) => {
  const results = await Promise.all(ids.map((id) => fetchMessage(token, id)));
  const editions = [];

  for (const result of results) {
    if (result.skipped) {
      progress.skipped++;
      progress.rejected[result.skipped]++;
    } else {
      editions.push(result);
    }
  }

  progress.imported += editions.length;
  return editions;
};

const deliverPage = async (token, onPage, editions, progress) => {
  // A logout/account switch invalidates even responses already received.
  token.assertActive();
  await onPage(editions, { ...progress, rejected: { ...progress.rejected } });
};

/**
 * Import a fixed [after, before) window expressed in epoch seconds.
 * Await persistence of each batch before moving on, making retries resumable.
 * Network/storage errors stop the import; content rejections increment skipped.
 */
export const importNewsletters = async ({ token, after, before, knownIds = new Set(), revalidateIds = [], onPage }) => {
  // Gmail's after boundary is exclusive; subtract one second to include our start.
  const query = `${TLDR_QUERY} after:${after - 1} before:${before}`;
  const progress = { imported: 0, skipped: 0, rejected: { unverified: 0, oversized: 0, unsupported: 0 } };
  const visitedPages = new Set();
  const seenMessages = new Set(knownIds);
  let pageToken = '';

  // The store explicitly selects saved or recent records that need revalidation.
  const pending = [...new Set(revalidateIds)].filter((id) => !seenMessages.has(id));
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const ids = pending.slice(i, i + BATCH_SIZE);
    const editions = await fetchBatch(token, ids, progress);
    ids.forEach((id) => seenMessages.add(id));
    await deliverPage(token, onPage, editions, progress);
  }

  do {
    const params = `q=${encodeURIComponent(query)}&maxResults=50&fields=messages(id),nextPageToken${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const page = await gmailGet(token, `/messages?${params}`);
    if (!page || (page.messages !== undefined && !Array.isArray(page.messages)) ||
      (page.nextPageToken !== undefined && typeof page.nextPageToken !== 'string')) {
      throw new SecurityError('NETWORK');
    }

    const ids = [];
    for (const message of page.messages || []) {
      if (typeof message?.id !== 'string' || !message.id) throw new SecurityError('NETWORK');
      if (seenMessages.has(message.id)) continue;
      seenMessages.add(message.id);
      ids.push(message.id);
    }

    // Commit each completed batch; a later failure cannot discard earlier downloads.
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const editions = await fetchBatch(token, ids.slice(i, i + BATCH_SIZE), progress);
      await deliverPage(token, onPage, editions, progress);
    }

    pageToken = page.nextPageToken || '';
    if (pageToken && visitedPages.has(pageToken)) throw new SecurityError('NETWORK');
    visitedPages.add(pageToken);
  } while (pageToken);

  return progress;
};
