/**
 * SECRETS (w385; docs/using-ronin/agent-tools.md#handing-an-agent-a-secret): an Agent's `secret ask` waits on its tile and
 * hears only saved or cancelled; the value lands in one 0600 file and comes back to nobody.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';

const root = path.resolve(import.meta.dirname, '..');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-secrets-'));
process.env.RONIN_DATA_ROOT = path.join(dir, 'data');
process.env.RONIN_USER_ROOT = path.join(dir, 'user');
delete process.env.RONIN_SOCKET;
delete process.env.TMUX;
process.env.TMUX_TMPDIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-secrets-tmux-'));

// The asking Agent, as a stub tmux names it.
const bin = path.join(dir, 'bin');
await fs.mkdir(bin);
await fs.writeFile(path.join(bin, 'tmux'), [
  '#!/bin/sh',
  'case "$*" in',
  '  *display-message*) echo "@1";;',
  "  *list-windows*) printf 'kvm_helper\\t@1\\n';;",
  '  *) exit 1;;',
  'esac', '',
].join('\n'), { mode: 0o755 });
process.env.PATH = `${bin}:${process.env.PATH ?? ''}`;

const { registerSecrets } = await import('../src/routes/secrets-api.js');
const { collectRowFields } = await import('../src/sockets.js');
const { secretsDir } = await import('../src/secrets.js');

const app = express();
app.use(express.json());
registerSecrets(app);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
test.after(() => server.close());
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (at: string, body: unknown) => fetch(`${base}${at}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, text: await r.text() }));
const run = (args: string[]) => new Promise<{ status: number; stdout: string; stderr: string }>((resolve) => {
  const child = execFile(path.join(root, 'ronin_bin', 'secret'), args, { encoding: 'utf8', env: { ...process.env, TMUX_PANE: '%1', RONIN_URL: base } },
    (error, stdout, stderr) => resolve({ status: error ? Number((error as { code?: number }).code ?? 1) : 0, stdout, stderr }));
  child.stdin?.end();
});
const asked = async () => {
  for (let i = 0; i < 100; i++) {
    const row = await collectRowFields('kvm_helper');
    if (row.secret_ask) return row.secret_ask;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('the ask never reached the row');
};
const VALUE = 'hunter2-not-for-anyone';

test('secret ask opens on the row, waits, and hears only saved; the value is one 0600 file', async () => {
  const asking = run(['ask', 'glkvm_admin', '--for', 'the KVM web login']);
  assert.deepEqual(await asked(), { name: 'glkvm_admin', for: 'the KVM web login' });
  const saved = await post('/api/secrets/glkvm_admin', { session: 'kvm_helper', value: VALUE });
  assert.equal(saved.status, 200);
  const r = await asking;
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'saved: glkvm_admin\n');
  for (const said of [saved.text, r.stdout, r.stderr]) assert.ok(!said.includes(VALUE), 'no answer carries the value');
  const file = path.join(secretsDir(), 'glkvm_admin');
  assert.equal(await fs.readFile(file, 'utf8'), VALUE);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.equal((await collectRowFields('kvm_helper')).secret_ask, null, 'answered: the field closes');

  const ls = await run(['ls']);
  assert.equal(ls.stdout, 'glkvm_admin\n');
  const where = await run(['path', 'glkvm_admin']);
  assert.equal(where.stdout, `${file}\n`);
});

test('a cancel answers cancelled and saves nothing; a bad name is refused before anything opens', async () => {
  const asking = run(['ask', 'router_key']);
  await asked();
  await post('/api/secrets/router_key', { session: 'kvm_helper', cancel: true });
  assert.equal((await asking).stdout, 'cancelled: router_key\n');
  await assert.rejects(fs.stat(path.join(secretsDir(), 'router_key')));
  const bad = await run(['ask', '../etc']);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /not a secret name/);
  assert.equal((await run(['path', 'router_key'])).status, 4, 'no file yet');
});

test('an expiry date rides beside the value, never in it; secret ls shows it; secret expires sets and clears it', async () => {
  const saved = await post('/api/secrets/office_key', { value: VALUE, expires: '2027-05-11' });
  assert.equal(saved.status, 200, saved.text);
  const file = path.join(secretsDir(), 'office_key');
  assert.equal(await fs.readFile(file, 'utf8'), VALUE, 'the value file is the value alone');
  assert.equal((await fs.stat(path.join(secretsDir(), 'secrets-expiry.json'))).mode & 0o777, 0o600);
  assert.match((await run(['ls'])).stdout, /^office_key {2}expires 2027-05-11$/m);
  assert.equal((await run(['expires', 'office_key', 'none'])).stdout, 'office_key has no expiry\n');
  assert.equal((await run(['expires', 'office_key', '2027-06-01'])).stdout, 'office_key expires 2027-06-01\n');
  assert.equal(await fs.readFile(file, 'utf8'), VALUE, 'setting a date leaves the value alone');
  const bad = await run(['expires', 'office_key', '2027-02-30']);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /not a date/);
  assert.match((await run(['expires', 'nobody_here', '2027-01-01'])).stderr, /No secret nobody_here/);
  assert.equal((await post('/api/secrets/office_key', { value: VALUE, expires: 'soon' })).status, 400);
  assert.equal(await fs.readFile(file, 'utf8'), VALUE, 'a refused date saves nothing');
});
