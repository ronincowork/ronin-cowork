import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('the Office and account card sits under the Services card and reads /api/office and /api/account alone', async () => {
  const card = await read('public/js/account-card.js');
  const settings = await read('public/js/machine-settings.js');
  assert.match(settings, /card = servicesCard\(body\);\n[^\n]*\n\s*account\?\.stop\(\);\n\s*account = accountCard\(body\);/);
  // The activation stage is labelled as activation, not subscription.
  assert.match(settings, /t\('settei\.services_activation', 'Services activation'\), st\.subscription/);
  assert.doesNotMatch(settings, /t\('settei\.subscription'/);
  // Read-only: one GET, no method, no other route.
  assert.deepEqual([...new Set(card.match(/\/api\/[a-z/]+/g))].sort(), ['/api/account', '/api/office']);
  assert.doesNotMatch(card, /method:|fetch\(/);
});

test('the Cloud Account is its own worksurface in the Settings selector, Machine Settings group', async () => {
  const [catalog, view] = await Promise.all([read('public/js/workbench-catalog.js'), read('public/js/campaign-view.js')]);
  assert.match(catalog, /campaignCloudAccount: 'campaign\.cloud-account'/);
  assert.match(catalog, /campaign\(WORKBENCH_TYPES\.campaignCloudAccount, 'surface', \(\) => t\('campaign_view\.cloud_account', 'Cloud Account'\)/);
  // Offered right after Machine, so it sits under the Machine Settings heading.
  assert.match(catalog, /WORKBENCH_PROFILES\.campaign, \[WORKBENCH_TYPES\.terminal, WORKBENCH_TYPES\.campaignMachine, WORKBENCH_TYPES\.campaignCloudAccount,/);
  // Built from the same card; reread each time it is shown; an absent part is said, not blank.
  assert.match(view, /campaignCloudAccount: \(\) => \{[\s\S]{0,600}accountCard\(el, \{ absent: /);
  assert.match(view, /if \(card\) void card\.load\(\)/);
  // Placement: a 'surface' type must hand the Workbench an element that carries the standard
  // surface header, or placing it throws ("did not use its surface Workbench header") — what
  // 91014cdf did. The card sits in createSurface's content and surface.el is what is returned.
  const builder = view.slice(view.indexOf('campaignCloudAccount: () => {'), view.indexOf('campaignCreate:'));
  assert.match(builder, /WorkspaceKit\.primitives\.createSurface\(\{ label: t\('campaign_view\.cloud_account', 'Cloud Account'\)/);
  assert.match(builder, /surface\.content\.append\(el\)/);
  assert.match(builder, /return \{ el: surface\.el, show:/);
  assert.doesNotMatch(builder, /return \{ el, show:/);
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
  assert.equal(words('not_hosted').title, 'No Ronin HQ account');
  assert.equal(words('office_unreadable').title, 'Office record unreadable');
  assert.equal(words('not_mapped').title, 'No Cloud account');
  assert.match(words('refused', { code: 'office_mismatch' }).blurb, /office_mismatch/);
  const down = words('hq_unavailable');
  assert.equal(down.title, 'Ronin HQ unavailable'); assert.deepEqual(down.rows, []);
  for (const m of [words('not_activated'), words('not_hosted'), words('not_mapped'), words('refused'), down]) {
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

test('the Office section says self-hosted or office_park from the office record, and a differing office_id is said', async () => {
  const { officeModel, officeAgreement, accountModel } = await import('../public/js/account-card.js');
  const self = officeModel({ ok: true, status: 200, data: { hosting: 'self_hosted', host: 'dohyo-unified' } });
  assert.equal(self.title, 'Self-hosted'); assert.deepEqual(self.rows, [['machine', 'dohyo-unified']]); assert.equal(self.office_id, null);
  const record = { office_id: 'glen', office_park: 'oh-1', gateway_office: 'http://10.0.0.2:4912', provisioned_at: '2026-11-06T09:00:00Z' };
  const hosted = officeModel({ ok: true, status: 200, data: { hosting: 'office_unit', record } });
  assert.equal(hosted.title, 'Hosted office'); assert.equal(hosted.office_id, 'glen');
  assert.deepEqual(hosted.rows.map((r) => r[1]), ['glen', 'oh-1', 'http://10.0.0.2:4912', '2026-11-06 09:00']);
  const wrong = officeModel({ ok: true, status: 200, data: { hosting: 'unreadable', error: 'office_id must be letters' } });
  assert.equal(wrong.title, 'Office record unreadable'); assert.match(wrong.blurb, /office_id must be letters/); assert.notEqual(wrong.title, 'Self-hosted');
  assert.equal(officeModel({ ok: false, status: 500, message: 'boom' }).blurb, 'boom');
  // Agreement on the one shared value.
  const facts = { account: { account_id: 'a', display_name: null, user_id: 'glen' }, office: { office_id: 'glen', entitlement_id: null, mapped_at: null }, subscription: { status: 'none', plan: null, changed_at: null } };
  const current = accountModel({ ok: true, status: 200, data: { state: 'current', read_at: 'x', facts, usage: { state: 'unknown', reason: 'no_usage_ids' } } });
  assert.equal(officeAgreement(hosted, current), null);
  assert.match(officeAgreement(hosted, { ...current, office_id: 'other' }), /mapped to office other; the office record says glen/);
  assert.equal(officeAgreement(self, current), null, 'self-hosted carries no office_id to disagree with');
});
