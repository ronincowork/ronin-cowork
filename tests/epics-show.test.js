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
const { isAssigned, byAssignment } = new Function('holderOfItem', `${lift('isAssigned')};\n${lift('byAssignment')};\nreturn { isAssigned, byAssignment };`)(holderOfItem);

test('assigned is held by an Agent; a Team alone, or nobody, is unassigned', () => {
  assert.equal(isAssigned({ holder: 'agent:item_pills' }), true);
  assert.equal(isAssigned({ holder: 'team:system' }), false);
  assert.equal(isAssigned({ holder: '' }), false);
});

test('Show lets through what it picks; nothing or both picked is all', () => {
  const items = [{ id: 'a', holder: 'agent:x' }, { id: 't', holder: 'team:y' }, { id: 'n', holder: '' }];
  const ids = (show) => byAssignment(items, show).map((item) => item.id);
  assert.deepEqual(ids([]), ['a', 't', 'n']);
  assert.deepEqual(ids(['assigned', 'unassigned']), ['a', 't', 'n']);
  assert.deepEqual(ids(['assigned']), ['a']);
  assert.deepEqual(ids(['unassigned']), ['t', 'n']);
});

test('the worksurface asks Show once, with the Teams worksurface ask() row, and filters before counting', () => {
  assert.match(source, /const filter = ask\(\[\{ fields: \[\s*\{ key: 'show', label: t\('epics\.show', 'Show'\), blank: t\('epics\.all', 'All'\), many: true/);
  assert.match(source, /const items = byAssignment\(every, show\);/);
  assert.match(source, /out\.content\.append\(sourceHost, filter\.el, bodyHost\);/);
});
