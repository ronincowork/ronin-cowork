/**
 * THE TEMPLATE CATALOG (NEW_AGENT.md leg 6): the shipped tray reads whole, the mandate
 * grammar holds the ruled values, and the one write is save-as-NEW into the user store —
 * never a shadow of a shipped box. The user store is pointed at a temp dir; no live
 * store, no tmux, no socket.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(tmpdir(), 'ronin-templates-'));
const previous = process.env.RONIN_CATALOGS_DIR;
process.env.RONIN_CATALOGS_DIR = temp;
const { listTemplates, templateMandate } = await import('../src/definitions.js');
const { saveTemplate } = await import('../src/templates.js');

test('the shipped tray surfaces with parsed mandates, kinds and books', async () => {
  const rows = await listTemplates();
  const ship = rows.find((row) => row.name === 'ship_an_app');
  assert.ok(ship, 'ship_an_app is on the shelf');
  assert.equal(ship?.label, 'Ship an App');
  assert.deepEqual(ship?.mandate, { reach: 'execute', recruit: 'staff agents', output: 'code' });
  assert.deepEqual(ship?.kinds, ['coding']);
  assert.ok(ship?.behaviours.includes('sops:github'));
  assert.deepEqual(ship?.routines_on, ['ronin_control']);
  assert.equal(ship?.lead?.mandate?.recruit, 'staff agents');
  // Tray order is the stated order:, so the coding pair leads.
  assert.deepEqual(rows.slice(0, 2).map((row) => row.name), ['ship_an_app', 'raid_my_codebase']);
});

test('the mandate grammar admits only the ruled values', () => {
  assert.deepEqual(templateMandate('open · nobody · the team'), { reach: 'open', recruit: 'nobody', output: 'the team' });
  for (const bad of ['run · nobody · code', 'execute · staff · code', 'execute · staff agents', 'execute · staff agents · loot']) {
    assert.equal(templateMandate(bad), null, bad);
  }
});

test('save-as-new lands in the user store and reads back through the one reader', async () => {
  const saved = await saveTemplate({
    name: 'night_shift', label: 'Night Shift', art: '🌙', blurb: 'The quiet hours, covered.',
    kinds: ['work', 'bogus'], brief: 'Cover the quiet hours.', mandate: 'execute · nobody · open',
    behaviours: ['sops:accounts'], routines_off: ['ronin_control'],
  });
  assert.equal(saved.origin, 'user');
  assert.equal(saved.shadowed, false);
  assert.deepEqual(saved.kinds, ['work'], 'an unknown kind is dropped, not stored');
  assert.deepEqual(saved.mandate, { reach: 'execute', recruit: 'nobody', output: 'open' });
  const raw = await readFile(path.join(temp, 'templates', 'night_shift.md'), 'utf8');
  assert.match(raw, /- \*\*mandate:\*\* execute · nobody · open/);
});

test('a save is always new — an existing name, shipped or saved, is refused', async () => {
  await assert.rejects(() => saveTemplate({ name: 'ship_an_app' }), /already exists/);
  await assert.rejects(() => saveTemplate({ name: 'night_shift' }), /already exists/);
  await assert.rejects(() => saveTemplate({ name: 'Bad Name' }), /lowercase/);
  await assert.rejects(() => saveTemplate({ name: 'half_mandate', mandate: 'execute · staff' }), /ruled values/);
});

test.after(async () => {
  if (previous === undefined) delete process.env.RONIN_CATALOGS_DIR;
  else process.env.RONIN_CATALOGS_DIR = previous;
  await rm(temp, { recursive: true, force: true });
});
