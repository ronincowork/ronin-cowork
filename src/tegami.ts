import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from './spawn-broker.js';
import { RIREKI_DIR, sessionKey } from './session-dir.js';
import { readTeamRoster } from './team-rosters.js';
import type { SessionInfo } from './tmux.js';
import { mandate, type Mandate } from './agent-defaults.js';

export interface TegamiCheckout {
  repo: string;
  branch: string;
  worktree?: string;
  line?: string;
}

const GIT_LOCATION_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR',
  'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
] as const;

export function envWithoutGitLocation(from: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...from };
  for (const k of GIT_LOCATION_VARS) delete env[k];
  return env;
}

export async function checkoutAt(dir: string): Promise<TegamiCheckout> {
  const git = async (...args: string[]) =>
    (await execFile('git', ['-C', dir, ...args], {
      timeout: 2_000, env: envWithoutGitLocation(),
    })).stdout.trim();
  try {
    const top = await git('rev-parse', '--show-toplevel');
    const remote = await git('config', '--get', 'remote.origin.url').catch(() => '');
    const branch = await git('branch', '--show-current').catch(() => '') ||
      await git('rev-parse', '--short', 'HEAD').catch(() => '');
    return { repo: remote || top, branch, worktree: top };
  } catch {
    return { repo: '', branch: '' };
  }
}

export function tegamiPath(key: string): string {
  return path.join(RIREKI_DIR, key, 'tegami.md');
}

export interface TeamEntry {
  team: string;
  objective: string;
}

export async function deriveTeams(tags: string[]): Promise<TeamEntry[]> {
  return Promise.all(
    tags.map(async (team) => {
      const r = await readTeamRoster(team).catch(() => null);
      return { team, objective: r?.objective ?? '' };
    }),
  );
}

function seedShell(
  name: string,
  repos: TegamiCheckout[],
  teams: TeamEntry[],
  sessionMandate: Mandate,
): string {
  return `# TEGAMI — ${name}
> **This file is your ladder, and it is a good way to communicate that you understand your
> role, the input you need from the user, and your planned phases and legs.** What you keep
> here is shown on the user's tile and on their session_roster for quick reference. Keep it true
> and save it when it changes — a stale ladder is worse than none.
>
> At the end of a turn, consider updating it with \`write_tegami\`. Not keeping it current is
> poor quality.
>
> YOUR **teams** block is DERIVED and not yours to write: one entry per team you are on —
> the team's name and its objective, read live from the team rosters.
> \`write_tegami\` regenerates it on every save and a tag change refreshes it, so reread
> your letter to see a team objective that moved. A session on no team is a rōnin, which
> is an ordinary state and not a gap.
>
> YOUR **repos** list is started from the checkout the new-session box put you in. It is
> not limited to that project_root: add, remove, or change entries as you work across other
> repositories. Keep every worktree and branch current. The worktree is the important
> live coordinate: it tells the owner which private desk this session is actually using;
> the branch remains supporting Git detail.
>
> YOUR **ladder** — the rungs, and which one you are on. Phases hold legs. Name a phase
> before you know its legs; a phase with nothing under it yet is normal. Leave out what you
> cannot see: a short ladder is a true ladder, and a guessed one is a lie. Statuses are
> \`PLANNED\` · \`ACTIVE\` · \`DONE\`, **one ACTIVE at a time**. Add a gate wherever the work
> genuinely stops and needs someone — that is how the owner knows you want them.
>
> YOUR **ladder_state** — \`write_tegami --on_tangent\` when you step off the ladder,
> \`--on_track\` when you are back. Riffing, a side job, ten minutes in nobody's plan — all
> normal, and your plan is not dead while you are away from it.
>
> YOUR DOCS — the buildouts, handoffs and plans this session is working on.
> \`write_tegami --doc <path>\` puts one on your list, \`--undoc <path>\` takes it off.
> The owner opens them from the ▧ Docs tab in commons, so **a doc you did not list is a
> doc they cannot reach without asking you for the path.**
>
> Your own words go in "objective" and "title". Read it with \`read_tegami\`; where the file
> lives is Ronin's business. The words: reading-list/TEGAMI.md in the Ronin repo.

\`\`\`json
{ "objective": "",
  "mandate": ${JSON.stringify(sessionMandate)},
  "teams": ${JSON.stringify(teams)},
  "repos": ${JSON.stringify(repos.filter((checkout) => checkout.repo || checkout.branch))},
  "ladder": [] }
\`\`\`
`;
}

export async function seedTegami(
  name: string,
  checkout: TegamiCheckout | TegamiCheckout[] = { repo: '', branch: '' },
  teams: TeamEntry[] = [],
  sessionMandate: Mandate = mandate(undefined),
): Promise<string | null> {
  try {
    const file = tegamiPath(await sessionKey(name));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, seedShell(name, Array.isArray(checkout) ? checkout : [checkout], teams, mandate(sessionMandate)), { flag: 'wx' });
    return file;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'EEXIST') return tegamiPath(await sessionKey(name));
    console.error(`[ronin] tegami seed ${name}:`, e);
    return null;
  }
}

export async function readRepos(name: string): Promise<TegamiCheckout[]> {
  try {
    const text = await fs.readFile(tegamiPath(await sessionKey(name)), 'utf8');
    const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const v = (JSON.parse(raw) as Record<string, unknown>)['repos'];
    if (!Array.isArray(v)) return [];
    return v
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => {
        const out: TegamiCheckout = { repo: String(e.repo ?? '').trim(), branch: String(e.branch ?? '').trim() };
        if (typeof e.worktree === 'string' && e.worktree.trim()) out.worktree = e.worktree.trim();
        if (typeof e.line === 'string' && e.line.trim()) out.line = e.line.trim();
        return out;
      })
      .filter((e) => e.repo || e.branch);
  } catch {
    return [];
  }
}

export async function parkBrief(name: string, text: string): Promise<string | null> {
  try {
    const file = path.join(RIREKI_DIR, await sessionKey(name), 'brief.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
    return file;
  } catch (e) {
    console.error(`[ronin] parking the brief for ${name}:`, e);
    return null;
  }
}

export async function writeGate(name: string, gate: string): Promise<boolean> {
  const file = tegamiPath(await sessionKey(name));
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return false; // no letter — every launch seeds one, so this is a box in a bad way
  }
  const block = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!block) return false;
  const body = block[1];
  const ladder = body.match(/"ladder"\s*:\s*\[[^[\]]*\]/);
  if (!ladder) return false;
  let rungs: unknown;
  try {
    rungs = (JSON.parse(`{${ladder[0]}}`) as { ladder: unknown }).ladder;
  } catch {
    return false;
  }
  if (!Array.isArray(rungs)) return false;
  const ours = rungs.length === 0 || (rungs.length === 1 && !!(rungs[0] as { gate?: unknown })?.gate);
  if (!ours) return false;

  const value = gate ? JSON.stringify([{ gate, status: 'ACTIVE' }]) : '[]';
  const next = body.replace(ladder[0], `"ladder": ${value}`);
  try {
    JSON.parse(next); // the guard: never leave a letter the tile cannot read
  } catch {
    return false;
  }
  const out =
    text.slice(0, block.index!) + block[0].replace(body, next) + text.slice(block.index! + block[0].length);
  const tmp = `${file}.gate`;
  await fs.writeFile(tmp, out, 'utf8');
  await fs.rename(tmp, file);
  return true;
}

export type SessionWithAxes = SessionInfo;

export async function withAxes(list: SessionInfo[]): Promise<SessionWithAxes[]> {
  const { campaignResolver, machineCampaignId } = await import('./campaign-scope.js');
  const resolve = await campaignResolver();
  const machine = await machineCampaignId();
  return Promise.all(
    list.filter((s) => !machine || resolve(s.campaign_id) === machine).map(async (s) => ({
      ...s,
      campaign_id: resolve(s.campaign_id),
    })),
  );
}

export async function writeTeams(name: string, tags: string[]): Promise<boolean> {
  const file = tegamiPath(await sessionKey(name));
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return false;
  }
  const block = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!block) return false;
  const body = block[1];
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return false;
  }
  const teams = await deriveTeams(tags);
  parsed['teams'] = teams;
  const key = /"teams"\s*:\s*(\[[^\]]*(?:\{[^}]*\}[^\]]*)*\])/;
  const value = JSON.stringify(teams);
  const next = key.test(body)
    ? body.replace(key, `"teams": ${value}`)
    : body.replace(/\{/, `{ "teams": ${value},`);
  try {
    JSON.parse(next);
  } catch {
    return false;
  }
  const out = text.slice(0, block.index!) + block[0].replace(body, next) + text.slice(block.index! + block[0].length);
  const tmp = `${file}.teams`;
  await fs.writeFile(tmp, out, 'utf8');
  await fs.rename(tmp, file);
  return true;
}
