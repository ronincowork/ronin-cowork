/**
 * ONE CATALOG READ FOR THE CLIENT — GET /api/provider-catalog answers the same object the
 * server reads, whole: where it came from, when it was last read from the public record,
 * and every provider with its models. The flat rows at /api/session-launch-specs stay only
 * until the client has switched to this read (owner's follow-up, 2026-09-08).
 *
 * The contract is asserted at the router with no tmux and no live box: express is mounted
 * with only the catalog routes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const box = await mkdtemp(path.join(os.tmpdir(), 'ronin-provider-catalog-api-'));
process.env.BIND = '127.0.0.1'; // src/machine-settings.ts must not shell `tailscale` at import
process.env.RONIN_USER_ROOT = path.join(box, 'ronin');
process.env.RONIN_CATALOGS_DIR = path.join(box, 'ronin', 'catalogs');
const { registerCatalogs } = await import('../src/routes/catalogs.js');
const { readProviderCatalog, STOCK_CATALOG_MD } = await import('../src/model-providers.js');

const app = express();
app.use(express.json());
registerCatalogs(app);
const server: Server = createServer(app);
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

test('GET /api/provider-catalog is the catalog object, whole and dated', async () => {
  const r = await fetch(`${base}/api/provider-catalog`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body, JSON.parse(JSON.stringify(await readProviderCatalog())), 'the client reads exactly what the server reads');
  assert.equal(body.origin, 'stock');
  assert.equal(body.path, STOCK_CATALOG_MD);
  assert.match(body.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(body).sort(), ['origin', 'path', 'providers', 'updated']);
  assert.ok(body.providers.length >= 5);
  for (const entry of body.providers) {
    assert.deepEqual(Object.keys(entry).filter((key) => !['gbrainDisconnected', 'liveDangerously'].includes(key)).sort(), ['cli', 'label', 'models', 'provider']);
    assert.ok(entry.models.length > 0, `${entry.label} carries its models`);
  }
});

test('GET /api/session-launch-specs still answers the flat rows until the client has moved', async () => {
  const [flat, whole] = await Promise.all([
    fetch(`${base}/api/session-launch-specs`).then((r) => r.json()),
    fetch(`${base}/api/provider-catalog`).then((r) => r.json()),
  ]);
  assert.deepEqual(flat, whole.providers.flatMap((entry: { models: unknown[] }) => entry.models), 'one catalog, two shapes of the same rows');
});

test.after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(box, { recursive: true, force: true });
});
