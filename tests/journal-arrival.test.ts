/**
 * A WATCHED AGENT'S JOURNAL IS HEARD WHEN IT IS WRITTEN (KAN-453).
 *
 * A tile opens on Chat before the CLI has written anything. Nothing follows a journal that
 * is not there, and the browser must not poll for it, so Core waits for the file and, when
 * it appears, raises the same transcript watch a tab raises — which has the part install its
 * watcher and push the records to the open Chat.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = await mkdtemp(path.join(tmpdir(), 'journal-arrival-'));
process.env.RONIN_DATA_ROOT = path.join(base, 'data');
const root = path.join(base, 'projects');

const { tmux } = await import('../src/tmux-client.js');
const { writeLaunchIdentity } = await import('../src/launch-binding.js');
const { sockets } = await import('../src/sockets.js');
const { awaitJournal } = await import('../src/journal-arrival.js');

const heard: string[] = [];
sockets.onTranscriptWatch((name) => void heard.push(name));
const until = async (done: () => boolean, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end && !done();) await new Promise((r) => setTimeout(r, 25));
};

test('a pending journal raises the transcript watch the moment the CLI writes it, and only then', async (t) => {
  t.mock.method(tmux, 'run', async (args: readonly string[]) => (args[0] === 'display-message' ? 'fresh-key' : ''));
  await writeLaunchIdentity({
    key: 'fresh-key', cli: 'claude', strategy: 'minted', providerSession: 'sid-1', env: {},
    journal: { format: 'message-blocks', root, pattern: '{session_id}.jsonl', idPath: 'sessionId', childPath: 'isSidechain' },
  } as never);
  const slug = path.join(root, '-the-project');
  await mkdir(slug, { recursive: true });

  await awaitJournal('fresh');
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(heard, [], 'nothing written, nothing raised');

  // Another Agent writing in the same folder is not this one's journal.
  await writeFile(path.join(slug, 'someone-else.jsonl'), '{}\n');
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(heard, []);

  await writeFile(path.join(slug, 'sid-1.jsonl'), JSON.stringify({ sessionId: 'sid-1', type: 'user' }) + '\n');
  await until(() => heard.length > 0);
  assert.deepEqual(heard, ['fresh'], 'raised once, when the journal appeared');

  // Done waiting: a later write is the part's own watcher's business, not this one's.
  await writeFile(path.join(slug, 'sid-1.jsonl'), '{}\n{}\n');
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(heard, ['fresh']);
});
