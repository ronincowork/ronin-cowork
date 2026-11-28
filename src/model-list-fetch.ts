/**
 * FETCH A CLI'S MODEL LIST AFTER SIGN-IN (owner, 28 Nov 2026; KAN-995; docs/architecture/harness-catalog.md).
 * Claude Code and Codex write their list file only once they have run; a fresh sign-in has none. So after
 * Done, or a sign-in run that ends signed in, each one whose file is missing is started once, Native, with
 * no prompt, as a hidden child under a pseudo-terminal (`script`): never in tmux. Its own recorded pid (its
 * process group) is stopped when the file appears or at the time limit. One watch on the folder the file
 * lands in, no polling; then one push, so the harness panel and New Agent read the list again. Until then
 * the model entries say the models are on their way (KAN-993). Codex's own app-server helper, which it
 * starts and detaches, is its own and keeps running.
 * Measured on this box with a throwaway HOME: Claude 1.1 s (onboarding seeded), Codex 6.2 s.
 */
import { spawn } from 'node:child_process';
import { watch, type FSWatcher } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AGENTS } from './agents.js';
import { claudeAhead } from './launch-ahead.js';
import { readHarnessSummary, readModels } from './harness-summary.js';
import { rootDir } from './resources.js';
import { broadcastEvent } from './ws/events.js';

/** How long a hidden start may take to write its list before it is stopped. */
const FETCH_LIMIT_MS = 45_000;

/** Where each CLI writes its list, and how a file there is known as the list. */
const LANDS: Record<string, { dir: () => string; isList: (name: string) => boolean }> = {
  claude: { dir: () => path.join(os.homedir(), '.claude', 'cache', 'model-catalog'), isList: (name) => name.endsWith('-cc.json') },
  codex: { dir: () => path.join(os.homedir(), '.codex'), isList: (name) => name === 'models_cache.json' },
};

const fetching = new Set<string>();

/** Start each signed-in CLI that has no list file yet, once; nothing when it has one or is already running. */
export async function fetchMissingModelLists(): Promise<void> {
  const summary = await readHarnessSummary();
  if (!summary) return;
  await Promise.all(AGENTS.filter((agent) => LANDS[agent.id] && summary.operational.includes(agent.id)).map(async (agent) => {
    if (fetching.has(agent.id)) return;
    if ((await readModels(agent, { file: summary.paths[agent.id] ?? '' })).rows.length) return;
    await fetchOne(agent.id, summary.paths[agent.id] || agent.cmd).catch((error) => console.error(`[models] fetch ${agent.id}:`, error));
  }));
}

async function fetchOne(cli: string, file: string): Promise<void> {
  const lands = LANDS[cli]!;
  const cwd = rootDir('user');
  await mkdir(cwd, { recursive: true });
  await mkdir(lands.dir(), { recursive: true });
  if (cli === 'claude') await claudeAhead(cwd);
  fetching.add(cli);
  // A pseudo-terminal, since both CLIs draw a screen; its own process group, so one pid stops it whole.
  const env: NodeJS.ProcessEnv = { ...process.env, BROWSER: 'true' };
  delete env.TMUX; delete env.TMUX_PANE;
  const child = spawn('script', ['-qfec', file, '/dev/null'], { cwd, env, detached: true, stdio: 'ignore' });
  const pid = child.pid;
  let watcher: FSWatcher | null = null;
  let ended = false;
  const stop = () => {
    if (ended) return;
    ended = true;
    watcher?.close();
    clearTimeout(limit);
    if (pid) { try { process.kill(-pid, 'SIGTERM'); } catch { /* already gone */ } }
    fetching.delete(cli);
    // The list is read at every ask; this tells the panel and New Agent to ask.
    broadcastEvent({ t: 'model-services-changed' });
  };
  const limit = setTimeout(stop, FETCH_LIMIT_MS);
  watcher = watch(lands.dir(), (_event, name) => { if (name && lands.isList(String(name))) setTimeout(stop, 500); });
  child.on('error', stop);
  child.on('exit', stop);
}
