/**
 * The request contract's pure half (public/js/request.js `shapeResult`): what any
 * feature may assume about "what happened". The fetch half needs a browser and a
 * server and belongs to smoke-ui; the SHAPE is what everything downstream leans on.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { shapeResult } from '../public/js/request.js';

test('success carries decoded data; an empty body is an empty object, not a failure', () => {
  assert.deepEqual(shapeResult(200, true, { a: 1 }), { ok: true, status: 200, data: { a: 1 } });
  assert.deepEqual(shapeResult(204, true, null), { ok: true, status: 204, data: {} });
});

test("an HTTP failure speaks the server's error field when it sent one", () => {
  const r = shapeResult(409, false, { error: 'name taken' });
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'http');
  assert.equal(r.message, 'name taken');
  assert.equal(r.retryable, false, 'a 4xx re-sent unchanged is still wrong');
});

test('an HTTP failure with no body still names the status', () => {
  const r = shapeResult(502, false, null);
  assert.equal(r.message, 'HTTP 502');
  assert.equal(r.retryable, true, '5xx may pass on a retry');
});

test('429 is retryable — it is the server asking for later, not saying no', () => {
  assert.equal(shapeResult(429, false, {}).retryable, true);
});
