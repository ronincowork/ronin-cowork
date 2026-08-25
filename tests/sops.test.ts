import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { listSops } from '../src/sops.js';
import { registerCatalogs } from '../src/routes/catalogs.js';
import type express from 'express';

test('SOP shelf resolves owner additions and whole-file shadows with readable text', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-sops-test-'));
  const previous = process.env.RONIN_SOPS_DIR;
  process.env.RONIN_SOPS_DIR = path.join(temp, 'sops');
  try {
    await mkdir(process.env.RONIN_SOPS_DIR, { recursive: true });
    await writeFile(path.join(process.env.RONIN_SOPS_DIR, 'accounts.md'), '# My accounts\n\nOwner process.\n');
    await writeFile(path.join(process.env.RONIN_SOPS_DIR, 'local-only.md'), '# Local only\n\nMy own procedure.\n');
    await writeFile(path.join(process.env.RONIN_SOPS_DIR, 'README.md'), '# Not an SOP\n');
    await writeFile(path.join(temp, 'outside.md'), '# Outside\n\nMust not be served.\n');
    await symlink(path.join(temp, 'outside.md'), path.join(process.env.RONIN_SOPS_DIR, 'linked.md'));

    const rows = await listSops();
    const shadow = rows.find((row) => row.name === 'accounts');
    assert.deepEqual(
      shadow && { label: shadow.label, origin: shadow.origin, shadowed: shadow.shadowed, content: shadow.content },
      { label: 'My accounts', origin: 'user', shadowed: true, content: '# My accounts\n\nOwner process.\n' },
    );
    const added = rows.find((row) => row.name === 'local-only');
    assert.equal(added?.origin, 'user');
    assert.equal(added?.shadowed, false);
    assert.equal(added?.blurb, 'My own procedure.');
    assert.equal(rows.some((row) => row.name === 'README'), false);
    assert.equal(rows.some((row) => row.name === 'linked'), false);
    assert.equal(rows.filter((row) => row.name === 'accounts').length, 1);
  } finally {
    if (previous === undefined) delete process.env.RONIN_SOPS_DIR;
    else process.env.RONIN_SOPS_DIR = previous;
    await rm(temp, { recursive: true, force: true });
  }
});

test('missing owner SOP store is ordinary and leaves the stock shelf readable', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-sops-test-'));
  const previous = process.env.RONIN_SOPS_DIR;
  process.env.RONIN_SOPS_DIR = path.join(temp, 'absent');
  try {
    const rows = await listSops();
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.origin === 'stock' && !row.shadowed));
    assert.ok(rows.every((row) => row.content.length > 0));
  } finally {
    if (previous === undefined) delete process.env.RONIN_SOPS_DIR;
    else process.env.RONIN_SOPS_DIR = previous;
    await rm(temp, { recursive: true, force: true });
  }
});

test('catalog routes expose the resolved SOP shelf as JSON', async () => {
  const gets = new Map<string, (req: unknown, res: unknown) => unknown>();
  const app = {
    get(path: string, handler: (req: unknown, res: unknown) => unknown) { gets.set(path, handler); return this; },
    post() { return this; },
    put() { return this; },
    delete() { return this; },
  } as unknown as express.Express;
  registerCatalogs(app);
  const handler = gets.get('/api/sops');
  assert.ok(handler, 'the catalog surface must register GET /api/sops');

  let body: unknown;
  let status = 200;
  const res = {
    status(code: number) { status = code; return this; },
    json(value: unknown) { body = value; return this; },
  };
  await handler({}, res);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.some((row) => row.name === 'accounts' && typeof row.content === 'string'));
});
