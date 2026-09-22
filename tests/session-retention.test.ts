import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DAY = 86_400_000;

test('closed, unarchived folders go after the period; live, archived, and young ones stay; 0 is off', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'session-retention-'));
  const old = process.env.RONIN_SESSION_DIR; process.env.RONIN_SESSION_DIR = root;
  t.after(async () => { if (old === undefined) delete process.env.RONIN_SESSION_DIR; else process.env.RONIN_SESSION_DIR = old; await fs.rm(root, { recursive: true, force: true }); });
  const { sweepSessionFolders } = await import('../src/session-retention.js');
  const now = Date.now();
  const folder = async (key: string, ageDays: number, withTranscript = false) => {
    const dir = path.join(root, key); await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'birth-receipt.json'), '{}');
    if (withTranscript) await fs.writeFile(path.join(dir, 'transcript.jsonl'), '{"seq":0}\n');
    const at = new Date(now - ageDays * DAY);
    for (const name of await fs.readdir(dir)) await fs.utimes(path.join(dir, name), at, at);
    await fs.utimes(dir, at, at);
  };
  await folder('stale-1', 8);
  await folder('stale-2', 30, true);
  await folder('fresh-1', 6);
  await folder('live-1', 40);
  await folder('archived-1', 40);
  await fs.writeFile(path.join(root, 'not-a-folder.txt'), 'x');
  // The newest write counts, not the folder's own mtime: a transcript written yesterday keeps a folder made a month ago.
  await folder('revived-1', 30);
  const yesterday = new Date(now - DAY);
  await fs.writeFile(path.join(root, 'revived-1', 'transcript.jsonl'), '{"seq":0}\n');
  await fs.utimes(path.join(root, 'revived-1', 'transcript.jsonl'), yesterday, yesterday);

  const off = await sweepSessionFolders({ days: 0, now, live: new Set(), archived: new Set() });
  assert.deepEqual(off, []);
  assert.equal((await fs.readdir(root)).length, 7);

  const removed = await sweepSessionFolders({ days: 7, now, live: new Set(['live-1']), archived: new Set(['archived-1']) });
  assert.deepEqual(removed.sort(), ['stale-1', 'stale-2']);
  assert.deepEqual((await fs.readdir(root)).sort(), ['archived-1', 'fresh-1', 'live-1', 'not-a-folder.txt', 'revived-1']);
});

test('the period is the most generous campaign value; any 0 switches the sweep off; unset means seven days', async () => {
  const { retentionDays, DEFAULT_RETENTION_DAYS } = await import('../src/session-retention.js');
  const stated = (values: unknown[]) => values.map((v) => ({ config: { cowork_defaults: v === undefined ? {} : { session_retention_days: v } } }));
  assert.equal(retentionDays(stated([])), DEFAULT_RETENTION_DAYS);
  assert.equal(retentionDays(stated([undefined, undefined])), DEFAULT_RETENTION_DAYS);
  assert.equal(retentionDays(stated([3, 14])), 14);
  assert.equal(retentionDays(stated(['21'])), 21);
  assert.equal(retentionDays(stated([14, 0])), 0);
  assert.equal(retentionDays(stated(['soon', -2])), DEFAULT_RETENTION_DAYS);
});
