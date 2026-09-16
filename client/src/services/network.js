import { SecurityError } from './securityErrors.js';

const abortError = () => Object.assign(new Error('Request cancelled'), { name: 'AbortError' });

// The timeout applies to both the network call and the response-body consumption.
// Cancellation rejects the caller and requests transport abort. Whether the
// underlying native transport stops immediately depends on its implementation.
export const fetchWithTimeout = async (
  url,
  options = {},
  { timeoutMs = 20000, maxBytes = 8 * 1024 * 1024 } = {}
) => {
  const controller = new AbortController();
  const upstream = options.signal;
  let rejectAbort;

  const aborted = new Promise((_, reject) => {
    rejectAbort = reject;
  });

  const cancel = () => {
    controller.abort();
    rejectAbort(abortError());
  };

  upstream?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);

  try {
    if (upstream?.aborted) {
      cancel();
    }

    return await Promise.race([
      aborted,
      (async () => {
        if (controller.signal.aborted) {
          throw abortError();
        }

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          redirect: 'error',
        });

        if (Number(response.headers?.get('content-length')) > maxBytes) {
          throw new SecurityError('LIMIT');
        }

        let text;

        if (response.body?.getReader) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let size = 0;
          const chunks = [];

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }

              size += value.byteLength;
              if (size > maxBytes) {
                throw new SecurityError('LIMIT');
              }

              chunks.push(decoder.decode(value, { stream: true }));
            }

            chunks.push(decoder.decode());
            text = chunks.join('');
          } finally {
            await reader.cancel().catch(() => {});
          }
        } else {
          // Some React Native fetch implementations buffer the whole body before
          // exposing it, so we validate the final text size before accepting it.
          text = await response.text();
          if (text.length > maxBytes || new TextEncoder().encode(text).length > maxBytes) {
            throw new SecurityError('LIMIT');
          }
        }

        if (controller.signal.aborted) {
          throw abortError();
        }

        let body;
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          // Proxies and expired sessions can return HTML instead of JSON. Keep
          // error status available so the caller can still retry a 401 once.
          if (response.ok) {
            throw new SecurityError('NETWORK', { status: response.status });
          }
          body = {};
        }

        return {
          ok: response.ok,
          status: response.status,
          json: async () => body,
        };
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener('abort', cancel);
    controller.abort();
  }
};
