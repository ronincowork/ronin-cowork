import test from 'node:test';
import assert from 'node:assert/strict';
import { progressiveSurface } from '../public/js/progressive-surface.js';

globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Linux x86_64' }, configurable: true });

let release;
globalThis.fetch = () => new Promise((resolve) => { release = resolve; });
const { campaignById, loadCampaigns, normalizeSelection } = await import('../public/js/campaigns.js');

test('the Campaign shell stays loading and repaints every shown surface after a late Campaign read', async () => {
  let selected = null;
  const surfaces = ['Campaign', 'Agent defaults', 'Routines'].map((name) => {
    const state = { text: '' };
    const surface = progressiveSurface({
      loading: () => { state.text = 'Loading Campaign…'; },
      paint: () => { state.text = `${name}: ${selected.title}`; },
    });
    return { state, surface };
  });

  for (const { surface } of surfaces) surface.show();
  assert.deepEqual(surfaces.map(({ state }) => state.text), Array(3).fill('Loading Campaign…'));
  assert.ok(surfaces.every(({ state }) => !state.text.includes('No Campaign selected')));

  const arriving = loadCampaigns().then(() => {
    const remembered = { mode: 'selected', campaign_ids: ['gone'], primary_campaign_id: 'gone' };
    const selection = normalizeSelection(remembered);
    selected = campaignById(selection.primary_campaign_id);
    for (const { surface } of surfaces) surface.settle();
  });
  release({
    ok: true,
    status: 200,
    json: async () => ({ campaigns: [{ id: 'home', title: 'Ronin Home', state: 'active' }] }),
  });
  await arriving;

  assert.deepEqual(surfaces.map(({ state }) => state.text), [
    'Campaign: Ronin Home',
    'Agent defaults: Ronin Home',
    'Routines: Ronin Home',
  ]);
});

test('a surface created after the Campaign arrived paints at once — it is settled before it is shown', () => {
  // The workbench creates a surface when it is PLACED. A card clicked onto an open page is
  // created past the one settle() of enter(); the Campaign page settles it at creation.
  const state = { text: '' };
  const surface = progressiveSurface({
    loading: () => { state.text = 'Loading Campaign…'; },
    paint: () => { state.text = 'Routines and Installs: Ronin Home'; },
  });
  surface.settle();
  surface.show();
  assert.equal(state.text, 'Routines and Installs: Ronin Home');
});
