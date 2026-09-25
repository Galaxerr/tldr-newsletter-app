// Convert newsletter HTML into plain article data; no source pages are fetched.
import { parse } from 'node-html-parser';
import { normalizeArticleUrl } from './articleIdentity.js';
import { SecurityError } from './securityErrors.js';
export const MAX_HTML_BYTES = 2 * 1024 * 1024;

// Increment after extraction changes that should reparse previously imported editions.
export const PARSER_VERSION = 4;
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
  for (const text of [from, subject, (root.querySelector('body') || root).text.slice(0, 1000)]) {
    const match = CATEGORY_RULES.find(([, pattern]) => pattern.test(text));
    if (match) return match[0];
  }
  return 'Tech';
};

// A duration may sit just outside the anchor, inside its heading.
const titleLabel = (link) => {
  const title = cleanText(link.text);
  const siblings = link.parentNode?.childNodes || [];
  const following = cleanText(siblings[siblings.indexOf(link) + 1]?.text || '');
  // A duration can be the next text node instead of part of the clickable title.
  const adjacentLabel = following.match(/^(\(\d+\s*min(?:ute)?s?\s*read\)|\((?:website|github|tool|video|podcast|paper|sponsor(?:ed)?)\))/i);
  if (adjacentLabel) return `${title} ${adjacentLabel[1]}`;
  // Inspect only small title wrappers, never a whole table containing other stories.
  let parent = link.parentNode;
  while (parent && /^(SPAN|STRONG|B|H[1-6]|P)$/.test(parent.tagName || '')) {
    const label = cleanText(parent.text);
    if (label.length <= title.length + 45 && (READING_TIME.test(label) || CONTENT_TYPE.test(label))) return label;
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
const extractArticles = (root) => {
  const articles = new Map();
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
    const text = cleanText(node.text || '');
    // Ignore decorative emoji before section names; headings also support new labels.
    const sectionName = text.replace(/^[^\p{L}]+/u, '');
    if (/^(H[1-6]|DIV|TD|STRONG|B|P)$/.test(tag) && text.length > 0 && text.length < 100 &&
      (SECTION.test(sectionName) || /^H[1-6]$/.test(tag)) && !node.querySelector('a')) {
      finish();
      section = sectionName;
      return;
    }
    if (tag === 'A') {
      const url = node.getAttribute('href') || '';
      if (NAVIGATION.test(text) || /(?:unsubscribe|manage-preferences)/i.test(url)) {
        finish();
        section = null;
        return;
      }
      const label = titleLabel(node);
      const time = label.match(READING_TIME);
      const type = label.match(CONTENT_TYPE);
      const id = normalizeArticleUrl(url);
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
  return [...articles.values()];
};

/** Return edition metadata and plain summaries. publishedAt uses milliseconds;
 * date is its display label; a missing date stays unknown instead of becoming today.
 */
export const parseTLDREmail = (html, subject = '', dateHeader = '', from = '') => {
  if (typeof html !== 'string' || html.length > MAX_HTML_BYTES || new TextEncoder().encode(html).length > MAX_HTML_BYTES) throw new SecurityError('LIMIT');
  const root = parse(html);
  // Check the tree iteratively before any recursive .text/querySelector/walk calls.
  const stack = [{ node: root, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop();
    if (++count > 50000 || depth > 128) throw new SecurityError('LIMIT');
    for (const child of node.childNodes || []) stack.push({ node: child, depth: depth + 1 });
  }
  const timestamp = Date.parse(dateHeader);
  const publishedAt = Number.isFinite(timestamp) ? timestamp : null;
  const articles = extractArticles(root);
  return {
    category: detectCategoryFromHtml(root, subject, from),
    subject,
    from,
    publishedAt,
    date: publishedAt !== null ? new Date(publishedAt).toLocaleDateString('en-US') : 'Date unavailable',
    parserVersion: PARSER_VERSION,
    articlesCount: articles.length,
    articles,
  };
};
