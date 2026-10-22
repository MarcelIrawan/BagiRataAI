import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/analyze-receipt.js';

// The function must load as an ES module: package.json declares "type": "module",
// so a CommonJS `exports.handler` would throw at load time and break every deploy.
test('the function loads as an ES module and exports handler', () => {
  assert.equal(typeof handler, 'function');
});

test('OPTIONS returns the preflight response', async () => {
  const res = await handler({ httpMethod: 'OPTIONS', body: null }, {});
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['Access-Control-Allow-Methods'], /POST/);
  assert.deepEqual(JSON.parse(res.body), { message: 'Preflight OK' });
});

test('a non-POST method is refused with 405', async () => {
  const res = await handler({ httpMethod: 'GET', body: null }, {});
  assert.equal(res.statusCode, 405);
  assert.deepEqual(JSON.parse(res.body), { error: 'Method Not Allowed' });
});

test('a POST without an image or mimeType is refused with 400', async () => {
  const res = await handler({ httpMethod: 'POST', body: '{}' }, {});
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /tidak lengkap/);
});

test('a malformed body does not escape the try/catch', async () => {
  const res = await handler({ httpMethod: 'POST', body: 'not json' }, {});
  assert.equal(res.statusCode, 500);
});
