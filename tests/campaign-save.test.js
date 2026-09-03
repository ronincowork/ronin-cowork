/**
 * SAVING A CAMPAIGN — the client hits the doors the store actually registers.
 *
 * This exists because it did not. `saveCampaign` sent PATCH /api/campaigns/:id and
 * src/routes/campaigns-api.ts registers PUT only, so every Identity and Desk Profile save
 * 404'd — caught in lead review of hi_20260829101321_654cd9, not by a gate. A method name
 * is exactly the kind of fact a unit test can hold and a type cannot.
 *
 * A gate in BYOIN's sense: no socket, no store, no browser. `fetch` is stubbed and the
 * recorded calls ARE the evidence. The two window globals are stubbed because the module
 * graph reaches state.js, which reads them at import.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };
// node 22 defines navigator as a getter-only global, so it is redefined rather than set.
Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Linux x86_64' }, configurable: true });

const calls = [];
let reply = { ok: true, status: 200, body: {} };
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
  return { ok: reply.ok, status: reply.status, json: async () => reply.body };
};

const { loadCampaigns, saveCampaign, createCampaign, campaignById } = await import('../public/js/campaigns.js');

const RECORD = { id: 'ronin', title: 'Ronin', description: 'Build it.', desk_profile: 'professional', state: 'active' };
/** Put the module in "the store answered" mode, which is the only mode that writes to it. */
async function withStore() {
  reply = { ok: true, status: 200, body: { campaigns: [RECORD] } };
  await loadCampaigns();
  calls.length = 0;
}

test('a successful list is a real list, not the compatibility synthesis', async () => {
  await withStore();
  assert.equal(campaignById('ronin').title, 'Ronin');
});

test('saving edits goes to PUT /api/campaigns/:id — the store registers no PATCH', async () => {
  await withStore();
  await saveCampaign('ronin', { title: 'Ronin Cowork' });
  const write = calls.find((c) => c.method !== 'GET');
  assert.ok(write, 'a save must reach the server');
  assert.equal(write.method, 'PUT');
  assert.equal(write.url, '/api/campaigns/ronin');
  assert.notEqual(write.method, 'PATCH');
});

test('a partial edit stays partial — PUT takes only the keys stated', async () => {
  await withStore();
  await saveCampaign('ronin', { desk_profile: 'home' });
  const write = calls.find((c) => c.method === 'PUT');
  // Naming description or title here would blank whatever this call did not know about.
  assert.deepEqual(write.body, { desk_profile: 'home' });
});

test('an id with a slash in it cannot escape its own path', async () => {
  await withStore();
  await saveCampaign('a/b', { title: 'x' });
  assert.equal(calls.find((c) => c.method === 'PUT').url, '/api/campaigns/a%2Fb');
});

test('a refused save is reported, not swallowed, and the list is not re-read', async () => {
  await withStore();
  reply = { ok: false, status: 404, body: { error: "no Campaign named 'ghost'" } };
  const r = await saveCampaign('ghost', { title: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.message, "no Campaign named 'ghost'");
  assert.equal(calls.filter((c) => c.method === 'GET').length, 0);
});

test('creating posts to the collection and takes the stored record back', async () => {
  await withStore();
  reply = { ok: true, status: 201, body: { ...RECORD, id: 'health', title: 'Health' } };
  const r = await createCampaign({ title: 'Health', description: '', desk_profile: 'home' });
  const post = calls.find((c) => c.method === 'POST');
  assert.equal(post.url, '/api/campaigns');
  assert.equal(r.ok, true);
  assert.equal(r.data.id, 'health');
});
