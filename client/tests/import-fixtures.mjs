export const html = '<h2>News</h2><a href="https://example.com/ai?utm_source=fixture">Synthetic café research (3 min read)</a><p>Résumé 🚀.</p>';
export const headers = () => [
  { name: 'Received', value: 'from synthetic.example by mx.google.com with ESMTPS' },
  { name: 'Authentication-Results', value: 'mx.google.com; dkim=pass header.i=@tldrnewsletter.com header.b=AbC/123+; dmarc=pass header.from=tldrnewsletter.com' },
  { name: 'From', value: 'TLDR AI <fixture@tldrnewsletter.com>' },
  { name: 'Subject', value: 'Synthetic AI edition' },
  { name: 'Date', value: 'Wed, 23 Sep 2026 12:00:00 GMT' },
];
export const body = (source = html) => ({ data: Buffer.from(source).toString('base64url'), size: Buffer.byteLength(source) });
export const part = (source = html) => ({ mimeType: 'text/html', body: body(source) });
export const message = (payload = part()) => ({ id: 'synthetic-message', internalDate: String(Date.UTC(2026, 8, 23, 12)),
  payload: { ...payload, headers: [...headers(), ...(payload.headers || [])] } });
export const session = () => ({ getToken: async () => 'synthetic-access', assertActive() {}, onAuthError() {}, signal: new AbortController().signal });
export const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
export const mockMessage = (t, value, attachments = {}) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/messages')) return json({ messages: [{ id: value.id }] });
    requests.push(url.pathname);
    if (url.pathname.includes('/attachments/')) return json(attachments[url.pathname.split('/').at(-1)]);
    return json(value);
  });
  return requests;
};
