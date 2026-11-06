// An item's reading (owner, 2026-11-05): the launch forms' format — a head, then label-left
// steps — at the form tokens only, with Status an ERABI question that moves the item.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the reader is drawn as form steps, and Status is an ask() that posts the transition', async () => {
  const surface = await read('public/js/work-items-surface.js');
  const body = surface.slice(surface.indexOf('export function renderItemDetail'), surface.indexOf('/** A phalanx of item stones'));
  assert.match(body, /el\('div', 'ntf-form wi-form'\)/);
  // w297: every step folds with the form steps' own fold, and the fold is kept between items.
  assert.match(body, /createStep\(\{ key: id, title, onToggle: \(\) => \{ FOLDS\.set\(id, !\(FOLDS\.get\(id\) \?\? true\)\); paint\(\); \} \}\)/);
  assert.match(body, /one\.setCollapsed\(!\(FOLDS\.get\(id\) \?\? true\), meta\(\), true\)/);
  assert.match(surface, /const FOLDS = new Map\(\[\['done', false\]\]\);/, 'Done starts folded');
  // w297: the Done Subtasks have their own section; the open ones stay in Subtasks.
  assert.match(body, /const open = children\.filter\(\(child\) => !isDone\(child\)\);/);
  assert.match(body, /step\('done', t\('work_items\.done_n', 'Done \(\{n\}\)', \{ n: done\.length \}\)/);
  // w297: the comment box posts to the work-item comment route and says who it reached.
  assert.match(body, /\/comment`, \{ method: 'POST', json: \{ text \} \}/);
  assert.match(body, /result\.data\?\.notified/);
  assert.match(body, /ask\(\[\{ fields: \[\{ key: 'status'/);
  assert.match(body, /\/transition`, \{ method: 'POST', json: \{ status: next \} \}/);
  assert.match(body, /else \{ question\.set\('status', was\)/, 'a refused move puts the answer back');
  assert.doesNotMatch(body, /el\('h3'/, 'section names are the steps\', not bare headings');
  // Any status to any status, the item's own kept when its space names another.
  const choices = new Function(`${surface.match(/export const ITEM_STATUSES = [^;]+;/)[0].replace('export ', '')}
    ${surface.match(/export const statusChoices = [^\n]+/)[0].replace('export ', '')} return statusChoices;`)();
  assert.deepEqual(choices({ status: 'In Review' }), ['To Do', 'In Progress', 'In Review', 'Done']);
  assert.deepEqual(choices({ status: 'Blocked' }), ['To Do', 'In Progress', 'In Review', 'Done', 'Blocked']);
});

test('every size in the reader is a token, and the tile overlay reads in the UI face', async () => {
  const css = await read('public/css/launch-forms.css');
  const rules = css.split('\n').filter((line) => /^\s*\.wi-/.test(line));
  assert.ok(rules.length > 5);
  for (const rule of rules) assert.doesNotMatch(rule, /font-size:\s*\d/, rule);
  const style = await read('public/style.css');
  assert.match(style, /\.tile-body > \.work-overlay \{[^}]*font-family: var\(--font-ui\)/);
  assert.match(await read('public/js/tilehead.js'), /await overTile\(tile, '', \(box\) =>/, 'the reader\'s head carries the key: no second title');
});

// What the user reads first (ITEM_HANDOVER): the objective and the Handed in note, before
// Status; the other comments folded.
test('the reader shows the objective and the Handed in note first, other comments folded', async () => {
  const surface = await read('public/js/work-items-surface.js');
  const body = surface.slice(surface.indexOf('export function renderItemDetail'), surface.indexOf('/** A phalanx of item stones'));
  const at = (what) => { const i = body.indexOf(what); assert.ok(i >= 0, what); return i; };
  // Each step names its fold first (w297): step('<id>', t(...), ...).
  assert.ok(at("step('objective', t('work_items.objective'") < at("step('handed_in', t('work_items.handed_in'"), 'the objective, then the note');
  assert.ok(at("step('handed_in', t('work_items.handed_in'") < at("step('status', t('work_items.status'"), 'both before Status');
  assert.match(body, /\.filter\(\(comment\) => comment !== handed\)/, 'the note is not repeated among the comments');
  assert.match(body, /const folded = el\('details', 'wi-comments'\);/, 'the other comments fold');
  assert.match(surface, /export const HANDED_IN = 'Handed in: ';/);
  assert.match(await read('src/work-items.ts'), /export const HANDED_IN = 'Handed in: ';/, 'one heading, server and client');
});

// w299 (owner via pm_lead): a Team's item reads as the Team's, with its lead; an Agent's as
// "@<agent>"; every holder when several; Details carry the id, the kind with its level, and
// where the item started (Jira or Ronin).
test('holderWords and holderOf say who holds an item; originWords where it started', async () => {
  const surface = await read('public/js/work-items-surface.js');
  const lift = (name) => surface.match(new RegExp(`export (?:const|function) ${name}[\\s\\S]*?\\n(?=\\n)`))[0].replace(/^export /, '');
  const t = (_key, literal, vars) => literal.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k]));
  const membersOfTeam = (team) => (team === 'system' ? [{ name: 'system_lead', team_lead: true }, { name: 'item_pills' }] : []);
  const { holderWords, holderOf, originWords } = new Function('t', 'membersOfTeam',
    `${lift('teamLead')}\n${lift('holderWords')}\n${lift('holderOf')}\n${lift('originWords')}\nreturn { holderWords, holderOf, originWords };`)(t, membersOfTeam);
  assert.equal(holderWords('team:system'), 'Team system (lead system_lead)');
  assert.equal(holderWords({ kind: 'team', name: 'boot' }), 'Team boot');
  assert.equal(holderWords({ kind: 'agent', name: 'item_pills' }), '@item_pills');
  assert.equal(holderOf({ holder: 'team:system' }), 'Team system (lead system_lead)');
  assert.equal(holderOf({ holder: 'team:system', held_by: ['agent:item_pills', 'team:system'] }), '@item_pills, Team system (lead system_lead)');
  assert.equal(holderOf({ holder: 'team:pm', held_by: [] }, 'pm_lead'), 'Team pm (lead pm_lead)');
  assert.equal(holderOf({}), '');
  assert.equal(originWords({ created: { by: 'jira:Glen' }, jiraFields: { Reporter: 'Glen Osmond' } }), 'from Jira (Glen Osmond)');
  assert.equal(originWords({ created: { by: 'jira:glen' } }), 'from Jira (glen)');
  assert.equal(originWords({ created: { by: 'jira:x' }, jiraFields: { Reporter: 'jira:ronin_machine' } }), 'from Jira (ronin_machine)');
  assert.equal(originWords({ created: { by: 'system_lead' } }), 'Ronin (system_lead)');
  // Details: the id, the kind with its level, the origin; the Epic cards' holder through holderWords, label only.
  assert.match(surface, /\[t\('work_items\.kind', 'Kind'\), \[item\.kind, item\.level\]/);
  assert.match(surface, /\[t\('work_items\.origin', 'Started in'\), originWords\(item\)\]/);
  const epics = await read('public/js/epics-surface.js');
  assert.match(epics, /el\('button', 'epic-holder', holderWords\(holder\)\)/);
  assert.match(epics, /button\.addEventListener\('click', \(\) => openHolder\(holder\)\)/, 'the button still opens the holder');
});

// Owner, 2026-11-05: the overlay says the hand-in the pill marks. KAN-311: as one line of steps.
test('handInRecord: one line of steps, promoted only when its promotion came after; live from the receipt', async () => {
  const surface = await read('public/js/work-items-surface.js');
  const lift = (name) => surface.match(new RegExp(`export (?:const|function) ${name}[\\s\\S]*?\\n(?=\\n)`))[0].replace(/^export /, '');
  const t = (_key, literal, vars) => literal.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k]));
  const when = (at) => String(at || '').slice(0, 16).replace('T', ' ');
  const { handInRecord, promotionToCheck } = new Function('t', 'when', `${lift('handInRecord')}\n${lift('promotionToCheck')}\nreturn { handInRecord, promotionToCheck };`)(t, when);
  const handed = 'Handed in by item_pills 2026-11-05 10:33 · on team line';
  assert.equal(handInRecord({}), '');
  assert.equal(handInRecord({ handed_in: { by: 'item_pills', at: '2026-11-05T10:33:29Z' } }), `${handed} · with the lead`);
  assert.equal(handInRecord({ hand_ins: [{ receipt: 'h1', by: 'item_pills', at: '2026-11-05T10:33:29Z' }], on_dev: { at: '2026-11-05T10:34:33Z', promotion: 'r1' } }), `${handed} · promoted to dev 10:34`, 'promoted in place of with the lead');
  assert.equal(handInRecord({ handed_in: { by: 'item_pills', at: '2026-11-05T10:33:29Z' }, on_dev: { at: '2026-11-06T09:00:00Z', promotion: 'r1' } }), `${handed} · promoted to dev 2026-11-06 09:00`, 'another day carries its date');
  assert.equal(handInRecord({ handed_in: { by: 'a', at: '2026-11-05T11:00:00Z' }, on_dev: { at: '2026-11-05T10:00:00Z' } }), 'Handed in by a 2026-11-05 11:00 · on team line · with the lead', 'an older promotion is not this hand-in');
  assert.equal(promotionToCheck({ handed_in: { by: 'a', at: '2026-11-05T10:00:00Z' }, on_dev: { at: '2026-11-05T10:01:00Z', promotion: 'r1' } }), 'r1');
  assert.equal(promotionToCheck({ handed_in: { by: 'a', at: '2026-11-05T11:00:00Z' }, on_dev: { at: '2026-11-05T10:00:00Z', promotion: 'r0' } }), '');
  assert.match(surface, /request\(`\/api\/promotions\/\$\{encodeURIComponent\(promotion\)\}\/live`/, 'live is the promotion receipt read');
  assert.doesNotMatch(surface.slice(surface.indexOf('export function handInRecord'), surface.indexOf('export function originWords')), /github|master|' \| '/i, 'no GitHub/master step, no divider');
  assert.match(surface, /if \(record \|\| handed\) \{/, 'the row shows for a hand-in with no note too');
});

// The tile's work record lists open items only; Done waiting for the archive is one line (KAN-271).
test('the tile\'s work record lists open items, and counts Done on one line, newest first, at most eight', async () => {
  const record = await read('public/js/work-record.js');
  const body = record.slice(record.indexOf('export function buildWorkRecord'));
  assert.match(body, /const open = \(letter\.items \|\| \[\]\)\.filter\(\(item\) => item\.status !== 'Done'\);/);
  assert.match(body, /for \(const item of open\)/);
  assert.match(body, /held\.appendChild\(line\('wr-action wr-done', doneLine\(done\)\)\)/);
  assert.match(record, /'Done, not yet archived: \{n\} \(\{ids\}\)'/);
  assert.match(record, /done\.slice\(0, 8\)/);
  assert.match(record, /sort\(\(a, b\) => doneAt\(b\)\.localeCompare\(doneAt\(a\)\)\)/, 'newest first');
});
