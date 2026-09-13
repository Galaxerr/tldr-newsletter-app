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
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
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
