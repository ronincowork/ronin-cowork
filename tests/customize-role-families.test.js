import test from 'node:test';
import assert from 'node:assert/strict';
import { familyMembership, toggledMembership, saveFamilyMembership } from '../public/js/customize-role-families-core.js';

test('null membership is an empty family and toggles remain unique', () => {
  assert.deepEqual(familyMembership({ session_roles: null }), []);
  assert.deepEqual(familyMembership({ session_roles: ['CutCode', 'CutCode', null] }), ['CutCode']);
  assert.deepEqual(toggledMembership({ session_roles: null }, 'CutCode'), ['CutCode']);
  assert.deepEqual(toggledMembership({ session_roles: ['CutCode', 'CheckWork'] }, 'CutCode'), ['CheckWork']);
});

test('membership save sends only the typed family field', async () => {
  let call;
  const send = async (url, options) => {
    call = { url, options };
    return { ok: true, data: { session_roles: ['CutCode'] } };
  };
  const saved = await saveFamilyMembership({ name: 'developer', session_roles: [] }, 'CutCode', send);
  assert.deepEqual(call, {
    url: '/api/role-families/developer/session_roles',
    options: { method: 'PUT', json: { session_roles: ['CutCode'] } },
  });
  assert.equal(saved.result.ok, true);
});

test('pinned-lead refusal remains the server message and does not mutate local membership', async () => {
  const family = { name: 'developer', session_roles: ['QuarterBack', 'CutCode'], default_lead_role: 'QuarterBack' };
  const message = '"QuarterBack" is developer’s default_lead_role — it stays pinned on this shelf.';
  const saved = await saveFamilyMembership(family, 'QuarterBack', async () => ({ ok: false, message }));
  assert.deepEqual(saved.next, ['CutCode']);
  assert.equal(saved.result.message, message);
  assert.deepEqual(family.session_roles, ['QuarterBack', 'CutCode']);
});
