import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeArticleUrl, validateArticleUrl } from '../src/services/articleIdentity.js';
import { articleId } from '../src/services/library.js';
import { parseTLDREmail } from '../src/services/parser.js';

test('valid article URLs retain canonical destinations and normalized identities', () => {
  const cases = [
    {
      input: 'HTTPS://Example.COM:443/a/../story?utm_source=email&id=7#part',
      canonical: 'https://example.com/story?utm_source=email&id=7#part',
      identity: 'https://example.com/story?id=7#part', hostname: 'example.com', insecure: false,
    },
    {
      input: 'http://Example.COM:80?gclid=one&id=7&id=8&UTM_medium=email&fbclid=two&mc_cid=three&mc_eid=four',
      canonical: 'http://example.com/?gclid=one&id=7&id=8&UTM_medium=email&fbclid=two&mc_cid=three&mc_eid=four',
      identity: 'http://example.com/?id=7&id=8', hostname: 'example.com', insecure: true,
    },
    {
      input: 'https://example.com/story?target=https%3A%2F%2Fother.example%2Fa&id=7#two',
      canonical: 'https://example.com/story?target=https%3A%2F%2Fother.example%2Fa&id=7#two',
      identity: 'https://example.com/story?target=https%3A%2F%2Fother.example%2Fa&id=7#two',
      hostname: 'example.com', insecure: false,
    },
    {
      input: 'https://bücher.example/café', canonical: 'https://xn--bcher-kva.example/caf%C3%A9',
      identity: 'https://xn--bcher-kva.example/caf%C3%A9', hostname: 'xn--bcher-kva.example', insecure: false,
    },
    {
      input: 'http://[::1]:8080/story?utm_source=one&utm_source=two',
      canonical: 'http://[::1]:8080/story?utm_source=one&utm_source=two',
      identity: 'http://[::1]:8080/story', hostname: '[::1]', insecure: true,
    },
  ];
  for (const { input, canonical, identity, hostname, insecure } of cases) {
    assert.deepEqual(validateArticleUrl(input), { url: canonical, hostname, insecure });
    assert.equal(normalizeArticleUrl(input), identity);
    assert.equal(normalizeArticleUrl(identity), identity);
    assert.equal(articleId({ url: input, id: 'outdated-id' }), identity);
  }
});

test('invalid article URLs remain rejected by validation, normalization and parsing', () => {
  const invalid = [
    null, undefined, 42, {}, '', '/relative', '//example.com/story',
    'javascript:alert(1)', 'data:text/plain,story', 'file:///story', 'ftp://example.com/story',
    'https:example.com', 'https://', 'https://[invalid]/', 'https://example.com:99999/',
    'https://user:password@example.com/story', 'https://@example.com/story',
    ' https://example.com/story', 'https://example.com/a b', 'https://example.com/a\nb',
    'https://example.com/\\story', 'https://example.com/\u202estory',
    'https://example.com/%0a', 'https://example.com/%7F', 'https://example.com/%zz',
    'https://example.com/%', 'https://example.com/' + 'x'.repeat(8192),
  ];
  for (const value of invalid) {
    assert.equal(validateArticleUrl(value), null);
    assert.equal(normalizeArticleUrl(value), null);
    if (typeof value === 'string') {
      const source = `<a href="${value}">Invalid article (3 min read)</a><p>Synthetic summary.</p>`;
      assert.deepEqual(parseTLDREmail(source).articles, []);
    }
  }
});

test('legacy article IDs remain the fallback when stored URLs cannot be normalized', () => {
  assert.equal(articleId({ url: 'javascript:invalid', id: 'legacy-bookmark-key' }), 'legacy-bookmark-key');
  assert.equal(articleId({ url: '/relative', id: 'legacy-relative-key' }), 'legacy-relative-key');
});
