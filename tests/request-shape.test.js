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

/**
 * THE OTHER END OF THE CONTRACT — that consumers read the name it actually publishes.
 *
 * `services-card.js` read `r.json`, which `shapeResult` has never produced. On SUCCESS
 * that handed the card's render() `undefined`, which took its "could not reach the
 * operator" branch and returned before building anything — so the ⚙ Services card drew
 * nothing at all, silently, and the only UI caller of POST /api/services/install went
 * with it. A box stranded at `verified` then had no way out of the interface.
 *
 * The shape test above could not catch it: it proves what the producer emits, and the
 * bug was a consumer reading a name nobody emits. So this reads the consumers.
 */
import { readFile } from 'node:fs/promises';

test('no client reads a property the request contract does not publish', async () => {
  const files = ['services-card.js', 'services-activation.js', 'cowork-setup.js', 'settei.js'];
  for (const f of files) {
    const src = await readFile(new URL('../public/js/' + f, import.meta.url), 'utf8');
    // `shapeResult` publishes ok | status | data | kind | message | retryable. Anything
    // else read off a request() result is a name that will be `undefined` forever.
    const bad = [...src.matchAll(/\br\.(\w+)/g)].map((m) => m[1])
      .filter((k) => !['ok', 'status', 'data', 'kind', 'message', 'retryable'].includes(k));
    assert.deepEqual(bad, [], `${f} reads ${bad.join(', ')} off a request result`);
  }
});
