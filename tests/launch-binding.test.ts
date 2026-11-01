import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newProviderSession } from '../src/agents.js';
import { readAgentLaunches } from '../src/agent-launches.js';
import { processLaunch, readLaunchIdentity } from '../src/launch-binding.js';
import { resolveLaunchJournal } from '../src/launch-journal.js';

const dir = fileURLToPath(new URL('../docs/agents/', import.meta.url));
const grammars = await Promise.all((await readdir(dir)).filter(n => n !== 'README.md' && n.endsWith('.md'))
  .map(n => readAgentLaunches(n.slice(0, -3))));
const mint = grammars.find(g => g.newSessionId.length)!;
const isolated = grammars.find(g => g.isolation)!;

test('one grammar assignment on actual argv; a named conversation keeps its id and argv', async () => {
  const cli = mint.native[0]!;
  const first = await newProviderSession(cli, mint.native);
  assert.equal(first.strategy, 'minted');
  assert.equal(first.argv.filter(arg => arg === mint.newSessionId[0]).length, 1);
  const second = await newProviderSession(cli, first.argv);
  assert.deepEqual(second, first);
  const resumed = mint.resume.map(p => p.replace('{session_id}', first.id));
  assert.equal((await newProviderSession(cli, resumed)).id, first.id);
  const opaque = mint.resume.map(p => p.replace('{session_id}', 'thread-opaque-id'));
  assert.equal((await newProviderSession(cli, opaque)).id, 'thread-opaque-id');
});

test('strategy follows grammar rather than a provider list', async () => {
  for (const grammar of grammars) {
    const result = await newProviderSession(grammar.native[0]!, grammar.native);
    assert.equal(result.strategy, grammar.newSessionId.length ? 'minted' : grammar.isolation ? 'isolated' : 'unbound');
  }
});

test('isolated launch mirrors newly discovered settings but owns its journal; restore reuses home', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'launch-isolation-'));
  const source = path.join(root, 'original-home'), store = path.join(root, 'sessions');
  await mkdir(source); await mkdir(path.join(source, isolated.isolation!.private as string));
  await writeFile(path.join(source, 'future-setting'), 'preserve me');
  await writeFile(path.join(source, isolated.isolation!.private as string, 'neighbour.jsonl'), 'foreign');
  const envName = isolated.isolation!.env;
  const oldHome = process.env[envName], oldStore = process.env.RONIN_SESSION_DIR;
  process.env[envName] = source; process.env.RONIN_SESSION_DIR = store;
  t.after(async () => {
    if (oldHome === undefined) delete process.env[envName]; else process.env[envName] = oldHome;
    if (oldStore === undefined) delete process.env.RONIN_SESSION_DIR; else process.env.RONIN_SESSION_DIR = oldStore;
    await rm(root, { recursive: true, force: true });
  });
  const identity = await processLaunch({ name: 'one', key: 'one-key', cli: isolated.native[0]!, argv: isolated.native, cwd: root }, async (_argv, env, identity) => {
    assert.equal(env[envName], identity.home);
    assert.equal(await realpath(path.join(identity.home!, 'future-setting')), path.join(source, 'future-setting'));
    assert.deepEqual(await readdir(identity.journal!.root), []);
    assert.equal((await readLaunchIdentity('one-key'))?.home, identity.home, 'persist before start');
    await writeFile(path.join(identity.journal!.root, 'rollout-own.jsonl'), JSON.stringify({ type: 'session_meta', payload: { session_id: '11111111-2222-3333-4444-555555555555', source: 'cli' } }) + '\n');
  });
  const file = await resolveLaunchJournal(identity);
  assert.ok(file?.startsWith(identity.home!));
  const argv = isolated.resume.map(p => p.replace('{session_id}', identity.providerSession));
  const restored = await processLaunch({ name: 'one', key: 'one-key', cli: isolated.native[0]!, argv, cwd: root, resume: true }, async (actual, env) => {
    assert.deepEqual(actual, argv); assert.equal(env[envName], identity.home);
  });
  assert.equal(restored.home, identity.home);
  assert.equal(await readFile(path.join(restored.home!, 'future-setting'), 'utf8'), 'preserve me');
});

test('all process starts pass through one serial entry, including unbound shells', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'launch-serial-'));
  const old = process.env.RONIN_SESSION_DIR; process.env.RONIN_SESSION_DIR = root;
  t.after(async () => { if (old === undefined) delete process.env.RONIN_SESSION_DIR; else process.env.RONIN_SESSION_DIR = old; await rm(root, { recursive: true, force: true }); });
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const events: string[] = [];
  const first = processLaunch({ name: 'a', cli: '', argv: [], cwd: root }, async () => { events.push('a'); await gate; });
  const second = processLaunch({ name: 'b', cli: '', argv: [], cwd: root }, async () => { events.push('b'); });
  while (!events.length) await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(events, ['a']); release();
  const result = await Promise.all([first, second]);
  assert.deepEqual(events, ['a', 'b']); assert.ok(result.every(r => r.strategy === 'unbound'));
});


test('Hermes isolates SQLite files and memory, and records its cli-home before startup', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'hermes-isolation-'));
  const source = path.join(root, 'source'); await mkdir(source);
  for (const file of ['state.db', 'state.db-wal', 'state.db-shm', 'config.yaml']) await writeFile(path.join(source, file), 'source');
  await mkdir(path.join(source, 'memories')); await writeFile(path.join(source, 'memories', 'MEMORY.md'), 'private');
  const old = process.env.HERMES_HOME, oldStore = process.env.RONIN_SESSION_DIR;
  process.env.HERMES_HOME = source; process.env.RONIN_SESSION_DIR = path.join(root, 'sessions');
  t.after(async () => { if (old === undefined) delete process.env.HERMES_HOME; else process.env.HERMES_HOME = old; if (oldStore === undefined) delete process.env.RONIN_SESSION_DIR; else process.env.RONIN_SESSION_DIR = oldStore; await rm(root, { recursive: true, force: true }); });
  const result = await processLaunch({ name: 'hermes', key: 'hermes-birth', cli: 'hermes', argv: ['hermes', 'chat'], cwd: root }, async (_argv, env, identity) => {
    assert.equal(identity.strategy, 'isolated');
    assert.equal(identity.home, path.join(root, 'sessions', 'hermes-birth', 'cli-home'));
    assert.equal(env.HERMES_HOME, identity.home);
    assert.equal((await readLaunchIdentity('hermes-birth'))?.home, identity.home);
    assert.deepEqual(await readdir(identity.home!), ['config.yaml']);
    assert.equal(await realpath(path.join(identity.home!, 'config.yaml')), path.join(source, 'config.yaml'));
    await writeFile(path.join(identity.home!, 'state.db'), 'own database');
  });
  assert.equal(await readFile(path.join(source, 'state.db'), 'utf8'), 'source');
  assert.equal(await readFile(path.join(result.home!, 'state.db'), 'utf8'), 'own database');
});
