// Gmail transport: fetch email HTML and deliver parsed editions in durable batches.
// Local persistence is supplied by the caller through onPage, keeping this service reusable.
import { parseTLDREmail, MAX_HTML_BYTES } from './parser.js';
import { fetchWithTimeout } from './network.js';
import { verifyNewsletter } from './messageTrust.js';
import { SecurityError } from './securityErrors.js';
import { diagnosticReason, emitImportDiagnostic } from './importDiagnostics.js';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TLDR_QUERY = 'from:(@tldrnewsletter.com) -in:spam -in:trash';
// Limit simultaneous full-message requests; the listing page can contain 50 IDs.
const BATCH_SIZE = 6;
const MAX_HTML_CANDIDATES = 8;

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
const findBodyParts = (payload, report) => {
  const stack = [{ part: payload, depth: 0 }];
  let count = 0;
  const found = [];
  let htmlParts = 0;
  while (stack.length) {
    const { part, depth } = stack.pop();
    if (!part) continue;
    if (++count > 1000 || depth > 32) throw new SecurityError('LIMIT', { diagnosticCode: 'MIME_LIMIT' });
    const type = typeof part.mimeType === 'string' ? part.mimeType.toLowerCase() : '';
    if (type === 'message/rfc822') { emitImportDiagnostic(report, 'MIME_ENCAPSULATED'); continue; }
    if (type === 'text/html') {
      htmlParts++;
      if (part.body?.data || part.body?.attachmentId) found.push(part);
    }

    const children = part.parts || [];
    if (!Array.isArray(children)) throw new SecurityError('LIMIT', { diagnosticCode: 'MIME_SHAPE' });
    if (children.length + stack.length + count > 1000) throw new SecurityError('LIMIT', { diagnosticCode: 'MIME_LIMIT' });

    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ part: children[i], depth: depth + 1 });
    }
  }
  return { parts: found, htmlParts };
};

// Gmail uses URL-safe base64, often without padding. Decode bytes as UTF-8 so
// accented characters and emoji survive; atob alone produces a byte string.
const decodeBase64Url = (data) => {
  const maxEncodedLength = Math.ceil(MAX_HTML_BYTES / 3) * 4;
  if (typeof data !== 'string') throw new SecurityError('LIMIT', { diagnosticCode: 'BODY_BASE64_INVALID' });
  if (data.length > maxEncodedLength) throw new SecurityError('LIMIT', { diagnosticCode: 'BODY_SIZE' });
  if (!/^[A-Za-z0-9_=-]*$/.test(data)) throw new SecurityError('LIMIT', { diagnosticCode: 'BODY_BASE64_INVALID' });

  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  let bytes;
  try { bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) => c.charCodeAt(0)); }
  catch { throw new SecurityError('SYNC', { diagnosticCode: 'BODY_BASE64_INVALID' }); }
  if (bytes.length > MAX_HTML_BYTES) throw new SecurityError('LIMIT', { diagnosticCode: 'BODY_SIZE' });
  return { html: new TextDecoder('utf-8').decode(bytes), bytes: bytes.length };
};

/** Return a parsed edition or a rejection category for import progress. */
const fetchMessage = async (token, messageId, onDiagnostic) => {
  const report = onDiagnostic ? (code, details) => emitImportDiagnostic(onDiagnostic, code, { ...details, messageId }) : undefined;
  const skip = (skipped, code) => { emitImportDiagnostic(report, code); return { skipped }; };
  let message;
  try {
    message = await gmailGet(token, `/messages/${encodeURIComponent(messageId)}?format=full&fields=id,internalDate,payload`);
  } catch (error) {
    // A message can disappear between listing its ID and fetching its body.
    if (error.status === 404) return skip('unsupported', 'MESSAGE_GONE');
    if (error.code === 'LIMIT') return skip('oversized', 'TRANSPORT_LIMIT');
    emitImportDiagnostic(report, diagnosticReason(error), { status: error.status });
    throw error;
  }
  emitImportDiagnostic(report, 'MESSAGE_FETCHED', { receivedAt: Number(message?.internalDate) });
  // Header names are case-insensitive. This reader imports HTML, not plain text.
  const headers = message?.payload?.headers;
  const header = (name) => Array.isArray(headers)
    ? headers.find((entry) => typeof entry?.name === 'string' && entry.name.toLowerCase() === name)?.value || ''
    : '';
  const verification = verifyNewsletter(headers, header('subject'), report);
  if (!verification) return { skipped: 'unverified' };
  if (!header('subject')) emitImportDiagnostic(report, 'SUBJECT_MISSING');
  let candidates;
  try {
    candidates = findBodyParts(message.payload, report);
  } catch (error) {
    return skip('oversized', diagnosticReason(error, 'MIME_SHAPE'));
  }
  if (!candidates.parts.length) return skip('unsupported', candidates.htmlParts ? 'MIME_HTML_NO_BODY' : 'MIME_NO_HTML');
  emitImportDiagnostic(report, 'MIME_CANDIDATES', { count: candidates.parts.length });
  let processedBytes = 0;
  // Keep the first usable body in document order. Fall back ONLY after an
  // article-free parse, never after trust, transport, decoding or safety failure.
  for (const [candidate, part] of candidates.parts.slice(0, MAX_HTML_CANDIDATES).entries()) {
    if (part.body.size > MAX_HTML_BYTES) return skip('oversized', 'BODY_SIZE');
    // Gmail may store the HTML body separately and return only its attachment ID.
    let body;
    try {
      if (!part.body.data) emitImportDiagnostic(report, 'HTML_ATTACHMENT', { candidate });
      body = part.body.data ? part.body : await gmailGet(token, `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}?fields=data,size`);
    } catch (error) {
      if (error.code === 'LIMIT') return skip('oversized', 'TRANSPORT_LIMIT');
      emitImportDiagnostic(report, diagnosticReason(error), { status: error.status });
      throw error;
    }
    if (!body?.data) return skip('unsupported', 'BODY_MISSING');
    if (body.size > MAX_HTML_BYTES) return skip('oversized', 'BODY_SIZE');
    let parsed;
    try {
      const decoded = decodeBase64Url(body.data);
      processedBytes += decoded.bytes;
      if (processedBytes > MAX_HTML_BYTES) return skip('oversized', 'BODY_SIZE');
      if (report) {
        const contentType = Array.isArray(part.headers) && part.headers.find((entry) => typeof entry?.name === 'string' && entry.name.toLowerCase() === 'content-type')?.value;
        const charset = typeof contentType === 'string' && contentType.match(/charset\s*=\s*"?([^;\s"]+)/i)?.[1].toLowerCase();
        if (charset && !['utf-8', 'utf8', 'us-ascii'].includes(charset)) emitImportDiagnostic(report, 'BODY_NON_UTF8_CHARSET', { candidate });
        if (decoded.html.includes('\uFFFD')) emitImportDiagnostic(report, 'BODY_UTF8_REPLACEMENT', { candidate });
      }
      parsed = parseTLDREmail(decoded.html, header('subject'), header('date'), header('from'), report);
    } catch (error) {
      return skip(error.code === 'LIMIT' ? 'oversized' : 'unsupported', diagnosticReason(error, 'PARSER_ERROR'));
    }
    if (!parsed.articlesCount) { emitImportDiagnostic(report, 'HTML_CANDIDATE_EMPTY', { candidate }); continue; }
    // Preserve receipt time for ordering; the parser keeps publication date separately.
    const receivedAt = Number(message.internalDate) || parsed.publishedAt || 0;
    if (!Number(message.internalDate)) emitImportDiagnostic(report, 'RECEIVED_DATE_FALLBACK');
    emitImportDiagnostic(report, 'EDITION_PARSED', { count: parsed.articlesCount, category: parsed.category, receivedAt });
    return { ...parsed, verification, id: messageId, receivedAt };
  }
  return skip(candidates.parts.length > MAX_HTML_CANDIDATES ? 'oversized' : 'unsupported',
    candidates.parts.length > MAX_HTML_CANDIDATES ? 'MIME_CANDIDATE_LIMIT' : 'PARSER_NO_ARTICLES');
};

// Both cached-message revalidation and ordinary pages use the same accounting.
// A failed request rejects its batch; the caller never commits a partial batch.
const fetchBatch = async (token, ids, progress, report) => {
  let results;
  try { results = await Promise.all(ids.map((id) => fetchMessage(token, id, report))); }
  catch (error) {
    ids.forEach((messageId) => emitImportDiagnostic(report, 'BATCH_ABORTED', { messageId }));
    throw error;
  }
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

const deliverPage = async (token, onPage, editions, progress, report) => {
  // A logout/account switch invalidates even responses already received.
  try {
    token.assertActive();
    await onPage(editions, { ...progress, rejected: { ...progress.rejected } });
    editions.forEach(({ id: messageId }) => emitImportDiagnostic(report, 'DELIVERY_COMPLETED', { messageId }));
  } catch (error) {
    editions.forEach(({ id: messageId }) => emitImportDiagnostic(report, diagnosticReason(error, 'PERSIST_FAILED'), { messageId }));
    throw error;
  }
};

/**
 * Import a fixed [after, before) window expressed in epoch seconds.
 * Await persistence of each batch before moving on, making retries resumable.
 * Network/storage errors stop the import; content rejections increment skipped.
 */
export const importNewsletters = async ({ token, after, before, knownIds = new Set(), revalidateIds = [], onPage, onDiagnostic }) => {
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
    const editions = await fetchBatch(token, ids, progress, onDiagnostic);
    ids.forEach((id) => seenMessages.add(id));
    await deliverPage(token, onPage, editions, progress, onDiagnostic);
  }

  do {
    const params = `q=${encodeURIComponent(query)}&maxResults=50&fields=messages(id),nextPageToken${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    let page;
    try { page = await gmailGet(token, `/messages?${params}`); }
    catch (error) { emitImportDiagnostic(onDiagnostic, diagnosticReason(error), { status: error.status }); throw error; }
    if (!page || (page.messages !== undefined && !Array.isArray(page.messages)) ||
      (page.nextPageToken !== undefined && typeof page.nextPageToken !== 'string')) {
      emitImportDiagnostic(onDiagnostic, 'LIST_INVALID');
      throw new SecurityError('NETWORK');
    }
    emitImportDiagnostic(onDiagnostic, 'LIST_PAGE', { count: page.messages?.length || 0 });

    const ids = [];
    for (const message of page.messages || []) {
      if (typeof message?.id !== 'string' || !message.id) {
        emitImportDiagnostic(onDiagnostic, 'LIST_INVALID');
        throw new SecurityError('NETWORK');
      }
      if (seenMessages.has(message.id)) {
        emitImportDiagnostic(onDiagnostic, knownIds.has(message.id) ? 'KNOWN_MESSAGE' : 'DUPLICATE_MESSAGE', { messageId: message.id });
        continue;
      }
      seenMessages.add(message.id);
      ids.push(message.id);
    }

    // Commit each completed batch; a later failure cannot discard earlier downloads.
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const editions = await fetchBatch(token, ids.slice(i, i + BATCH_SIZE), progress, onDiagnostic);
      await deliverPage(token, onPage, editions, progress, onDiagnostic);
    }

    pageToken = page.nextPageToken || '';
    if (pageToken && visitedPages.has(pageToken)) {
      emitImportDiagnostic(onDiagnostic, 'LIST_PAGE_CYCLE');
      throw new SecurityError('NETWORK');
    }
    visitedPages.add(pageToken);
  } while (pageToken);

  return progress;
};
