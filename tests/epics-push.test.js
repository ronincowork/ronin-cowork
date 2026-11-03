import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The Epics workbench reads the store's pushed `epics` (KAN-190): a push reaches the bench's
// reading, narrowed to the Campaign, and nothing asks REST.
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
const node = () => ({ classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {}, setAttribute() {}, addEventListener() {}, append() {}, appendChild() {}, querySelector: () => null });
globalThis.document = { createElement: node, body: node(), head: node(), documentElement: node(), addEventListener() {}, querySelector: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const requests = [];
globalThis.fetch = async (url) => { requests.push(String(url)); return new Response('[]'); };

const { store } = await import('../public/js/store.js');

test('pushed epics reach the Epics reading without a request, narrowed to the Campaign', async () => {
  const surface = await readFile(new URL('../public/js/epics-surface.js', import.meta.url), 'utf8');
  assert.doesNotMatch(surface, /request\(|\/api\/work-items|team-controller/, 'the surface asks the server nothing and does not ride the Team push');
  assert.match(surface, /hear\('epics',/, 'it hears the store’s epics');
  const { createEpicsRead } = await import('../public/js/epics-surface.js');
  let campaign = 'home';
  const read = createEpicsRead(() => campaign);
  let heard = 0;
  const stop = read.subscribe(() => { heard += 1; });
  store.receive({ t: 'epics', epics: [
    { id: 'w2', title: 'Zeta', level: 1, campaign_id: 'home' },
    { id: 'w1', title: 'Alpha', level: 1, campaign_id: 'home' },
    { id: 'w3', title: 'Elsewhere', level: 1, campaign_id: 'other' },
  ] });
  assert.equal(heard, 1);
  assert.deepEqual(read.list().map((epic) => epic.id), ['w1', 'w2'], 'this Campaign’s Epics, by title');
  campaign = '';
  assert.equal(read.list().length, 3, 'no Campaign: every Epic');
  store.receive({ t: 'epics', epics: [
    { id: 'w2', title: 'Zeta', level: 1, campaign_id: 'home' },
    { id: 'w1', title: 'Alpha', level: 1, campaign_id: 'home' },
    { id: 'w3', title: 'Elsewhere', level: 1, campaign_id: 'other' },
  ] });
  assert.equal(heard, 1, 'the same push again is no change');
  assert.deepEqual(requests, [], 'nothing was fetched');
  stop();
});

test('the server pushes epics with the rosters, after every roster or work-item write', async () => {
  const [events, index, store_] = await Promise.all(['src/ws/events.ts', 'src/index.ts', 'public/js/store.js']
    .map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
  assert.match(events, /const epics = await feed\.epics\(\)\.catch\(\(\) => undefined\);\s*if \(epics\) publishHeld\(\{ t: 'epics', epics \}\);/);
  assert.match(index, /epics: async \(\) => \(await everyItemReading\(\)\)\.filter\(\(item\) => item\.level === 1\)/);
  assert.match(store_, /message\.t === 'epics' && Array\.isArray\(message\.epics\)\) set\('epics', message\.epics\)/);
});
