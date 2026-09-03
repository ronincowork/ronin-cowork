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
process.env.RONIN_LIBRARY_BASE = 'https://ronincowork.com/library/';
const { fetchLibrary, EgressRefused, LIBRARY_BASE } = await import('../src/activation/transport.js');

test('a bundle url cannot leave the library', async () => {
  assert.equal(LIBRARY_BASE, 'https://ronincowork.com/library/');
  // Off the allowlist entirely: refused as any host would be.
  await assert.rejects(fetchLibrary('https://evil.example/index.json'), (e: unknown) => e instanceof EgressRefused && /not an allowlisted Ronin host/.test((e as Error).message));
  // On the allowlist (HQ) but not the library: the door is shared, the shelf is not.
  await assert.rejects(fetchLibrary('https://hq.ronincowork.com/index.json'), /outside the template library/);
  await assert.rejects(fetchLibrary('http://ronincowork.com/library/index.json'), /plaintext/);
  await assert.rejects(fetchLibrary('../index.json'), /outside the template library/);
  await assert.rejects(fetchLibrary('/index.json'), /outside the template library/);
});

test.after(async () => {
  delete process.env.RONIN_DATA_ROOT;
  delete process.env.RONIN_LIBRARY_BASE;
  await rm(root, { recursive: true, force: true });
});
