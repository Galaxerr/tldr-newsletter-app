import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { PARSER_VERSION } from '../src/services/parser.js';

export const NOW = Date.UTC(2026, 8, 21, 12);

export const makeEdition = (id, overrides = {}) => ({
  id,
  subject: `Synthetic edition ${id}`,
  category: 'Tech',
  receivedAt: NOW,
  publishedAt: NOW,
  parserVersion: PARSER_VERSION,
  verification: { version: 1, status: 'verified' },
  articlesCount: 1,
  articles: [{
    id: `https://example.com/${id}`,
    url: `https://example.com/${id}`,
    title: `Synthetic article ${id}`,
    summary: 'An entirely synthetic newsletter summary.',
    readingMinutes: 3,
    section: 'News',
  }],
  ...overrides,
});

export const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { data.set(key, value); },
    async removeItem(key) { data.delete(key); },
    async getAllKeys() { return [...data.keys()]; },
    async multiGet(keys) { return keys.map((key) => [key, data.get(key) ?? null]); },
    async multiSet(entries) { entries.forEach(([key, value]) => data.set(key, value)); },
    async multiRemove(keys) { keys.forEach((key) => data.delete(key)); },
  };
};

export const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Exercise the repository's encrypted-record contract without loading Expo native
// modules. This adapter does not validate Expo's device implementation of AES.
export const testCrypto = () => ({
  revision: randomUUID,
  generateKey: async () => randomBytes(32).toString('hex'),
  createSession(encodedKey) {
    const key = Buffer.from(encodedKey, 'hex');
    let active = true;
    const check = () => { if (!active) throw new Error('Disposed test cipher'); };
    return {
      async encrypt(value, name) {
        check();
        const nonce = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', key, nonce);
        cipher.setAAD(Buffer.from(name));
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64');
      },
      async decrypt(value, name) {
        check();
        const bytes = Buffer.from(value, 'base64');
        const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
        cipher.setAAD(Buffer.from(name));
        cipher.setAuthTag(bytes.subarray(12, 28));
        return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
      },
      dispose() { active = false; },
    };
  },
});
