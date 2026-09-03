/**
 * ⚙ SAVES ONE ROW AT A TIME, so the `agents` writer must merge, not replace.
 *
 * The writer already carried this hazard for JOBS, in its own words: "a caller that
 * sends only the job it changed would otherwise delete every other job and the session
 * default with them." The per-provider preferred models (owner, 2026-08-29) put the
 * same hazard one level deeper, inside `sessions` — which until now held exactly one
 * key and could be replaced wholesale without anyone noticing.
 *
 * Two rows now live there: the general `default` (which provider AND model a new session
 * launches as) and `by_provider` (which model this vendor prefers, one key per provider).
 * ⚙'s rows each save alone, so saving either one must leave the other exactly as it was.
 * Nothing in the UI would report the loss — the row would simply be blank next time.
 *
 * The router is exercised for real over a loopback port; no tmux, no live box, and the
 * config store is redirected to a temp directory per the env contract in src/resources.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-settei-merge-test-'));
process.env.RONIN_CONFIG_DIR = path.join(temp, 'config');
process.env.RONIN_CATALOGS_DIR = path.join(temp, 'catalogs');
process.env.RONIN_LEDGER_DIR = path.join(temp, 'ledger');
await fs.mkdir(path.join(temp, 'config'), { recursive: true });
await fs.mkdir(path.join(temp, 'catalogs'), { recursive: true });

const { registerMachineSettings } = await import('../src/routes/machine-settings-api.js');
const { readAgentsSection } = await import('../src/machine-state.js');

const app = express();
app.use(express.json());
registerMachineSettings(app);
const server: Server = createServer(app);
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

/** One ⚙ row's save: the family body it lands, and nothing else — as toRequest builds it. */
const save = (json: unknown) =>
  fetch(`${base}/api/machine-settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ family: 'agents', value: json }),
  });

type Sessions = {
  default?: { provider?: string | null; model?: string | null };
  by_provider?: Record<string, string | null>;
};
const sessions = async (): Promise<Sessions> => ((await readAgentsSection()).sessions ?? {}) as Sessions;

test('saving a per-provider preference keeps the general default', async () => {
  assert.equal((await save({ sessions: { default: { provider: 'openai', model: 'gpt-5.6-sol' } } })).status, 200);
  assert.equal((await save({ sessions: { by_provider: { anthropic: 'fable' } } })).status, 200);
  const s = await sessions();
  assert.deepEqual(s.default, { provider: 'openai', model: 'gpt-5.6-sol' }, 'the general default survived');
  assert.deepEqual(s.by_provider, { anthropic: 'fable' });
});

test('saving the general default keeps every per-provider preference', async () => {
  assert.equal((await save({ sessions: { by_provider: { openai: 'gpt-5.6-terra' } } })).status, 200);
  assert.equal((await save({ sessions: { default: { provider: 'anthropic', model: 'opus' } } })).status, 200);
  const s = await sessions();
  assert.deepEqual(s.default, { provider: 'anthropic', model: 'opus' });
  assert.deepEqual(s.by_provider, { anthropic: 'fable', openai: 'gpt-5.6-terra' }, 'both preferences survived');
});

test('one provider saves without disturbing another, and clearing one stores null', async () => {
  assert.equal((await save({ sessions: { by_provider: { anthropic: 'haiku' } } })).status, 200);
  assert.deepEqual((await sessions()).by_provider, { anthropic: 'haiku', openai: 'gpt-5.6-terra' });
  // A blank is stored as null, not as '': this box still knows the provider, and "no
  // preference" is a different fact from "never seen". ⚙ itself omits blanks by the
  // registry's one omission rule (`omit: 'blank'`, as for every text row), so a clear
  // arrives through the API — which is exactly why the writer must normalize it.
  assert.equal((await save({ sessions: { by_provider: { anthropic: '' } } })).status, 200);
  assert.deepEqual((await sessions()).by_provider, { anthropic: null, openai: 'gpt-5.6-terra' });
});

test('a body with no sessions key at all touches neither row', async () => {
  // The jobs rows save through this same family. A job edit must not reach into sessions.
  assert.equal((await save({ jobs: { mika: { provider: 'anthropic', model: 'haiku' } } })).status, 200);
  const s = await sessions();
  assert.deepEqual(s.default, { provider: 'anthropic', model: 'opus' });
  assert.deepEqual(s.by_provider, { anthropic: null, openai: 'gpt-5.6-terra' });
});

test.after(() => server.close());
