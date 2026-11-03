import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The Epics workbench reads the store's pushed `epics` and `epicItems` (KAN-190, KAN-206): a push
// reaches the bench's reading, narrowed to the Campaign, and nothing asks REST on a push.
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
const node = () => ({ classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {}, setAttribute() {}, addEventListener() {}, append() {}, appendChild() {}, querySelector: () => null });
globalThis.document = { createElement: node, body: node(), head: node(), documentElement: node(), addEventListener() {}, querySelector: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const requests = [];
globalThis.fetch = async (url) => { requests.push(String(url)); return new Response('[]'); };

const { store } = await import('../public/js/store.js');

test('pushed epics reach the Epics reading without a request, narrowed to the Campaign', async () => {
  const surface = await readFile(new URL('../public/js/epics-surface.js', import.meta.url), 'utf8');
  assert.doesNotMatch(surface, /team-controller/, 'the surface does not ride the Team push');
  assert.doesNotMatch(surface, /request\(`\/api\/work-items\?|request\('\/api\/work-items'/, 'no list request: only a pressed item\u2019s reading and a status change ask the server');
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
  ], items: [{ id: 'w9', title: 'Under Alpha', status: 'In Review', epic: 'w1', campaign_id: 'home' }] });
  const after = heard;
  assert.ok(after >= 1);
  assert.deepEqual(read.items('w1').map((item) => item.id), ['w9'], 'an Epic\u2019s items, from the same push');
  assert.deepEqual(read.list().map((epic) => epic.id), ['w1', 'w2'], 'this Campaign’s Epics, by title');
  campaign = '';
  assert.equal(read.list().length, 3, 'no Campaign: every Epic');
  store.receive({ t: 'epics', epics: [
    { id: 'w2', title: 'Zeta', level: 1, campaign_id: 'home' },
    { id: 'w1', title: 'Alpha', level: 1, campaign_id: 'home' },
    { id: 'w3', title: 'Elsewhere', level: 1, campaign_id: 'other' },
  ], items: [{ id: 'w9', title: 'Under Alpha', status: 'In Review', epic: 'w1', campaign_id: 'home' }] });
  assert.equal(heard, after, 'the same push again is no change');
  assert.deepEqual(requests, [], 'nothing was fetched');
  stop();
});

test('the server pushes epics with the rosters, after every roster or work-item write', async () => {
  const [events, index, store_] = await Promise.all(['src/ws/events.ts', 'src/index.ts', 'public/js/store.js']
    .map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
  assert.match(events, /const epics = await feed\.epics\(\)\.catch\(\(\) => undefined\);\s*if \(epics\) publishHeld\(\{ t: 'epics', epics: epics\.epics, items: epics\.items \}\);/);
  assert.match(index, /epics: async \(\) => epicsPush\(await everyItemReading\(\)\)/);
  assert.match(store_, /set\('epicItems', Array\.isArray\(message\.items\) \? message\.items : \[\]\); set\('epics', message\.epics\);/);
});

test('epicsPush: every Epic whole, and every item under one slim, with its Epic and Jira key (KAN-206)', async () => {
  const { epicsPush } = await import('../src/work-items-read.ts');
  const item = (id, level, parent, extra = {}) => ({ id, level, parent, title: id, status: 'To Do', holder: '', kind: 'Task', flagged: false, campaign_id: 'home', external: {}, trail: [{ op: 'create' }], comments: [{ text: 'x' }], ...extra });
  const { epics, items } = epicsPush([
    item('E', 1, null), item('a', 0, 'E', { external: { jira: { id: '1', key: 'KAN-1' } }, holder: 'agent:sam' }), item('s', -1, 'a'), item('loose', 0, null),
  ]);
  assert.deepEqual(epics.map((epic) => epic.id), ['E']);
  assert.deepEqual(items.map((one) => [one.id, one.epic, one.jira, one.holder]), [['a', 'E', 'KAN-1', 'agent:sam'], ['s', 'E', '', '']]);
  assert.ok(items.every((one) => !('trail' in one) && !('comments' in one)), 'no history or comments on the push');
});

test('an Epic pressed opens its worksurface in Tilespace 2: statuses in one row, items as cards, no rail (KAN-206)', async () => {
  const [surface, catalog, doors] = await Promise.all(['public/js/epics-surface.js', 'public/js/workbench-catalog.js', 'public/js/door-workbenches.js']
    .map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
  assert.match(surface, /action: \(\) => workbench\?\.place\?\.\(WORKBENCH_TYPES\.epicRecord, 'workspace2', \{ key: epic\.id \}\)/, 'a pressed Epic opens in Tilespace 2');
  assert.doesNotMatch(surface, /renderDetail|items: statusesOf/, 'no side rail: the stones do not go down a level');
  assert.match(surface, /const shown = new Set\(\['In Review'\]\)/, 'In Review is out on arrival');
  assert.match(surface, /if \(!at\.length && !isOut\) continue;/, 'an empty status is not shown');
  assert.match(surface, /if \(!isOut\) chip\.append\(el\('span', 'epic-count'/, 'the count lives on a hidden status only');
  assert.match(surface, /\/transition`, \{ method: 'POST', json: \{ status \} \}/, 'a status button moves the item');
  assert.doesNotMatch(surface, /renderItemDetail|trail/, 'no history and no Jira fields on the worksurface');
  assert.match(catalog, /WORKBENCH_TYPES\.epicRecord, header: 'surface', className: 'wk-selector-entity', discover: \(_t, e\) => e\.epics\(\)/, 'every Epic is a selector card');
  assert.match(doors, /epics: \(\) => epicOffers\(epicsRead\)/);
  const { statusesOf, holderOfItem } = await import('../public/js/epics-surface.js');
  assert.deepEqual(statusesOf([{ status: 'Blocked' }]), ['To Do', 'In Progress', 'In Review', 'Done', 'Blocked']);
  assert.deepEqual(holderOfItem({ holder: 'team:system' }), { kind: 'team', name: 'system' });
  assert.equal(holderOfItem({ holder: '' }), null);
});
