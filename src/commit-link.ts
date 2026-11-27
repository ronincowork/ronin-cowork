import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { discoverExecutable } from './agents.js';
import { execFile } from './spawn-broker.js';

/**
 * A COMMIT AN AGENT NAMES IN CHAT (KAN-701): a short or full hash is a link only when it is a
 * commit in one of the Agent's repos (`bases`: its desks, its working folder, the Workspace
 * folders). Its `git show --stat -p` is a page in the Agent's session folder, written once; pressed
 * or dropped on a workspace it opens in Docs as a page: read-only.
 */
const HASH = /^[0-9a-f]{7,40}$/;

export async function resolveCommit(ref: string, bases: string[]): Promise<{ sha: string; repo: string } | null> {
  const hash = String(ref ?? '').trim().toLowerCase();
  if (!HASH.test(hash)) return null;
  const git = await discoverExecutable('git').catch(() => '');
  if (!git) return null;
  for (const repo of [...new Set(bases.filter(Boolean))]) {
    try {
      const { stdout } = await execFile(git, ['-C', repo, 'rev-parse', '--verify', '--quiet', `${hash}^{commit}`], { timeout: 4000 });
      const sha = stdout.trim();
      if (sha) return { sha, repo };
    } catch { /* not a repo, or not here */ }
  }
  return null;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The commit as a page in `dir` (written once per commit), or null when it does not resolve. */
export async function commitPage(ref: string, bases: string[], dir: string): Promise<string | null> {
  const found = await resolveCommit(ref, bases);
  if (!found) return null;
  const file = path.join(dir, `${found.sha}.html`);
  if (await stat(file).then(() => true, () => false)) return file; // a commit never changes
  const git = await discoverExecutable('git');
  const { stdout } = await execFile(git, ['-C', found.repo, 'show', '--stat', '-p', '--no-color', found.sha], { timeout: 10000, maxBuffer: 16 * 1024 * 1024 });
  await mkdir(dir, { recursive: true });
  await writeFile(file, `<!doctype html><meta charset="utf-8"><title>${found.sha.slice(0, 7)} · ${escape(path.basename(found.repo))}</title>`
    + `<link rel="stylesheet" href="/tokens.css">`
    + `<style>body{margin:0;padding:var(--space-inset);font:var(--term-size)/var(--leading-body) var(--font-mono);white-space:pre-wrap;word-break:break-word}</style>`
    + `<body>${escape(`${found.repo}\n\n${stdout}`)}</body>`, 'utf8');
  return file;
}
