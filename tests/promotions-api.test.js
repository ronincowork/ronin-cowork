// GET /api/promotions/:id/live (KAN-311): live is a complete promotion whose restart ran ok and
// whose health passed; a --no-restart promotion is promoted, not live.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const { registerPromotions, isLive, isPromotionId } = await import('../src/routes/promotions-api.ts');

test('isLive and isPromotionId', () => {
  assert.equal(isLive({ state: 'complete', restart: { ok: true }, health: { passed: true } }), true);
  assert.equal(isLive({ state: 'complete' }), false, '--no-restart');
  assert.equal(isLive({ state: 'complete', restart: { ok: true }, health: { passed: false } }), false);
  assert.equal(isLive({ state: 'reverted', restart: { ok: true }, health: { passed: true } }), false);
  assert.equal(isLive(null), false);
  assert.equal(isPromotionId('20261106T192055Z-promote-system-urwt'), true);
  assert.equal(isPromotionId('../../etc/passwd'), false);
});

test('the route answers from the receipt, refuses a bad id, and 404s a missing one', async () => {
  const receipts = {
    '20261106T192055Z-promote-system-urwt': { state: 'complete', restart: { ok: true }, health: { passed: true } },
    '20261106T074025Z-promote-system-by73': { state: 'complete' },
  };
  const app = express();
  registerPromotions(app, async (id) => receipts[id] ?? null);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/promotions`;
  try {
    const live = await (await fetch(`${base}/20261106T192055Z-promote-system-urwt/live`)).json();
    assert.equal(live.live, true);
    const quiet = await (await fetch(`${base}/20261106T074025Z-promote-system-by73/live`)).json();
    assert.deepEqual([quiet.live, quiet.restarted], [false, false]);
    assert.equal((await fetch(`${base}/..%2Fx/live`)).status, 400);
    assert.equal((await fetch(`${base}/20260101T000000Z-promote-x-none/live`)).status, 404);
  } finally { server.close(); }
});
