import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';
import { branchKey } from './registry.js';

export const lockDir = (repo: string, line: string): string =>
  path.join(storeDir('desks'), 'queues', repo, `${branchKey(line)}.lock`);

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tryAcquire(dir: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: false });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
      await mkdir(path.dirname(dir), { recursive: true });
      return tryAcquire(dir);
    }
    const owner = await readFile(path.join(dir, 'owner'), 'utf8').catch(() => '');
    const pid = Number(owner.split('\n')[0]) || 0;
    if (pid && !alive(pid)) {
      await rm(dir, { recursive: true, force: true });
      return tryAcquire(dir);
    }
    if (!pid) {
      await sleep(50);
      const again = await readFile(path.join(dir, 'owner'), 'utf8').catch(() => '');
      if (!again) await rm(dir, { recursive: true, force: true });
      return false;
    }
    return false;
  }
  await writeFile(path.join(dir, 'owner'), `${process.pid}\n${new Date().toISOString()}\n`);
  return true;
}

export async function withLineLock<T>(repo: string, line: string, fn: () => Promise<T>, timeoutMs = 600_000): Promise<T> {
  const dir = lockDir(repo, line);
  const start = Date.now();
  let delay = 25;
  while (!(await tryAcquire(dir))) {
    if (Date.now() - start > timeoutMs) throw new Error(`queue for ${repo}:${line} is held and did not clear in ${Math.round(timeoutMs / 1000)}s`);
    await sleep(delay);
    delay = Math.min(delay * 2, 500);
  }
  try {
    return await fn();
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function queueHolder(repo: string, line: string): Promise<{ pid: number; at: string; alive: boolean } | null> {
  const owner = await readFile(path.join(lockDir(repo, line), 'owner'), 'utf8').catch(() => '');
  if (!owner) return null;
  const [p, at] = owner.split('\n');
  const pid = Number(p) || 0;
  return { pid, at: at ?? '', alive: pid ? alive(pid) : false };
}
