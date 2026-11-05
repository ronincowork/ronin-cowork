import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('the Cloud account card sits under the Services card and reads /api/account alone', async () => {
  const card = await read('public/js/account-card.js');
  const settings = await read('public/js/machine-settings.js');
  assert.match(settings, /card = servicesCard\(body\);\n[^\n]*\n\s*account\?\.stop\(\);\n\s*account = accountCard\(body\);/);
  // The activation stage is labelled as activation, not subscription.
  assert.match(settings, /t\('settei\.services_activation', 'Services activation'\), st\.subscription/);
  assert.doesNotMatch(settings, /t\('settei\.subscription'/);
  // Read-only: one GET, no method, no other route.
  assert.deepEqual([...new Set(card.match(/\/api\/[a-z/]+/g))], ['/api/account']);
  assert.doesNotMatch(card, /method:|fetch\(/);
});

test('every account state is shown in its own words; only an absent part hides the card', async () => {
  const { accountModel } = await import('../public/js/account-card.js');
  assert.deepEqual(accountModel({ ok: false, status: 404 }), { hidden: true });
  const facts = {
    account: { account_id: 'acc_1', display_name: 'Glen', user_id: 'glen' },
    office: { office_id: 'dohyo-unified', entitlement_id: 'ent_1', mapped_at: null },
    subscription: { status: 'trial', plan: 'House models', changed_at: '2026-11-05T01:00:00Z' },
  };
  const ok = (data) => accountModel({ ok: true, status: 200, data });
  const current = ok({ state: 'current', read_at: '2026-11-05T02:00:00Z', facts,
    usage: { state: 'current', calls: 3, tracked_since: '2026-11-05T00:00:00Z', by_model: [{ model: 'openai/gpt-6-luna', calls: 3, usage_unknown_calls: 1, input_tokens: 10, output_tokens: 5 }] } });
  assert.equal(current.title, 'Connected');
  assert.deepEqual(current.rows.map((r) => r[1]), ['Glen (glen)', 'dohyo-unified', 'Trial · House models', '2026-11-05 01:00']);
  assert.equal(current.usage.known, true); assert.equal(current.usage.models.length, 1);
  // Unknown status is Unknown, never Active; unknown usage is never zero.
  const odd = ok({ state: 'current', read_at: 'x', facts: { ...facts, subscription: { status: 'gold', plan: null, changed_at: null } }, usage: { state: 'unknown', reason: 'ids_differ' } });
  assert.equal(odd.rows[2][1], 'Unknown'); assert.equal(odd.usage.known, false); assert.doesNotMatch(odd.usage.text, /\b0\b/);
  const words = (state, extra = {}) => ok({ state, read_at: 'x', usage: { state: 'unknown', reason: 'no_account' }, ...extra });
  assert.equal(words('not_activated').title, 'Not connected');
  assert.equal(words('not_mapped').title, 'No Cloud account');
  assert.match(words('refused', { code: 'office_mismatch' }).blurb, /office_mismatch/);
  const down = words('hq_unavailable');
  assert.equal(down.title, 'Ronin HQ unavailable'); assert.deepEqual(down.rows, []);
  for (const m of [words('not_activated'), words('not_mapped'), words('refused'), down]) {
    assert.equal(m.hidden, undefined); assert.equal(m.usage, null);
    assert.equal(m.rows.some((r) => /Active/.test(r[1])), false);
  }
  const stale = words('hq_unavailable', { last_known: { read_at: '2026-11-05T01:30:00Z', facts } });
  assert.match(stale.blurb, /Showing what HQ said at 2026-11-05 01:30; it may have changed/);
  assert.equal(stale.usage, null);
  // A failing operator is said, not hidden.
  const broken = accountModel({ ok: false, status: 500, message: 'boom' });
  assert.equal(broken.hidden, undefined); assert.equal(broken.blurb, 'boom');
});
