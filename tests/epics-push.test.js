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

test('epicsPush: every Epic\'s row, and every item under one, with its Epic and Jira key (KAN-206, w418)', async () => {
  const { epicsPush, cardOf } = await import('../src/work-items-read.ts');
  const row = (id, level, parent, extra = {}) => ({ id, level, parent, title: id, status: 'To Do', holder: '', holders: [], kind: 'Task', flagged: false, campaign_id: 'home', links: [], jira: '', hand_ins: [], moved: '', ...extra });
  const { epics, items } = epicsPush([
    row('E', 1, null), row('a', 0, 'E', { jira: 'KAN-1', holder: 'agent:sam' }), row('s', -1, 'a'), row('loose', 0, null),
  ]);
  assert.deepEqual(epics.map((epic) => epic.id), ['E']);
  assert.deepEqual(items.map((one) => [one.id, one.epic, one.jira, one.holder]), [['a', 'E', 'KAN-1', 'agent:sam'], ['s', 'E', '', ''], ['loose', '', '', '']], 'an item under no Epic rides the push with epic \'\' (KAN-414)');
  assert.ok(items.every((one) => !('trail' in one) && !('comments' in one) && !('objective' in one)), 'rows only: no history, comments or objective on the push');
  // w334: what a bar says beyond its row, cut short, from the picked Epic's bodies (epicCards).
  const long = 'word '.repeat(100);
  const one = cardOf({ id: 'b', objective: long, comments: [{ by: 'a', at: '1', text: 'old' }, { by: 'sam', at: '2026-11-06T00:00:00Z', text: long }] });
  assert.ok(one.objective.length <= 281 && one.objective.endsWith('…'));
  assert.equal(one.said.by, 'sam');
  assert.ok(one.said.text.length <= 201);
  assert.equal(one.comment_count, 2);
  const { rowOf } = await import('../src/work-items-index.ts');
  const r = rowOf({ id: 'b', campaign_id: 'home', title: 'b', objective: long, level: 0, kind: 'Task', status: 'To Do', flagged: false, priority: 'Medium', comments: [], parent: 'E', attachments: [], links: [], external: {}, trail: [{ op: 'status', at: '2026-11-06T01:00:00Z' }], created: { at: '1', by: 'x' }, hand_ins: [{ receipt: 'r1', by: 'x', at: '1' }, { receipt: 'r2', by: 'x', at: '2' }] });
  assert.equal(r.moved, '2026-11-06T01:00:00Z');
  assert.deepEqual(r.hand_ins.map((h) => h.receipt), ['r2'], 'the last hand-in only');
  assert.ok(!('objective' in r) && !('trail' in r) && !('comments' in r), 'a row has no objective, trail or comments');
});

test('an Epic is a selector card, its stone drags to a tilespace, and its statuses run in workflow order (KAN-206, w334)', async () => {
  const [surface, catalog, doors] = await Promise.all(['public/js/epics-surface.js', 'public/js/workbench-catalog.js', 'public/js/door-workbenches.js']
    .map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
  assert.match(surface, /event\.dataTransfer\.setData\(SURFACE_DRAG, JSON\.stringify\(\{ type: WORKBENCH_TYPES\.epicRecord, detail: \{ key: epic\.id \} \}\)\)/);
  assert.match(catalog, /WORKBENCH_TYPES\.epicRecord, header: 'surface', className: 'wk-selector-entity', discover: \(_t, e\) => e\.epics\(\)/, 'every Epic is a selector card');
  assert.match(doors, /epics: \(\) => epicOffers\(epicsRead\)/);
  const { statusesOf, holderOfItem } = await import('../public/js/epics-surface.js');
  assert.deepEqual(statusesOf([{ status: 'Blocked' }]), ['To Do', 'In Progress', 'In Review', 'Done', 'Blocked']);
  assert.deepEqual(holderOfItem({ holder: 'team:system' }), { kind: 'team', name: 'system' });
  assert.equal(holderOfItem({ holder: '' }), null);
});

test('teamWork: the Team’s Epics, an Epic held and the Epic above each held item (KAN-232)', async () => {
  const { teamWork } = await import('../src/work-items-read.ts');
  const item = (id, level, parent, extra = {}) => ({ id, level, parent, title: id, status: 'To Do', holder: 'agent:sam', kind: 'Task', flagged: false, campaign_id: 'home', external: {}, trail: [], comments: [], created: { at: '2026-11-01T00:00:00.000Z', by: 'x' }, ...extra });
  const every = [
    item('E1', 1, null), item('E2', 1, null), item('E3', 1, null),
    item('a', 0, 'E1', { status: 'In Review', external: { jira: { id: '1', key: 'KAN-1' } }, trail: [{ op: 'status', to: 'In Review', at: '2026-11-03T00:00:00.000Z' }] }),
    item('b', -1, 'a', { status: 'In Review', trail: [{ op: 'status', to: 'In Review', at: '2026-11-02T00:00:00.000Z' }, { op: 'status', to: 'In Progress', at: '2026-11-02T01:00:00.000Z' }, { op: 'status', to: 'In Review', at: '2026-11-02T02:00:00.000Z' }] }),
    item('c', 0, 'E2', { flagged: true, trail: [{ op: 'flag', to: 'true', at: '2026-11-04T00:00:00.000Z', note: 'needs a key' }] }),
    item('E3', 1, null, { holder: 'team:t' }),
  ];
  const held = ['a', 'b', 'c', 'a'].map((id) => every.find((one) => one.id === id)).concat([every.at(-1)]);
  const { epics, ...rest } = teamWork(held, every);
  assert.deepEqual(rest, {}, 'the Team row carries its Epics only: no waiting reading (KAN-304)');
  assert.deepEqual(epics.sort(), ['E1', 'E2', 'E3'], 'an Epic held, and the Epic above each held item, a subtask included');
});

test('the picked Epic is its own bar, opening to its reading as an item bar does; no Epic status beside the filters (KAN-309, KAN-310)', async () => {
  const surface = await readFile(new URL('../public/js/epics-surface.js', import.meta.url), 'utf8');
  assert.doesNotMatch(surface, /epic_status/, 'the filter row is Assigned and Status only');
  assert.match(surface, /bars\.place\(detail, epic \? \[\{ id: epic\.id, item: epic, children: false \}\] : \[\]\)/, 'the Epic is a bar of the same keyed list, opening as any bar; its children are the board below');
  assert.match(surface, /root\.append\(detail, questions\.el, groups\)/, 'the bar heads the filters');
});

test('the kit\'s keyed list: a row repaints only itself, moves only with its group, an opened row is kept (KAN-412)', async () => {
  const { createKeyedList } = await import('../public/js/workspace-primitives.js');
  // Just enough DOM for the list: children, insertBefore, remove, replaceWith.
  const fake = (name) => { const n = { name, parent: null, childNodes: [],
    insertBefore(child, ref) { child.remove(); const at = ref ? this.childNodes.indexOf(ref) : -1; this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, child); child.parent = this; touched.push(child.name); },
    remove() { if (this.parent) this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1); this.parent = null; },
    replaceWith(other) { const p = this.parent; const i = p.childNodes.indexOf(this); this.remove(); p.childNodes.splice(i, 0, other); other.parent = p; } }; return n; };
  let touched = [];
  let drawn = [];
  const list = createKeyedList({ shows: (row) => row.title, draw: (row) => { drawn.push(row.id); return fake(row.id); } });
  const todo = fake('todo'); const doing = fake('doing');
  const push = (rows) => { touched = []; drawn = []; list.place(todo, rows.filter((r) => r.s === 'todo')); list.place(doing, rows.filter((r) => r.s === 'doing')); list.sweep(); };
  const names = (p) => p.childNodes.map((n) => n.name);
  push([{ id: 'a', title: 'A', s: 'todo' }, { id: 'b', title: 'B', s: 'todo' }, { id: 'c', title: 'C', s: 'doing' }]);
  assert.deepEqual([names(todo), names(doing)], [['a', 'b'], ['c']]);
  const b = todo.childNodes[1];
  push([{ id: 'a', title: 'A', s: 'todo' }, { id: 'b', title: 'B', s: 'todo' }, { id: 'c', title: 'C', s: 'doing' }]);
  assert.deepEqual([drawn, touched], [[], []], 'the same push again touches nothing');
  push([{ id: 'a', title: 'A2', s: 'todo' }, { id: 'b', title: 'B', s: 'todo' }, { id: 'c', title: 'C', s: 'doing' }]);
  assert.deepEqual([drawn, touched], [['a'], []], 'one row moved: only it repaints, in its place');
  push([{ id: 'a', title: 'A2', s: 'todo' }, { id: 'b', title: 'B', s: 'doing' }, { id: 'c', title: 'C', s: 'doing' }]);
  assert.deepEqual([names(todo), names(doing), drawn], [['a'], ['b', 'c'], []], 'a status move moves the row, not redraws it');
  assert.equal(doing.childNodes[0], b, 'the same node, so what is open under it stays');
  push([{ id: 'b', title: 'B', s: 'doing' }, { id: 'c', title: 'C', s: 'doing' }]);
  assert.deepEqual([names(todo), touched], [[], []], 'a row gone is removed; the rest stay put');
});
