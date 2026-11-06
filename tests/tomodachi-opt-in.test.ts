import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('disabled Stats leaves pending packets untouched without dispatch', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stats-opt-in-'));
  process.env.RONIN_TELEMETRY_DIR = dir;
  try {
    await fs.mkdir(path.join(dir, 'outbox'));
    const packet = path.join(dir, 'outbox', 'pending.json');
    await fs.writeFile(packet, '{}');
    const { sendDuePackets } = await import('../src/activation/tomodachi.js');
    const report = await sendDuePackets();
    assert.equal(report.skipped, 'disabled');
    assert.equal(report.attempted, 0);
    assert.equal(await fs.readFile(packet, 'utf8'), '{}');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('a self-hosted Ronin never sends: counting on, packets waiting, no office record', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stats-self-hosted-'));
  const office = await fs.mkdtemp(path.join(os.tmpdir(), 'stats-office-'));
  process.env.RONIN_TELEMETRY_DIR = dir;
  process.env.RONIN_OFFICE_DIR = office;
  try {
    await fs.mkdir(path.join(dir, 'outbox'));
    await fs.writeFile(path.join(dir, 'outbox', 'pending.json'), '{}');
    const { noteService } = await import('../src/sockets.js');
    noteService('counting');
    const { sendDuePackets } = await import('../src/activation/tomodachi.js');
    const report = await sendDuePackets();
    assert.equal(report.skipped, 'self-hosted');
    assert.equal(report.attempted, 0);
    assert.equal((await fs.readdir(path.join(dir, 'outbox'))).length, 1, 'the packet stays where it was');
  } finally {
    delete process.env.RONIN_OFFICE_DIR;
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(office, { recursive: true, force: true });
  }
});
