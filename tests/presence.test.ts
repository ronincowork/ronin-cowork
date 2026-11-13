import test from 'node:test';
import assert from 'node:assert/strict';
import type express from 'express';
const { presence, stampInput } = await import('../src/presence.js');

const hit = (method: string) => stampInput({ method } as express.Request, {} as express.Response, () => {});

test('presence counts browsers and stamps only a non-GET request as a person acting', () => {
  assert.deepEqual(presence(), { browsers: 0, last_input_at: null });
  hit('GET'); hit('HEAD');
  assert.equal(presence().last_input_at, null, 'reading is not acting');
  hit('POST');
  const at = presence().last_input_at;
  assert.ok(at && !Number.isNaN(Date.parse(at)), 'an ISO time');
  assert.deepEqual(Object.keys(presence()).sort(), ['browsers', 'last_input_at'], 'no identity');
});
