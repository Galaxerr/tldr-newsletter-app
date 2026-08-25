// src/services/parser.js
import { parse } from 'node-html-parser';

const MIN_TITLE_LENGTH = 8;
const BODY_SAMPLE_LENGTH = 1000;
const READING_TIME_PATTERN = /\((\d+\s*min(?:ute)?s?\s*read)\)/i;

// Regole di categoria: "TLDR" + parola chiave, con boundary per evitare
// falsi positivi (es. "TLDR DEV" non deve matchare dentro "TLDR DEVOPS")
// e \s* per tollerare zero spazi, più spazi o spazi non separabili (\u00A0),
// tutti casi comuni quando il testo viene estratto da tag HTML annidati.
const CATEGORY_RULES = [
  { key: 'AI', pattern: /TLDR\s*AI\b/i },
  { key: 'InfoSec', pattern: /TLDR\s*(INFORMATION\s*SECURITY|INFOSEC|SECURITY)\b/i },
  { key: 'Hardware', pattern: /TLDR\s*(HARDWARE|GADGETS?)\b/i },
  { key: 'Dev', pattern: /TLDR\s*(WEB\s*DEV(ELOPER)?|DEV(ELOPER)?|PROGRAMMING)\b/i },
  { key: 'IT', pattern: /TLDR\s*(DEVOPS|SYSADMIN|IT)\b/i },
];

const matchCategory = (text) => {
  if (!text) return null;
  return CATEGORY_RULES.find(({ pattern }) => pattern.test(text))?.key ?? null;
};

/**
 * Rileva la categoria. Il mittente ("From") è il segnale più affidabile,
 * perché TLDR lo usa per identificare l'edizione (es. "TLDR AI" come
 * display name) — a differenza dell'oggetto, che è il titolo del giorno
 * e non contiene il nome della newsletter. Oggetto e corpo restano come
 * fallback per i casi in cui il mittente non fosse disponibile.
 */
export const detectCategoryFromHtml = (root, subject = '', fromName = '') => {
  const bodySample = root.querySelector('body')?.text.slice(0, BODY_SAMPLE_LENGTH) || '';

  return (
    matchCategory(fromName) ||
    matchCategory(subject) ||
    matchCategory(bodySample) ||
    'Tech'
  );
};

/**
 * Estrae ESCLUSIVAMENTE le sezioni provviste di minutaggio di lettura
 */
const extractArticles = (root) => {
  const articles = [];

  for (const el of root.querySelectorAll('td, div')) {
    const link = el.querySelector('a');
    if (!link) continue;

    const title = link.text.trim();
    const url = link.getAttribute('href');
    const elementText = el.text.trim();

    // Cerca il minutaggio esplicito (es. "(3 minute read)", "(2 min read)")
    const timeMatch = title.match(READING_TIME_PATTERN) || elementText.match(READING_TIME_PATTERN);

    // SE NON È PRESENTE IL MINUTAGGIO, LA SEZIONE VIENE IGNORATA
    if (!timeMatch) continue;

    const isRealArticle =
      title.length > MIN_TITLE_LENGTH &&
      url &&
      !url.includes('unsubscribe') &&
      !url.includes('sponsor');

    if (!isRealArticle) continue;

    const cleanTitle = title.replace(READING_TIME_PATTERN, '').trim();
    const summary = elementText.replace(title, '').replace(timeMatch[0], '').trim();

    articles.push({
      id: url,
      title: cleanTitle,
      summary,
      url,
      readingTime: timeMatch[1],
    });
  }

  // Dedup per url: lo stesso articolo può comparire in più contenitori annidati (td dentro div)
  return Array.from(new Map(articles.map((a) => [a.url, a])).values());
};

export const parseTLDREmail = (html, subjectHeader = '', dateHeader = '', fromHeader = '') => {
  const root = parse(html);
  const category = detectCategoryFromHtml(root, subjectHeader, fromHeader);
  const articles = extractArticles(root);

  return {
    category,
    subject: subjectHeader,
    date: dateHeader ? new Date(dateHeader).toLocaleDateString('it-IT') : 'Oggi',
    articlesCount: articles.length,
    articles,
  };
};