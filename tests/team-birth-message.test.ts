import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openTestServer, closeTestServer } from './helpers/testserver.js';

test('birth records membership without terminal input; later joins still submit a notice', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-team-birth-'));
  const names = ['WIPEBOARDS', 'MESSAGE_QUEUE', 'DESKS', 'CONFIG', 'TEAM_ROSTERS'];
  const previous = new Map(names.map((name) => [`RONIN_${name}_DIR`, process.env[`RONIN_${name}_DIR`]]));
  for (const name of names) process.env[`RONIN_${name}_DIR`] = path.join(root, name.toLowerCase());
  const server = await openTestServer('team_birth_notice', { onPath: true });
  t.after(async () => {
    await closeTestServer(server);
    await fs.rm(root, { recursive: true, force: true });
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const input = path.join(root, 'input');
  const reader = `const fs=require('node:fs');process.stdin.setRawMode(true);process.stdin.on('data',d=>fs.appendFileSync(${JSON.stringify(input)},d));process.stdout.write('BOOTING');`;
  await server.run('new-session', '-d', '-s', 'newborn', process.execPath, '-e', reader);
  for (let i = 0; i < 50; i++) {
    if ((await server.run('capture-pane', '-p', '-t', '=newborn:')).includes('BOOTING')) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const { ensureBoard, readBoard } = await import('../src/wipeboards.js');
  const { announceTeamChanges } = await import('../src/routes/wipeboards-api.js');
  const { listQueuedMessages, processMessageQueue } = await import('../src/message-queue.js');
  await ensureBoard('birth_crew');
  await announceTeamChanges('newborn', [], ['birth_crew'], { notifyAgent: false });
  assert.equal((await readBoard('birth_crew')).posts.length, 1);
  assert.deepEqual(await listQueuedMessages(), []);
  assert.equal(await fs.readFile(input, 'utf8').catch(() => ''), '', 'no second message or Enter at birth');

  const later = await announceTeamChanges('newborn', [], ['birth_crew']);
  assert.equal(later.birth_crew, 'queued');
  await processMessageQueue();
  let received = '';
  for (let i = 0; i < 50; i++) {
    received = await fs.readFile(input, 'utf8').catch(() => '');
    if (received.endsWith('\r')) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.match(received, /You're on the "birth_crew" team/);
  assert.equal(received.match(/\r/g)?.length, 1, 'later notice ends with one Enter');
});
