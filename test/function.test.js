import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/analyze-receipt.js';

// The function must load as an ES module: package.json declares "type": "module"
// and Cloudflare Pages loads it as ESM — a CommonJS `exports.handler` would
// throw at load time and break every deploy.
test('the function loads as an ES module and exports onRequest', () => {
  assert.equal(typeof onRequest, 'function');
});

// Pages Functions take a context ({ request, env, params, ... }) and return a
// web Response — unlike the Netlify (event, context) -> { statusCode, body }
// shape. `env: {}` models the deployed env with no secrets set.
const call = (method, body) =>
  onRequest({
    request: new Request(
      'https://example.com/api/analyze-receipt',
      body === undefined ? { method } : { method, body },
    ),
    env: {},
  });

test('OPTIONS returns the preflight response', async () => {
  const res = await call('OPTIONS');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/);
  assert.deepEqual(await res.json(), { message: 'Preflight OK' });
});

test('a non-POST method is refused with 405', async () => {
  const res = await call('GET');
  assert.equal(res.status, 405);
  assert.deepEqual(await res.json(), { error: 'Method Not Allowed' });
});

test('a POST without an image or mimeType is refused with 400', async () => {
  const res = await call('POST', '{}');
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /tidak lengkap/);
});

test('a malformed body does not escape the try/catch', async () => {
  const res = await call('POST', 'not json');
  assert.equal(res.status, 500);
});

test('a POST with an image but no API key fails with a 500', async () => {
  const res = await call('POST', JSON.stringify({ image: 'aGk=', mimeType: 'image/jpeg' }));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /OPENROUTER_API_KEY/);
});