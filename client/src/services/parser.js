// src/services/parser.js
import { parse } from 'node-html-parser';

/**
 * Rileva la categoria analizzando l'HTML interno dell'email
 */
export const detectCategoryFromHtml = (root, subject = '') => {
  const bodyTextUpper = root.querySelector('body')?.text.slice(0, 1000).toUpperCase() || '';
  const subjectUpper = subject.toUpperCase();
  const fullContentSample = `${subjectUpper} ${bodyTextUpper}`;

  if (fullContentSample.includes('TLDR AI')) return 'AI';
  if (fullContentSample.includes('TLDR INFORMATION SECURITY') || fullContentSample.includes('TLDR SECURITY')) return 'InfoSec';
  if (fullContentSample.includes('TLDR WEB DEV') || fullContentSample.includes('TLDR DEV') || fullContentSample.includes('TLDR PROGRAMMING')) return 'Dev';
  if (fullContentSample.includes('TLDR IT') || fullContentSample.includes('TLDR DEVOPS') || fullContentSample.includes('TLDR SYSADMIN')) return 'IT';

  return 'Tech';
};

/**
 * Analizza l'email ed estrae ESCLUSIVAMENTE le sezioni provviste di minutaggio di lettura
 */
export const parseTLDREmail = (html, subjectHeader = '', dateHeader = '') => {
  const root = parse(html);
  const category = detectCategoryFromHtml(root, subjectHeader);
  const articles = [];

  const elements = root.querySelectorAll('td, div');

  elements.forEach((el) => {
    const a = el.querySelector('a');
    if (!a) return;

    const title = a.text.trim();
    const url = a.getAttribute('href');
    const fullElementText = el.text.trim();

    // Cerca il minutaggio esplicito (es. "(3 minute read)", "(2 min read)")
    const timeMatch = title.match(/\((\d+\s*min(?:ute)?s?\s*read)\)/i) || 
                      fullElementText.match(/\((\d+\s*min(?:ute)?s?\s*read)\)/i);

    // SE NON È PRESENTE IL MINUTAGGIO, LA SEZIONE VIENE IGNORATA
    if (!timeMatch) return;

    // Filtro di sicurezza per escludere link generici o di servizio
    if (title && url && title.length > 8 && !url.includes('unsubscribe') && !url.includes('sponsor')) {
      const readingTime = timeMatch[1];
      
      // Pulizia del testo da titolo e minutaggio
      const summaryText = fullElementText
        .replace(title, '')
        .replace(timeMatch[0], '')
        .trim();

      const cleanTitle = title
        .replace(/\(\d+\s*min(?:ute)?s?\s*read\)/i, '')
        .trim();

      articles.push({
        id: url + Math.random(),
        title: cleanTitle,
        summary: summaryText.slice(0, 200) + '...',
        url,
        readingTime,
      });
    }
  });

  const uniqueArticles = Array.from(new Map(articles.map((item) => [item.url, item])).values());

  return {
    category,
    subject: subjectHeader,
    date: dateHeader ? new Date(dateHeader).toLocaleDateString('it-IT') : 'Oggi',
    articlesCount: uniqueArticles.length,
    articles: uniqueArticles,
  };
};