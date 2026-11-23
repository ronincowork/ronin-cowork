/**
 * Stores: what a user or Agent writes is in the right root, reads back, and is still there
 * after Ronin restarts. Running Agents outlive the restart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { bootRonin, until } from './helpers/ronin.js';

const ronin = await bootRonin('stores');
test.after(() => ronin.stop());

await ronin.api('/api/launch', { body: { name: 'keeper', provider: 'anthropic', prompt: 'Keep.' } });
const pane = await ronin.tmux.run('display-message', '-p', '-t', '=keeper:', '#{pane_id}');
const asKeeper = { TMUX_PANE: pane };
let itemId = '';

test('a Team, a Workspace, a plan and a work item are written', async () => {
  const team = await ronin.api('/api/team-rosters', { body: { name: 'shopfront', objective: 'Run the shop.' } });
  assert.equal(team.status, 200, JSON.stringify(team.body));
  const ws = await ronin.api('/api/workspaces/shop', { method: 'PUT', body: { title: 'Shop', objective: 'Sell things.', repos: [], folders: [] } });
  assert.equal(ws.status, 200, JSON.stringify(ws.body));
  const plan = await ronin.tool('plan', ['write', 'launch-day', '--workspace', 'shop'], { env: asKeeper, input: '# Launch day\n\nOpen the doors.\n' });
  assert.equal(plan.status, 0, plan.stderr);
  const created = await ronin.tool('item', ['create', '--title', 'Stock the shelves'], { env: asKeeper });
  assert.equal(created.status, 0, created.stderr);
  itemId = /created (\S+)/.exec(created.stdout)![1];
});

test('a secret the owner pastes is saved 0600 in the user root and its value is never printed', async () => {
  const asked = ronin.tool('secret', ['ask', 'shop_key', '--for', 'the till'], { env: asKeeper });
  // The owner's paste answers the waiting ask. A paste before the ask is open only saves the
  // value, so paste until the asking tool returns.
  let returned = false;
  void asked.then(() => { returned = true; });
  await until(async () => {
    await ronin.api('/api/secrets/shop_key', { body: { value: 'hunter2-value', session: 'keeper' } });
    return returned;
  }, 'the ask to be answered');
  const r = await asked;
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /saved: shop_key/);
  const where = (await ronin.tool('secret', ['path', 'shop_key'], { env: asKeeper })).stdout.trim();
  assert.ok(where.startsWith(path.join(ronin.scratch, 'user')), where);
  assert.equal(await fs.readFile(where, 'utf8'), 'hunter2-value');
  assert.equal((await fs.stat(where)).mode & 0o777, 0o600);
  const ls = await ronin.tool('secret', ['ls'], { env: asKeeper });
  assert.match(ls.stdout, /shop_key/);
  assert.doesNotMatch(ls.stdout + r.stdout, /hunter2/);
});

test('after a restart everything reads back and the running Agent is still there', async () => {
  const keyBefore = ((await ronin.api('/api/sessions')).body as Array<{ name: string; key: string }>).find((s) => s.name === 'keeper')!.key;
  await ronin.restart();

  const teams = (await ronin.api('/api/team-rosters')).body;
  assert.ok(JSON.stringify(teams).includes('shopfront'), JSON.stringify(teams).slice(0, 300));
  const workspaces = (await ronin.api('/api/workspaces')).body;
  assert.ok(JSON.stringify(workspaces).includes('Sell things.'));
  const plan = await ronin.tool('plan', ['read', 'launch-day', '--workspace', 'shop'], { env: asKeeper });
  assert.match(plan.stdout, /Open the doors\./);
  const item = await ronin.api(`/api/work-items/${itemId}`);
  assert.equal(item.body.item.title, 'Stock the shelves');
  assert.deepEqual(item.body.held_by, ['agent:keeper']);
  assert.match((await ronin.tool('secret', ['ls'], { env: asKeeper })).stdout, /shop_key/);

  const keeper = ((await ronin.api('/api/sessions')).body as Array<{ name: string; key: string }>).find((s) => s.name === 'keeper');
  assert.equal(keeper?.key, keyBefore, 'the Agent kept running through the restart');
});
