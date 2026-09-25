// Convert newsletter HTML into plain article data; no source pages are fetched.
import { parse } from 'node-html-parser';
import { normalizeArticleUrl } from './articleIdentity.js';
import { SecurityError } from './securityErrors.js';
import { emitImportDiagnostic } from './importDiagnostics.js';
export const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_TREE_DEPTH = 128;

// Increment after extraction changes that should reparse previously imported editions.
export const PARSER_VERSION = 5;
// Title metadata identifies timed articles and untimed resources such as websites.
const READING_TIME = /\((\d+)\s*min(?:ute)?s?\s*read\)/i;
const CONTENT_TYPE = /\((website|github|tool|video|podcast|paper|sponsor(?:ed)?)\)/i;
// Recognize section labels even when the email uses styled divs rather than headings.
const SECTION = /^(?:headlines(?:\s*&\s*launches)?|big tech\s*&\s*startups|science\s*&\s*futuristic technology|programming(?:,?\s*design)?\s*&\s*data science|articles\s*&\s*tutorials|opinions\s*&\s*advice|launches\s*&\s*tools|deep dives\s*&\s*analysis|engineering\s*&\s*research|news\s*&\s*trends|research\s*&\s*innovation|miscellaneous|quick links|resources|tools|news|research)$/i;
// Newsletter controls delimit content but must never become article entries.
const NAVIGATION = /^(?:sign up|subscribe|unsubscribe|advertise|view (?:online|in browser)|read (?:online|in browser)|manage (?:preferences|subscription)|privacy(?: policy)?|careers|refer a friend)$/i;
// Word boundaries keep Dev and DevOps distinct; unmatched editions default to Tech.
const CATEGORY_RULES = [
  ['AI', /TLDR\s*AI\b/i],
  ['InfoSec', /TLDR\s*(INFORMATION\s*SECURITY|INFOSEC|SECURITY)\b/i],
  ['Hardware', /TLDR\s*(HARDWARE|GADGETS?)\b/i],
  ['Dev', /TLDR\s*(WEB\s*DEV(ELOPER)?|DEV(ELOPER)?|PROGRAMMING)\b/i],
  ['IT', /TLDR\s*(DEVOPS|SYSADMIN|IT)\b/i],
];
// Remove invisible formatting characters and collapse email-layout whitespace.
const cleanText = (text) => text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();

/** Prefer the newsletter sender, then subject, then a short body sample. */
const detectCategoryFromHtml = (root, subject = '', from = '') => {
  for (const text of [from, subject]) {
    const match = CATEGORY_RULES.find(([, pattern]) => pattern.test(text));
    if (match) return match[0];
  }
  const sample = (root.querySelector('body') || root).text.slice(0, 1000);
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(sample))?.[0] || 'Tech';
};

// A duration may sit just outside the anchor, inside its heading.
const titleLabel = (link, title, readText) => {
  const siblings = link.parentNode?.childNodes || [];
  let next = siblings.indexOf(link) + 1;
  // Formatting text nodes do not separate a title from its adjacent metadata.
  // Do not skip elements (including BR) or nonempty summary text.
  while (siblings[next]?.nodeType === 3 && !readText(siblings[next])) next++;
  const following = readText(siblings[next]);
  // A duration can be the next text node instead of part of the clickable title.
  const adjacentLabel = following.match(/^(\(\d+\s*min(?:ute)?s?\s*read\)|\((?:website|github|tool|video|podcast|paper|sponsor(?:ed)?)\))/i);
  if (adjacentLabel) return `${title} ${adjacentLabel[1]}`;
  // Inspect only small title wrappers, never a whole table containing other stories.
  let parent = link.parentNode;
  for (let depth = 0; parent && depth < MAX_TREE_DEPTH && /^(SPAN|STRONG|B|H[1-6]|P)$/.test(parent.tagName || ''); depth++) {
    const label = readText(parent, title.length + 45);
    if (label !== null && (READING_TIME.test(label) || CONTENT_TYPE.test(label))) return label;
    parent = parent.parentNode;
  }
  return title;
};

// Within an editorial section, bold/heading links can identify untimed resources.
// Ordinary inline references in a summary should remain part of that summary.
const isHeadingLink = (link) => {
  if (link.querySelector('h1,h2,h3,h4,strong,b')) return true;
  let parent = link.parentNode;
  while (parent && /^(SPAN|STRONG|B|H[1-4])$/.test(parent.tagName || '')) {
    if (/^(STRONG|B|H[1-4])$/.test(parent.tagName)) return true;
    parent = parent.parentNode;
  }
  return false;
};

/** Collect article boundaries in document order and deduplicate normalized URLs. */
const extractArticles = (root, onDiagnostic) => {
  const articles = new Map();
  const counts = onDiagnostic ? { links: 0, shortTitles: 0, noDuration: 0, invalidUrls: 0, sponsors: 0, navigation: 0, duplicates: 0 } : null;
  // Shared wrappers are inspected once. Keep only lengths for large subtrees so
  // deeply nested layouts do not retain a copy of the newsletter at each level.
  const textCache = new WeakMap();
  const readText = (node, limit = Infinity) => {
    if (!node) return '';
    const cached = textCache.get(node);
    if (!cached) {
      const child = node.childNodes?.length === 1 && node.childNodes[0];
      // A sole element child has identical raw text. Do not concatenate decoded
      // children: HTML entities may be split across nodes in the original markup.
      if (node.nodeType === 1 && node.tagName !== 'BR' && child?.nodeType === 1) {
        const text = readText(child, limit);
        textCache.set(node, textCache.get(child));
        return text;
      }
    }
    if (cached?.length > limit) return null;
    if (cached?.text !== undefined) return cached.text;
    const text = cleanText(node.text || '');
    textCache.set(node, { length: text.length, text: text.length <= 4096 ? text : undefined });
    return text.length <= limit ? text : null;
  };
  // current holds title metadata; summary accumulates only the following text.
  let section = null;
  let current = null;
  let summary = [];

  // Close the current article at a new title/section/footer. Strip metadata that
  // appeared outside the anchor and retain the first nonempty duplicate summary.
  const finish = () => {
    if (current) {
      const text = cleanText(summary.join('')).replace(/^\(\d+\s*min(?:ute)?s?\s*read\)\s*/i, '')
        .replace(/^\((?:website|github|tool|video|podcast|paper)\)\s*/i, '')
        .split(/(?:You (?:received|are receiving) this email|Manage your (?:preferences|subscription)|Unsubscribe from)/i)[0].trim();
      const article = { ...current, summary: text };
      const previous = articles.get(article.id);
      if (previous && counts) counts.duplicates++;
      if (!previous || (!previous.summary && article.summary)) articles.set(article.id, article);
    }
    current = null;
    summary = [];
  };

  // Walk in document order. Container text can contain the whole newsletter,
  // so collect only text between article, section, sponsor and footer boundaries.
  const visit = (node) => {
    // Text nodes have no tag. Only collect them after a valid article has started.
    if (node.nodeType === 3) {
      if (current) summary.push(node.text);
      return;
    }
    const tag = node.tagName || '';
    if (/^(SCRIPT|STYLE|HEAD|FOOTER)$/.test(tag)) {
      if (tag === 'FOOTER') finish();
      return;
    }
    if (/^(H[1-6]|DIV|TD|STRONG|B|P)$/.test(tag) && !node.querySelector('a')) {
      const text = readText(node, 99);
      // Ignore decorative emoji before section names; headings also support new labels.
      const sectionName = text?.replace(/^[^\p{L}]+/u, '');
      if (text && (SECTION.test(sectionName) || /^H[1-6]$/.test(tag))) {
        finish();
        section = sectionName;
        return;
      }
    }
    if (tag === 'A') {
      if (counts) counts.links++;
      const text = readText(node);
      const url = node.getAttribute('href') || '';
      if (NAVIGATION.test(text) || /(?:unsubscribe|manage-preferences)/i.test(url)) {
        if (counts) counts.navigation++;
        finish();
        section = null;
        return;
      }
      const label = titleLabel(node, text, readText);
      const time = label.match(READING_TIME);
      const type = label.match(CONTENT_TYPE);
      const id = normalizeArticleUrl(url);
      if (counts) {
        if (text.length < 8) counts.shortTitles++;
        if (!time) counts.noDuration++;
        if (!id) counts.invalidUrls++;
        if (type && /^sponsor/i.test(type[1])) counts.sponsors++;
      }
      // A marked title starts a boundary even when it is a sponsor or invalid URL,
      // preventing its text from leaking into the previous article's summary.
      if (text.length >= 8 && (time || type || (section && isHeadingLink(node)))) {
        finish();
        if (!time || !id || (type && /^sponsor/i.test(type[1]))) return;
        current = {
          id,
          url,
          title: text.replace(READING_TIME, '').replace(CONTENT_TYPE, '').trim(),
          readingMinutes: time ? Number(time[1]) : null,
          section,
        };
        return;
      }
    }
    // Preserve spaces between block elements while keeping inline sentence text intact.
    const block = /^(DIV|P|TD|TR|TABLE|H[1-6]|LI|BR)$/.test(tag);
    if (block && current) summary.push(' ');
    for (const child of node.childNodes || []) visit(child);
    if (block && current) summary.push(' ');
  };

  // Flush the final article even if no explicit footer closes the newsletter.
  visit(root);
  finish();
  if (counts) emitImportDiagnostic(onDiagnostic, 'PARSER_COUNTS', counts);
  return [...articles.values()];
};

/** Return edition metadata and plain summaries. publishedAt uses milliseconds;
 * display dates are derived by readers; a missing date stays unknown instead of becoming today.
 */
export const parseTLDREmail = (html, subject = '', dateHeader = '', from = '', onDiagnostic) => {
  if (typeof html !== 'string' || html.length > MAX_HTML_BYTES || new TextEncoder().encode(html).length > MAX_HTML_BYTES) {
    throw new SecurityError('LIMIT', { diagnosticCode: 'HTML_SIZE' });
  }
  const root = parse(html);
  // Check the tree iteratively before any recursive .text/querySelector/walk calls.
  const stack = [{ node: root, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop();
    if (++count > 50000) throw new SecurityError('LIMIT', { diagnosticCode: 'HTML_COMPLEXITY' });
    if (depth > MAX_TREE_DEPTH) throw new SecurityError('LIMIT', { diagnosticCode: 'HTML_DEPTH' });
    for (const child of node.childNodes || []) stack.push({ node: child, depth: depth + 1 });
  }
  const timestamp = Date.parse(dateHeader);
  const publishedAt = Number.isFinite(timestamp) ? timestamp : null;
  if (publishedAt === null) emitImportDiagnostic(onDiagnostic, 'DATE_UNKNOWN');
  const articles = extractArticles(root, onDiagnostic);
  const category = detectCategoryFromHtml(root, subject, from);
  if (category === 'Tech') emitImportDiagnostic(onDiagnostic, 'CATEGORY_TECH_DEFAULT');
  return {
    category,
    subject,
    publishedAt,
    parserVersion: PARSER_VERSION,
    articlesCount: articles.length,
    articles,
  };
};
