/**
 * AN AGENT'S END ARCHIVES IT (KAN-501; docs/architecture/session-archive.md, An Agent's own end):
 * session_end, and so Done on an Agent's last item, closes its desks and archives it through the
 * one archive, so session_restore brings it back; the lead's end notice names the archive and its
 * restore; Delete and Hard Delete are unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const isolated = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-end-archives-'));
process.env.HOME = isolated;
process.env.RONIN_USER_ROOT = path.join(isolated, 'user');
process.env.RONIN_DATA_ROOT = path.join(isolated, 'data');
process.env.RONIN_MESSAGE_QUEUE_DIR = path.join(isolated, 'queue');
delete process.env.RONIN_SOCKET;
delete process.env.TMUX;

const route = await fs.readFile(new URL('../src/routes/sessions-api.ts', import.meta.url), 'utf8');
const between = (from: string, to: string) => route.slice(route.indexOf(from), route.indexOf(to, route.indexOf(from) + 1));

test('session_end archives through the one archive; only an unresumable conversation ends outright', () => {
  const harakiri = between("app.post('/api/harakiri'", "app.get('/api/sessions/:name/project-root'");
  assert.match(harakiri, /await performAgentEnd\(name\)/);
  assert.doesNotMatch(harakiri, /performAgentShutdown/);
  const end = between('async function performAgentEnd', 'async function performAgentShutdown');
  assert.match(end, /shutdownAgent\(name/, 'desks close as before, with the same checks');
  assert.match(end, /archived = await archiveAgent\(session\); if \(!end\.archived\) await liveOps\.stop/);
  assert.match(end, /if \(!archived\) emitSessionEnd/, 'an archive keeps the tape and the session folder');
  assert.match(end, /releaseHolds\(name, key, 'session ended', archived\)/);
  // One archive: the archive route and session_end share archiveAgent; nothing writes a manifest twice.
  assert.equal(route.match(/await writeArchive\(/g)?.length, 1);
  assert.equal(route.match(/await archiveAgent\(/g)?.length, 2);
  const archive = between("app.post('/api/sessions/:name/archive'", "app.post('/api/archived-sessions/:id/rehydrate'");
  assert.match(archive, /await archiveAgent\(name\)/);
});

test('Delete and Hard Delete are unchanged: they end outright', () => {
  const hard = between('async function performAgentHardDelete', 'async function prepareSessionEnding');
  assert.match(hard, /killSessionTree\(name/);
  assert.match(hard, /emitSessionEnd\(name, key\)/);
  assert.doesNotMatch(hard, /archiveAgent/);
  const shutdown = between('async function performAgentShutdown', 'async function performAgentHardDelete');
  assert.match(shutdown, /emitSessionEnd\(name, key\)/);
  assert.doesNotMatch(shutdown, /archiveAgent/);
});

test('the lead\'s end notice names the archive id and the restore command', async () => {
  const releases = between('async function releaseHolds', 'async function archiveAgent');
  assert.match(releases, /archived as \$\{archived\.id\}: session_restore \$\{archived\.id\}/);
  assert.match(releases, /memberEnded\(name, restore \? `\$\{name\} ended, \$\{restore\}` : ''\)/);
  const { ackRecord } = await import('../src/tegami.ts');
  const { listQueuedMessages } = await import('../src/message-queue.ts');
  await ackRecord('the_lead', 'ender', 'ender ended, archived as ender-123: session_restore ender-123');
  await ackRecord('the_lead', 'other');
  const said = (await listQueuedMessages()).filter((m) => m.target === 'the_lead').map((m) => m.text);
  assert.deepEqual(said, [
    'Your work record changed; please read it (work-record read). ender ended, archived as ender-123: session_restore ender-123',
    'Your work record changed; please read it (work-record read).',
  ]);
});
