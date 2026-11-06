// The Epic worksurface's Show question (w280): the Teams worksurface's ask() row, to show or hide
// the assigned and the unassigned items under an Epic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/js/epics-surface.js', import.meta.url), 'utf8');
// The rule itself, lifted out of the module (it reaches the kit, which wants a page).
const lift = (name) => source.slice(source.indexOf(`export const ${name}`)).split(';\n')[0].replace(/^export /, '');
const holderOfItem = (item) => { const [kind, ...rest] = String(item?.holder || '').split(':'); const name = rest.join(':'); return (kind === 'agent' || kind === 'team') && name ? { kind, name } : null; };
// eslint-disable-next-line no-new-func
const { isAssigned, byAssigned, byStatus } = new Function('holderOfItem', `${lift('isAssigned')};\n${lift('byAssigned')};\n${lift('byStatus')};\nreturn { isAssigned, byAssigned, byStatus };`)(holderOfItem);

test('assigned is held by an Agent; a Team alone, or nobody, is unassigned', () => {
  assert.equal(isAssigned({ holder: 'agent:item_pills' }), true);
  assert.equal(isAssigned({ holder: 'team:system' }), false);
  assert.equal(isAssigned({ holder: '' }), false);
});

test('w334: Assigned lets through Yes, No, or both; nothing or both picked is all. Status likewise', () => {
  const items = [{ id: 'a', holder: 'agent:x', status: 'To Do' }, { id: 't', holder: 'team:y', status: 'Done' }, { id: 'n', holder: '', status: 'In Review' }];
  const ids = (list) => list.map((item) => item.id);
  assert.deepEqual(ids(byAssigned(items, [])), ['a', 't', 'n']);
  assert.deepEqual(ids(byAssigned(items, ['yes', 'no'])), ['a', 't', 'n']);
  assert.deepEqual(ids(byAssigned(items, ['yes'])), ['a']);
  assert.deepEqual(ids(byAssigned(items, ['no'])), ['t', 'n']);
  assert.deepEqual(ids(byStatus(items, [])), ['a', 't', 'n']);
  assert.deepEqual(ids(byStatus(items, ['To Do', 'In Review'])), ['a', 'n']);
});

test('w334: the Epics board — a row of stones, two ERABI questions, the items as the island’s bars grouped by status', async () => {
  assert.match(source, /key: 'assigned', label: t\('epics\.assigned', 'Assigned'\), blank: t\('epics\.all', 'All'\), many: true/);
  assert.match(source, /key: 'status', label: t\('epics\.status', 'Status'\), blank: t\('epics\.all', 'All'\), many: true/);
  assert.match(source, /let statuses = \[\.\.\.OPEN_STATUSES\];/, 'the open statuses picked on arrival');
  assert.match(source, /const items = byStatus\(byAssigned\(every, assigned\), statuses\);/);
  assert.match(source, /import \{ itemBar \} from '\.\/tile-island\.js';/, 'the island’s own bar');
  assert.match(source, /for \(const status of statusesOf\(items\)\)/, 'grouped by status, in workflow order');
  assert.match(source, /node\.addEventListener\('click', \(\) => \{ if \(epic\.id !== selected\) select\(epic\.id\); \}\);/, 'a stone switches the Epic in place');
  assert.match(source, /renderItemDetail\(host, whole,/, 'a bar opens the item’s reading under it');
  const doors = await readFile(new URL('../public/js/door-workbenches.js', import.meta.url), 'utf8');
  assert.match(doors, /epicRecords: \(\) => keep\(createEpicBoard\(\{ epicsRead \}\)\)/);
});

test('w340: every Epic surface is the board, a stone switching the Epic in place; nothing opens elsewhere', async () => {
  assert.match(source, /export const createEpicRecord = \(key, options\) => createEpicBoard\(\{ \.\.\.options, initial: key \}\);/, 'a selector card or dragged stone starts the board on its Epic');
  assert.match(source, /if \(!selected && epics\.length === 1\) selected = epics\[0\]\.id;/, 'one Epic shows itself');
  assert.match(source, /below\.replaceChildren\(source, view\.el\)/, 'the source line heads the items (the Epic\'s own bar opens them: KAN-310)');
  assert.doesNotMatch(source, /createEpicStones|workbench\?\.place/, 'no stone places a surface elsewhere');
  const team = await readFile(new URL('../public/js/team-epics.js', import.meta.url), 'utf8');
  assert.match(team, /const board = createEpicBoard\(\{ epicsRead: read, header: false \}\);/, 'a Team\'s Epics card is the board over its Epics');
  const view = await readFile(new URL('../public/js/cowork-view.js', import.meta.url), 'utf8');
  assert.match(view, /teamEpics: \(\) => keepTeamSurface\(createTeamEpics\(\{ team: \(\) => team \}\)\)/);
});
