/**
 * ONE QUEUE PER TARGET LINE — hand-ins to `team/comp/dev` run one at a time.
 *
 * The lock is a directory made with `mkdir` (atomic on every filesystem that matters)
 * under the `desks` store, one per repo + line, holding an `owner` file with the pid and
 * time. Cross-process by construction: the hand-in tool is run from any session's shell
 * and Ronin may not be up. A lock whose pid is dead is STALE — the process crashed
 * mid-hand-in — and is reclaimed; that is safe because the executor never leaves a
 * line half-moved (the candidate is built beside the line and the ref advances by a
 * single compare-and-swap), so a crashed holder has nothing to roll back.
 */
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

/** Try once. Returns true when this process now holds the line. */
async function tryAcquire(dir: string): Promise<boolean> {
  try {
    await mkdir(dir, { recursive: false });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') {
      await mkdir(path.dirname(dir), { recursive: true });
      return tryAcquire(dir);
    }
    // Held. Stale?
    const owner = await readFile(path.join(dir, 'owner'), 'utf8').catch(() => '');
    const pid = Number(owner.split('\n')[0]) || 0;
    if (pid && !alive(pid)) {
      await rm(dir, { recursive: true, force: true });
      return tryAcquire(dir);
    }
    if (!pid) {
      // A directory with no owner yet: the other side is between mkdir and its write. Give it a beat.
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

/**
 * Run `fn` holding the line's lock. Waits up to `timeoutMs` (default 10 minutes — a
 * hand-in is near-instant, but a queue of six is still a queue). Throws when it cannot.
 */
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

/** Who holds a line's queue right now, or null. */
export async function queueHolder(repo: string, line: string): Promise<{ pid: number; at: string; alive: boolean } | null> {
  const owner = await readFile(path.join(lockDir(repo, line), 'owner'), 'utf8').catch(() => '');
  if (!owner) return null;
  const [p, at] = owner.split('\n');
  const pid = Number(p) || 0;
  return { pid, at: at ?? '', alive: pid ? alive(pid) : false };
}
