// src/services/gmail.js
import { parseTLDREmail } from './parser';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TLDR_QUERY = 'from:dan@tldrnewsletter.com OR subject:TLDR';
const CATEGORY_KEYS = ['Tech', 'AI', 'InfoSec', 'Dev', 'IT', 'Hardware'];
const CATEGORY_BATCH_SIZE = 6; // quante email in parallelo per volta

// --- Helper di basso livello -----------------------------------------

const gmailGet = async (accessToken, path) => {
  const res = await fetch(`${GMAIL_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok ? res.json() : null;
};

const searchMessages = async (accessToken, query, maxResults) => {
  const data = await gmailGet(
    accessToken,
    `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
  );
  return data?.messages || [];
};

const getHeaderValue = (headers, name) =>
  headers.find((h) => h.name.toLowerCase() === name)?.value;

const getHtmlPart = (payload) => {
  const parts = payload.parts || [payload];
  return parts.find((p) => p.mimeType === 'text/html') || parts[0];
};

// Decodifica base64url -> stringa UTF-8 corretta (evita il vecchio
// trucco escape()/atob(), deprecato e non sempre affidabile con
// caratteri speciali)
const decodeBase64Url = (data) => {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
};

// Recupera un singolo messaggio e lo trasforma in dati parsati.
// Ritorna null se il messaggio non è utilizzabile (fetch fallita,
// nessun HTML, nessun articolo) invece di far fallire tutto il batch.
const fetchAndParseMessage = async (accessToken, messageId) => {
  try {
    const msgData = await gmailGet(accessToken, `/messages/${messageId}?format=full`);
    if (!msgData) return null;

    const headers = msgData.payload.headers || [];
    const subject = getHeaderValue(headers, 'subject') || 'TLDR Newsletter';
    const date = getHeaderValue(headers, 'date') || '';
    const from = getHeaderValue(headers, 'from') || '';

    const htmlPart = getHtmlPart(msgData.payload);
    if (!htmlPart?.body?.data) return null;

    const html = decodeBase64Url(htmlPart.body.data);
    const parsedData = parseTLDREmail(html, subject, date, from);

    if (parsedData.articlesCount === 0) return null;

    return { id: messageId, ...parsedData };
  } catch {
    return null;
  }
};

// --- API pubblica -------------------------------------------------------

export const fetchLatestNewslettersByCategories = async (accessToken) => {
  const messages = await searchMessages(accessToken, TLDR_QUERY, 25);

  if (messages.length === 0) {
    throw new Error('Impossibile recuperare i messaggi da Gmail');
  }

  const categories = {};

  // Elabora le email a gruppi paralleli, fermandosi appena tutte le
  // categorie sono coperte: mantiene l'ottimizzazione "smetti quando hai
  // finito" dell'originale, ma ogni gruppo viene fetchato in parallelo
  // invece che email per email.
  for (let i = 0; i < messages.length; i += CATEGORY_BATCH_SIZE) {
    if (Object.keys(categories).length === CATEGORY_KEYS.length) break;

    const batch = messages.slice(i, i + CATEGORY_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((msg) => fetchAndParseMessage(accessToken, msg.id))
    );

    // L'ordine di "results" rispecchia l'ordine di "batch" (Promise.all
    // preserva l'ordine), quindi la prima email trovata per categoria
    // resta quella più recente, esattamente come nell'originale.
    for (const parsed of results) {
      if (parsed && !categories[parsed.category]) {
        categories[parsed.category] = parsed;
      }
    }
  }

  return CATEGORY_KEYS.map((cat) => categories[cat]).filter(Boolean);
};

export const fetchArchiveNewsletters = async (accessToken) => {
  const query = `(${TLDR_QUERY}) newer_than:7d`;
  const messages = await searchMessages(accessToken, query, 30);

  if (messages.length === 0) return [];

  // Qui vogliamo tutte le newsletter, quindi si fetcha tutto in una
  // volta sola in parallelo, nessun early-exit necessario.
  const results = await Promise.all(
    messages.map((msg) => fetchAndParseMessage(accessToken, msg.id))
  );

  return results.filter(Boolean);
};