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
  const files = ['services-card.js', 'services-activation.js', 'machine-settings.js'];
  for (const f of files) {
    const src = await readFile(new URL('../public/js/' + f, import.meta.url), 'utf8');
    // `shapeResult` publishes ok | status | data | kind | message | retryable. Anything
    // else read off a request() result is a name that will be `undefined` forever.
    const bad = [...src.matchAll(/\br\.(\w+)/g)].map((m) => m[1])
      .filter((k) => !['ok', 'status', 'data', 'kind', 'message', 'retryable'].includes(k));
    assert.deepEqual(bad, [], `${f} reads ${bad.join(', ')} off a request result`);
  }
});

/**
 * THE FETCH HALF, from the defect it had.
 *
 * `res.json().catch(() => null)` folded two different answers into one: a body that was
 * legitimately empty, and a body that was there and could not be read. Both came back as
 * ok with {}, so every caller that treats emptiness as a real state believed it — the
 * owner's phone said "No transcript output yet." while the server was sending 637 records.
 *
 * This half needs no browser, only a fetch to stand in for one.
 */
import { request } from '../public/js/request.js';

const answer = ({ status = 200, ok = status < 400, body = '', throws = null }) => {
  globalThis.fetch = async () => ({
    status,
    ok,
    text: async () => { if (throws) throw new Error(throws); return body; },
  });
};

test('a 200 whose body did not arrive whole is a failure, and a retryable one', async () => {
  answer({ body: '{"records":[{"seq":1,"text":"half a rec' });
  const r = await request('/api/sessions/agent/transcript');
  assert.equal(r.ok, false, 'not success-with-nothing: the body was there and unreadable');
  assert.equal(r.kind, 'malformed');
  assert.equal(r.retryable, true, 'the next read usually gets it');
  assert.equal(r.status, 200);
});

test('a 200 that genuinely said nothing is still success', async () => {
  answer({ body: '' });
  assert.deepEqual(await request('/api/whatever'), { ok: true, status: 200, data: {} });
});

test('a 200 with a whole body is untouched', async () => {
  answer({ body: '{"records":[{"seq":1}],"view":"chat"}' });
  const r = await request('/api/sessions/agent/transcript');
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.records, [{ seq: 1 }]);
  assert.equal(r.data.view, 'chat');
});

test('a body that cannot be read at all is the same kind of failure', async () => {
  answer({ throws: 'decode failed' });
  const r = await request('/api/sessions/agent/transcript');
  assert.equal(r.ok, false);
  assert.equal(r.kind, 'malformed');
  assert.equal(r.retryable, true);
});

test('a failed status keeps its own story, whatever shape the body was in', async () => {
  // A proxy returning an HTML error page must not be reported as a malformed success.
  answer({ status: 502, body: '<html>Bad Gateway</html>' });
  const r = await request('/api/home');
  assert.equal(r.kind, 'http', 'the 502 is the story, not the page it came with');
  assert.equal(r.message, 'HTTP 502');
  assert.equal(r.retryable, true);
});

test("a server error's own words still reach the caller", async () => {
  answer({ status: 409, body: '{"error":"name taken"}' });
  const r = await request('/api/sessions');
  assert.equal(r.kind, 'http');
  assert.equal(r.message, 'name taken');
});


