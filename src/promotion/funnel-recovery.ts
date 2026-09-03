import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';
import { AUTOMATION_IDENTITY, changedFiles, git, GitError, gitOut, revParse, worktreeAddDetached, worktreeRemove } from '../desks/git.js';
import type { RepoSpec } from './candidate.js';

export type FunnelRecoveryState = 'diagnosed' | 'preserving' | 'preserved' | 'clearing' | 'clean' | 'stopped';
export type FunnelPathClass = 'preserved' | 'unique' | 'deleted';

export interface FunnelPathFinding {
  path: string;
  status: string;
  tracked: boolean;
  hash: string;
  classification: FunnelPathClass;
  identical_refs: string[];
  overlaps_candidate: boolean;
}

export interface FunnelRecoveryReceipt {
  id: string;
  kind: 'funnel_recovery';
  state: FunnelRecoveryState;
  created_at: string;
  updated_at: string;
  by: string;
  repo: string;
  dir: string;
  target: string;
  target_sha: string;
  line: string;
  line_sha: string;
  paths: FunnelPathFinding[];
  whole_set_refs: string[];
  overlap_files: string[];
  conflict_files: string[];
  recovery_ref?: string;
  recovery_commit?: string;
  history: Array<{ state: FunnelRecoveryState; at: string; detail?: string }>;
}

const ledgerDir = (): string => path.join(storeDir('promotion_ledger'), 'funnel-recovery');
const receiptFile = (id: string, dir = ledgerDir()): string => {
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('invalid funnel recovery receipt id');
  return path.join(dir, `${id}.json`);
};
const now = (): string => new Date().toISOString();
const id = (repo: string): string => `${now().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-funnel-${repo.replace(/[^a-zA-Z0-9._-]/g, '_')}-${Math.random().toString(36).slice(2, 6)}`;

export async function writeFunnelReceipt(r: FunnelRecoveryReceipt, dir = ledgerDir()): Promise<void> {
  await mkdir(dir, { recursive: true });
  const file = receiptFile(r.id, dir);
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(r, null, 2) + '\n');
  await rename(tmp, file);
}

export async function readFunnelReceipt(receiptId: string, dir = ledgerDir()): Promise<FunnelRecoveryReceipt | null> {
  try { return JSON.parse(await readFile(receiptFile(receiptId, dir), 'utf8')) as FunnelRecoveryReceipt; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}

export async function listFunnelReceipts(dir = ledgerDir()): Promise<FunnelRecoveryReceipt[]> {
  try {
    const names = (await readdir(dir)).filter((x) => x.endsWith('.json')).sort();
    return Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(dir, name), 'utf8')) as FunnelRecoveryReceipt));
  } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
}

function moved(r: FunnelRecoveryReceipt, state: FunnelRecoveryState, detail?: string): FunnelRecoveryReceipt {
  const at = now();
  return { ...r, state, updated_at: at, history: [...r.history, { state, at, ...(detail ? { detail } : {}) }] };
}

interface StatusPath { status: string; path: string; tracked: boolean }
async function statusPaths(dir: string): Promise<StatusPath[]> {
  const raw = (await git(dir, ['status', '--porcelain', '-z', '--untracked-files=all'])).stdout;
  const cells = raw.split('\0').filter(Boolean);
  const out: StatusPath[] = [];
  for (let i = 0; i < cells.length; i++) {
    const row = cells[i]!;
    const status = row.slice(0, 2);
    let p = row.slice(3);
    if (/^[RC]/.test(status) && cells[i + 1]) p = cells[++i]!;
    out.push({ status, path: p, tracked: status !== '??' });
  }
  return out;
}

async function worktreeHash(dir: string, p: StatusPath): Promise<string> {
  if (p.status.includes('D')) return '';
  try { return await gitOut(dir, ['hash-object', '--', p.path]); } catch { return ''; }
}

async function refs(dir: string): Promise<string[]> {
  const raw = await gitOut(dir, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes']).catch(() => '');
  return raw.split('\n').filter((x) => x && !x.endsWith('/HEAD'));
}

async function identicalRefs(dir: string, file: string, hash: string, names: string[]): Promise<string[]> {
  if (!hash) return [];
  const out: string[] = [];
  for (const ref of names) {
    const got = await gitOut(dir, ['rev-parse', '--verify', `${ref}:${file}`]).catch(() => '');
    if (got === hash) out.push(ref);
  }
  return out;
}

async function mergeConflicts(dir: string, left: string, right: string): Promise<string[]> {
  if (!left || !right) return [];
  try { await git(dir, ['merge-tree', '--write-tree', left, right]); return []; }
  catch (e) {
    const text = e instanceof GitError ? `${e.stdout}\n${e.stderr}` : String((e as Error).message);
    const fromMessage = [...text.matchAll(/CONFLICT \([^)]*\): .*? in (.+)$/gm)].map((m) => m[1]!.trim());
    return [...new Set(fromMessage)];
  }
}

/** Read-only diagnosis. Writing the receipt is the only effect. */
export async function diagnoseFunnel(spec: RepoSpec, by: string, outDir = ledgerDir()): Promise<FunnelRecoveryReceipt> {
  const target_sha = await revParse(spec.dir, `refs/heads/${spec.target}`);
  const line_sha = await revParse(spec.dir, `refs/heads/${spec.line}`);
  const dirty = await statusPaths(spec.dir);
  const candidateFiles = new Set(await changedFiles(spec.dir, target_sha, line_sha));
  const names = await refs(spec.dir);
  const paths: FunnelPathFinding[] = [];
  for (const p of dirty) {
    const hash = await worktreeHash(spec.dir, p);
    const same = await identicalRefs(spec.dir, p.path, hash, names);
    paths.push({
      ...p,
      hash,
      classification: !hash ? 'deleted' : same.length ? 'preserved' : 'unique',
      identical_refs: same,
      overlaps_candidate: candidateFiles.has(p.path),
    });
  }
  const tracked = paths.filter((p) => p.tracked);
  const whole_set_refs = tracked.length ? names.filter((name) => tracked.every((p) => p.hash && p.identical_refs.includes(name))) : [];
  const overlap_files = paths.filter((p) => p.overlaps_candidate).map((p) => p.path);
  const conflict_files = whole_set_refs.length ? await mergeConflicts(spec.dir, line_sha, whole_set_refs[0]!) : [];
  const at = now();
  const receipt: FunnelRecoveryReceipt = {
    id: id(spec.repo), kind: 'funnel_recovery', state: 'diagnosed', created_at: at, updated_at: at,
    by, repo: spec.repo, dir: spec.dir, target: spec.target, target_sha, line: spec.line, line_sha,
    paths, whole_set_refs, overlap_files, conflict_files, history: [{ state: 'diagnosed', at }],
  };
  await writeFunnelReceipt(receipt, outDir);
  return receipt;
}

async function currentMatches(r: FunnelRecoveryReceipt): Promise<string[]> {
  const current = new Map((await statusPaths(r.dir)).map((p) => [p.path, p]));
  const changed: string[] = [];
  for (const finding of r.paths) {
    const p = current.get(finding.path);
    if (!p || (await worktreeHash(r.dir, p)) !== finding.hash) changed.push(finding.path);
  }
  return changed;
}

/** Preserve the complete diagnosed dirty state on a named recovery branch, without using the funnel index. */
export async function preserveFunnel(receiptId: string, outDir = ledgerDir()): Promise<FunnelRecoveryReceipt> {
  let r = await readFunnelReceipt(receiptId, outDir);
  if (!r) throw new Error(`no funnel recovery receipt ${receiptId}`);
  if (r.state !== 'diagnosed' && r.state !== 'stopped') throw new Error(`${receiptId} is ${r.state} — only a diagnosis preserves`);
  const drift = await currentMatches(r);
  if (drift.length) { r = moved(r, 'stopped', `files changed after diagnosis: ${drift.join(', ')}`); await writeFunnelReceipt(r, outDir); return r; }
  r = moved(r, 'preserving'); await writeFunnelReceipt(r, outDir);
  const branch = `recovery/${r.id}`;
  const wt = path.join(storeDir('worktrees'), '.recovery', r.repo, r.id);
  await mkdir(path.dirname(wt), { recursive: true });
  try {
    await worktreeAddDetached(r.dir, wt, r.target_sha);
    for (const p of r.paths) {
      const from = path.join(r.dir, p.path); const to = path.join(wt, p.path);
      if (!p.hash) await rm(to, { recursive: true, force: true });
      else { await mkdir(path.dirname(to), { recursive: true }); await cp(from, to, { recursive: true, force: true }); }
    }
    await git(wt, ['add', '-A']);
    await git(wt, [...AUTOMATION_IDENTITY, 'commit', '--no-verify', '-q', '-m', `Preserve dirty funnel state (${r.id})`]);
    const commit = await revParse(wt, 'HEAD');
    await git(r.dir, ['update-ref', `refs/heads/${branch}`, commit, '0000000000000000000000000000000000000000']);
    r = { ...moved(r, 'preserved'), recovery_ref: branch, recovery_commit: commit };
    await writeFunnelReceipt(r, outDir);
    return r;
  } catch (e) {
    r = moved(r, 'stopped', String((e as Error).message)); await writeFunnelReceipt(r, outDir); return r;
  } finally {
    await worktreeRemove(r.dir, wt, true).catch(() => rm(wt, { recursive: true, force: true }));
  }
}

/** Explicit cleanup after preservation. Only diagnosed tracked paths are restored. */
export async function clearFunnel(receiptId: string, outDir = ledgerDir()): Promise<FunnelRecoveryReceipt> {
  let r = await readFunnelReceipt(receiptId, outDir);
  if (!r) throw new Error(`no funnel recovery receipt ${receiptId}`);
  if (r.state !== 'preserved' || !r.recovery_commit) throw new Error(`${receiptId} is not preserved — refusing to clear`);
  if ((await revParse(r.dir, `refs/heads/${r.target}`)) !== r.target_sha) throw new Error(`${r.target} moved after diagnosis — diagnose again`);
  const drift = await currentMatches(r);
  if (drift.length) { r = moved(r, 'stopped', `files changed after preservation: ${drift.join(', ')}`); await writeFunnelReceipt(r, outDir); return r; }
  r = moved(r, 'clearing'); await writeFunnelReceipt(r, outDir);
  const tracked = r.paths.filter((p) => p.tracked).map((p) => p.path);
  if (tracked.length) await git(r.dir, ['restore', '--source', r.target_sha, '--staged', '--worktree', '--', ...tracked]);
  const remains = (await statusPaths(r.dir)).filter((p) => p.tracked);
  r = moved(r, remains.length ? 'stopped' : 'clean', remains.length ? `tracked dirt remains: ${remains.map((p) => p.path).join(', ')}` : undefined);
  await writeFunnelReceipt(r, outDir);
  return r;
}
