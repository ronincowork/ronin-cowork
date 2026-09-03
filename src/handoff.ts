import { readdir, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const handoffDir = resolve(HERE, '..', 'co-working', 'user_repo', 'wip', 'handoffs');

function matches(fileBase: string, session: string): boolean {
  return fileBase.toLowerCase() === session.toLowerCase();
}

export async function removeHandoff(session: string): Promise<string | null> {
  if (!session) return null;
  try {
    const entries = await readdir(handoffDir);
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.md')) continue;
      if (!matches(entry.slice(0, -3), session)) continue;
      const path = join(handoffDir, entry);
      await unlink(path);
      console.log(`[ronin] handoff removed with session ${session}: ${entry}`);
      return path;
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      console.error(`[ronin] handoff cleanup for ${session}:`, (e as Error)?.message ?? e);
    }
  }
  return null;
}
