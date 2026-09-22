/**
 * Shared article identity rule used by parser.js and library.js.
 * Keeping this helper independent avoids parser/library imports depending on
 * each other and ensures deduplication, bookmarks and read state use the same key.
 *
 * Returns a normalized HTTP(S) URL, or null for an invalid/unsupported link.
 * Example: https://example.com/a?utm_source=email&id=7 becomes .../a?id=7.
 * The original URL remains on the article for opening its source.
 */
export const normalizeArticleUrl = (value) => {
  try {
    const target = validateArticleUrl(value);
    if (!target) return null;
    const url = new URL(target.url);
    // Strip only known tracking parameters. IDs, redirect targets and fragments
    // can select different content, so removing them could merge distinct stories.
    // Copy the keys first because deleting parameters mutates the collection.
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    // Relative or malformed links cannot provide a stable article identity.
    return null;
  }
};

// Navigation uses the canonical original URL, without changing article identity.
export const validateArticleUrl = (value) => {
  if (typeof value !== 'string' || value.length > 8192) return null;

  // Do not let URL normalization hide controls, malformed escapes or credentials.
  const hasControls = /[\u0000-\u0020\u007f-\u009f\u202a-\u202e\u2066-\u2069\\]/.test(value);
  const hasEscapedControls = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value);
  const hasMalformedEscape = /%(?![0-9a-f]{2})/i.test(value);
  const authority = value.match(/^https?:\/\/([^/?#]+)/i)?.[1];
  if (hasControls || hasEscapedControls || hasMalformedEscape || !authority || authority.includes('@')) {
    return null;
  }

  try {
    if (!/^https?:\/\//i.test(value)) return null;
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return { url: url.href, hostname: url.hostname, insecure: url.protocol === 'http:' };
  } catch {
    return null;
  }
};
