/**
 * THE LIBRARY ADDRESS behind the one AGERU door: the allowlist names exactly HQ and the
 * library host, and a bundle URL cannot walk the client off the library — a different
 * origin or a path above the base is refused before any socket opens. No network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'ronin-library-transport-'));
process.env.RONIN_DATA_ROOT = root;
process.env.RONIN_LIBRARY_BASE = 'https://hq.ronincowork.com/library/';
const { fetchLibrary, EgressRefused, LIBRARY_BASE } = await import('../src/activation/transport.js');

test('a bundle url cannot leave the library, and no token means no call', async () => {
  assert.equal(LIBRARY_BASE, 'https://hq.ronincowork.com/library/');
  // A Services feature: without an entitlement the read is refused before any socket opens.
  await assert.rejects(fetchLibrary('index.json', ''), (e: unknown) => e instanceof EgressRefused && /Ronin Services feature/.test((e as Error).message));
  // Off the allowlist entirely: refused as any host would be.
  await assert.rejects(fetchLibrary('https://evil.example/index.json', 't'), (e: unknown) => e instanceof EgressRefused && /not the allowlisted Ronin host/.test((e as Error).message));
  // On the host but not under the library: the door is shared, the shelf is not.
  await assert.rejects(fetchLibrary('https://hq.ronincowork.com/v1/anything.json', 't'), /outside the template library/);
  await assert.rejects(fetchLibrary('../index.json', 't'), /outside the template library/);
  await assert.rejects(fetchLibrary('http://hq.ronincowork.com/library/index.json', 't'), /plaintext/);
});

test.after(async () => {
  delete process.env.RONIN_DATA_ROOT;
  delete process.env.RONIN_LIBRARY_BASE;
  await rm(root, { recursive: true, force: true });
});
