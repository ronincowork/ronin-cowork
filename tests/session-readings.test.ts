import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import type express from 'express';
import { listSessionReadings } from '../src/session-readings.js';
import { registerCatalogs } from '../src/routes/catalogs.js';

test('Session Readings resolves level shapes, leaf links and per-level shadows', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-readings-test-'));
  const shelf = path.join(temp, 'shelf');
  const previous = process.env.RONIN_SESSION_BOOT_DIR;
  process.env.RONIN_SESSION_BOOT_DIR = shelf;
  try {
    for (const dir of ['all', 'root/project', 'role/CutCode', 'gbrain_connected']) {
      await mkdir(path.join(shelf, dir), { recursive: true });
      await writeFile(path.join(shelf, dir, `${dir.replaceAll('/', '-')}.md`), `# ${dir}\n`);
    }
    await writeFile(path.join(shelf, 'all', 'README.md'), '# Owner abilities\n');
    const outside = path.join(temp, 'outside.md');
    await writeFile(outside, '# Linked reading\n');
    await symlink(outside, path.join(shelf, 'root/project', 'linked.md'));
    await mkdir(path.join(temp, 'hidden-dir'));
    await writeFile(path.join(temp, 'hidden-dir', 'secret.md'), '# Not enumerated\n');
    await symlink(path.join(temp, 'hidden-dir'), path.join(shelf, 'role', 'linked-role'));

    const rows = await listSessionReadings();
    for (const level of ['all', 'root/project', 'role/CutCode', 'gbrain_connected']) {
      assert.ok(rows.some((row) => row.level === level), `${level} should be represented`);
    }
    const shadow = rows.find((row) => row.name === 'all/README.md');
    assert.equal(shadow?.origin, 'user');
    assert.equal(shadow?.shadowed, true);
    assert.equal(shadow?.content, '# Owner abilities\n');
    const linked = rows.find((row) => row.name === 'root/project/linked.md');
    assert.equal(linked?.linked, true);
    assert.equal(linked?.content, '# Linked reading\n');
    assert.equal(rows.some((row) => row.level === 'role/linked-role'), false);
    assert.match(rows.find((row) => row.name === 'all/SESSION_MACROS.md')?.content || '', /ACTIVE_SESSION_MACROS/);
    assert.ok(rows.every((row) => !('file' in row) && !('path' in row)));
  } finally {
    if (previous === undefined) delete process.env.RONIN_SESSION_BOOT_DIR;
    else process.env.RONIN_SESSION_BOOT_DIR = previous;
    await rm(temp, { recursive: true, force: true });
  }
});

test('catalog routes expose readable Session Readings as JSON', async () => {
  const gets = new Map<string, (req: unknown, res: unknown) => unknown>();
  const app = {
    get(route: string, handler: (req: unknown, res: unknown) => unknown) { gets.set(route, handler); return this; },
    post() { return this; }, put() { return this; }, delete() { return this; },
  } as unknown as express.Express;
  registerCatalogs(app);
  const handler = gets.get('/api/session-readings');
  assert.ok(handler);
  let body: unknown;
  let status = 200;
  const res = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } };
  await handler({}, res);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.some((row) => typeof row.level === 'string' && typeof row.content === 'string'));
});
