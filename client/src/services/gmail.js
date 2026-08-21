// src/services/gmail.js
import { parseTLDREmail } from './parser';

export const fetchLatestNewslettersByCategories = async (accessToken) => {
  const query = 'from:dan@tldrnewsletter.com OR subject:TLDR';
  const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=25`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchData = await searchRes.json();

  if (!searchRes.ok || !searchData.messages) {
    throw new Error('Impossibile recuperare i messaggi da Gmail');
  }

  const categories = { Tech: null, AI: null, InfoSec: null, Dev: null, IT: null };

  for (const msg of searchData.messages) {
    // Interrompi se abbiamo trovato una mail per tutte e 5 le categorie
    if (Object.values(categories).every((cat) => cat !== null)) break;

    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const msgData = await msgRes.json();

    if (!msgRes.ok) continue;

    // Recupera Oggetto e Data dalle intestazioni
    const headers = msgData.payload.headers || [];
    const subjectHeader = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || 'TLDR Newsletter';
    const dateHeader = headers.find((h) => h.name.toLowerCase() === 'date')?.value || '';

    // Decodifica l'HTML
    const parts = msgData.payload.parts || [msgData.payload];
    const htmlPart = parts.find((p) => p.mimeType === 'text/html') || parts[0];

    if (htmlPart?.body?.data) {
      const base64Data = htmlPart.body.data.replace(/-/g, '+').replace(/_/g, '/');
      const decodedHtml = decodeURIComponent(escape(atob(base64Data)));

      // Delega il parsing al modulo separato
      const parsedData = parseTLDREmail(decodedHtml, subjectHeader, dateHeader);

      // Salva l'email solo se è la più recente trovata per quella specifica categoria
      if (parsedData.articlesCount > 0 && !categories[parsedData.category]) {
        categories[parsedData.category] = {
          id: msg.id,
          ...parsedData,
        };
      }
    }
  }

  // Restituisce solo le categorie che hanno almeno una newsletter associata
  return Object.values(categories).filter(Boolean);
};

export const fetchArchiveNewsletters = async (accessToken) => {
  const query = '(from:dan@tldrnewsletter.com OR subject:TLDR) newer_than:7d';
  const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=30`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchData = await searchRes.json();

  if (!searchRes.ok || !searchData.messages) return [];

  const newsletters = [];

  for (const msg of searchData.messages) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const msgData = await msgRes.json();
    if (!msgRes.ok) continue;

    const headers = msgData.payload.headers || [];
    const subjectHeader = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || 'TLDR Newsletter';
    const dateHeader = headers.find((h) => h.name.toLowerCase() === 'date')?.value || '';

    const parts = msgData.payload.parts || [msgData.payload];
    const htmlPart = parts.find((p) => p.mimeType === 'text/html') || parts[0];

    if (htmlPart?.body?.data) {
      const base64Data = htmlPart.body.data.replace(/-/g, '+').replace(/_/g, '/');
      const decodedHtml = decodeURIComponent(escape(atob(base64Data)));
      const parsedData = parseTLDREmail(decodedHtml, subjectHeader, dateHeader);

      if (parsedData.articlesCount > 0) {
        newsletters.push({
          id: msg.id,
          ...parsedData,
        });
      }
    }
  }

  return newsletters;
};