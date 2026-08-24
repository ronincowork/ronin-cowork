import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('archive manifests round-trip and list newest first', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-archive-test-'));
  process.env.RONIN_ARCHIVED_SESSIONS_DIR = dir;
  const archive = await import(`../src/session-archive.js?test=${Date.now()}`);
  const base = {
    version: 1 as const, id: 'alpha-123', name: 'alpha', key: 'alpha-123',
    archived_at: '2026-08-24T00:00:00.000Z', cwd: '/tmp', agent: 'claude',
    provider_session_id: '00000000-0000-0000-0000-000000000000',
    tags: ['team'], leads: [], wipeboards: [], note: '', control: 'write' as const,
    project_root: 'ronin_cowork', session_role: 'CutCode',
  };
  try {
    await archive.writeArchive(base);
    await assert.rejects(archive.writeArchive(base), { code: 'EEXIST' });
    await archive.writeArchive({ ...base, id: 'beta-456', name: 'beta', key: 'beta-456', archived_at: '2026-08-24T01:00:00.000Z' });
    assert.deepEqual(await archive.readArchive(base.id), base);
    assert.deepEqual((await archive.listArchives()).map((v) => v.id), ['beta-456', 'alpha-123']);
    await archive.removeArchive(base.id);
    await assert.rejects(archive.readArchive(base.id), { code: 'ENOENT' });
  } finally {
    delete process.env.RONIN_ARCHIVED_SESSIONS_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('Codex discovery requires one matching rollout and writer lock', async () => {
  const { codexIdFromFdTargets } = await import('../src/session-archive.js');
  const id = '01a03237-a381-7f01-8b0d-e64b38b6bc95';
  assert.equal(codexIdFromFdTargets([
    { target: `/tmp/thread-writer-locks/${id}.lock`, modified: 1 },
    { target: `/tmp/sessions/rollout-2026-08-24T05-21-42-${id}.jsonl`, modified: 2 },
  ]), id);
  assert.equal(codexIdFromFdTargets([{ target: `/tmp/thread-writer-locks/${id}.lock`, modified: 1 }]), '');
  assert.equal(codexIdFromFdTargets([
    { target: `/tmp/thread-writer-locks/${id}.lock`, modified: 1 },
    { target: `/tmp/sessions/rollout-2026-08-24T05-21-42-11111111-1111-1111-1111-111111111111.jsonl`, modified: 2 },
  ]), '');
});

test('legacy provider identity is inferred only from the executable argv', async () => {
  const { providerFromArgv } = await import('../src/session-archive.js');
  assert.equal(providerFromArgv(['/usr/bin/node', '/usr/bin/codex', '--model', 'x']), 'codex');
  assert.equal(providerFromArgv(['/home/me/.local/bin/claude', '--model', 'opus']), 'claude');
  assert.equal(providerFromArgv(['/bin/bash']), '');
});

test('provider lifecycle syntax comes from the agent registry', async () => {
  const { AGENTS, newProviderSession } = await import('../src/agents.js');
  const stamped = newProviderSession('claude', ['/bin/claude', '--model', 'opus', 'brief']);
  assert.match(stamped.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(stamped.argv, ['/bin/claude', '--session-id', stamped.id, '--model', 'opus', 'brief']);
  assert.deepEqual(AGENTS.find((agent) => agent.id === 'codex')?.operations.session.resume, ['resume']);
  assert.deepEqual(AGENTS.find((agent) => agent.id === 'gemini')?.operations.session.resume, ['--resume']);
  assert.equal(AGENTS.find((agent) => agent.id === 'gemini')?.operations.session.discovery, 'unsupported');
});

test('archive ids cannot escape the archive directory', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-archive-id-test-'));
  process.env.RONIN_ARCHIVED_SESSIONS_DIR = dir;
  const archive = await import(`../src/session-archive.js?idtest=${Date.now()}`);
  try {
    await assert.rejects(archive.readArchive('../outside'), /Invalid archive id/);
  } finally {
    delete process.env.RONIN_ARCHIVED_SESSIONS_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('argvFromProc preserves argv boundaries and fails closed for a dead pid', async () => {
  const { argvFromProc } = await import('../src/session-archive.js');
  const argv = await argvFromProc(process.pid);
  assert.ok(argv.length >= 1);
  assert.deepEqual(await argvFromProc(999_999_999), []);
});
