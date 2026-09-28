/**
 * ONE CATALOG READ FOR THE CLIENT — GET /api/provider-catalog answers the catalog's own
 * facts (where it came from, when it was last read from the public record), the record's
 * dates, and every provider with its JOINED rows: Native, then what its CLI listed. It is
 * the only catalog route (owner's follow-up, 2026-09-08), and since 2026-09-25 the only
 * join: no client joins anything.
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
const { providerCatalogAnswer, STOCK_CATALOG_MD } = await import('../src/model-providers.js');

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
  assert.deepEqual(body, JSON.parse(JSON.stringify(await providerCatalogAnswer(null))), 'the client reads exactly what the server joins; this box has no record, so nothing is listed');
  assert.equal(body.origin, 'stock');
  assert.equal(body.path, STOCK_CATALOG_MD);
  assert.match(body.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(body).sort(), ['measured_at', 'origin', 'path', 'providers', 'refreshed_at', 'stock_updated', 'updated', 'withdrawn']);
  assert.equal(body.stock_updated, body.updated, 'no owner copy: the one date is the shipped one');
  assert.equal(body.refreshed_at, '', 'never refreshed, and said so');
  assert.deepEqual(body.withdrawn, []);
  assert.ok(body.providers.length >= 5);
  for (const entry of body.providers) {
    assert.deepEqual(Object.keys(entry).filter((key) => !['maturity', 'native', 'nativeDangerousCmd', 'launch_modes'].includes(key)).sort(), ['cli', 'cli_label', 'label', 'models', 'off', 'operational', 'origin', 'provider', 'shadowed']);
    assert.equal(entry.origin, 'stock');
    assert.equal(entry.operational, false);
    if (entry.maturity === 'comingSoon') assert.deepEqual(entry.models, [], `${entry.label} is visible but unavailable`);
    else {
      assert.ok(entry.native, `${entry.label} carries its native launch`);
      assert.ok(entry.launch_modes.includes('configured'), `${entry.label} carries supported launch modes`);
      assert.deepEqual(entry.models.map((row: { model: string; name: string; selectable: boolean }) => [row.model, row.name, row.selectable]), [['native', 'Native', false]], `${entry.label}: nothing read from its CLI, so Native alone and not selectable`);
    }
  }
});

test.after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(box, { recursive: true, force: true });
});
