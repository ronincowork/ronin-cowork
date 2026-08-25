import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type express from 'express';
import { listActions } from '../src/actions.js';
import { registerCatalogs } from '../src/routes/catalogs.js';

test('Actions reuse entry merge, tombstone and provenance contracts', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-actions-test-'));
  const previous = process.env.RONIN_CATALOGS_DIR;
  process.env.RONIN_CATALOGS_DIR = temp;
  try {
    await mkdir(temp, { recursive: true });
    await writeFile(path.join(temp, 'ACTIONS.md'), [
      '# ACTIONS — yours',
      '',
      '## control-check',
      'Owner replacement.',
      '',
      '## local-action',
      'Owner-only action body.',
      '',
      '## session-create',
      '- **hidden:** yes',
      '',
    ].join('\n'));

    const rows = await listActions();
    const shadow = rows.find((row) => row.name === 'control-check');
    assert.deepEqual(
      shadow && { origin: shadow.origin, shadowed: shadow.shadowed, content: shadow.content },
      { origin: 'user', shadowed: true, content: '## control-check\nOwner replacement.' },
    );
    const added = rows.find((row) => row.name === 'local-action');
    assert.equal(added?.origin, 'user');
    assert.equal(added?.shadowed, false);
    assert.match(added?.content || '', /Owner-only action body/);
    assert.equal(rows.some((row) => row.name === 'session-create'), false);
    assert.equal(rows.filter((row) => row.name === 'control-check').length, 1);
    assert.ok(rows.some((row) => row.name === 'harakiri' && row.label.includes('end your own session')));
  } finally {
    if (previous === undefined) delete process.env.RONIN_CATALOGS_DIR;
    else process.env.RONIN_CATALOGS_DIR = previous;
    await rm(temp, { recursive: true, force: true });
  }
});

test('catalog routes expose resolved Actions as JSON', async () => {
  const gets = new Map<string, (req: unknown, res: unknown) => unknown>();
  const app = {
    get(route: string, handler: (req: unknown, res: unknown) => unknown) { gets.set(route, handler); return this; },
    post() { return this; },
    put() { return this; },
    delete() { return this; },
  } as unknown as express.Express;
  registerCatalogs(app);
  const handler = gets.get('/api/actions');
  assert.ok(handler, 'the catalog surface must register GET /api/actions');

  let body: unknown;
  let status = 200;
  const res = {
    status(code: number) { status = code; return this; },
    json(value: unknown) { body = value; return this; },
  };
  await handler({}, res);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.some((row) => row.name === 'control-check' && typeof row.content === 'string'));
});
