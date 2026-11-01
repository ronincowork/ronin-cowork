#!/usr/bin/env -S npx tsx
/**
 * ONE-TIME MIGRATION (KAN-153, owner 2026-11-01): Teams were born in a Workspace Folder with a
 * list of repositories and a Mode in their agent defaults; now every Team is launched in a
 * Workspace that holds those. For each Team roster this makes (or reuses) a Workspace named
 * after its old Born in folder, with its repositories and Mode, and points the Team at it.
 * Teams with the same Born in, repositories and Mode share one Workspace. A Team with no Born
 * in gets no Workspace: its Agents start in Ronin house.
 *
 *   npx tsx scripts/migrate-workspaces.ts          print what would move; nothing is written
 *   npx tsx scripts/migrate-workspaces.ts --apply  write it
 *
 * Run once per machine; delete this script when every machine has run it.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../src/resources.js';
import { listProjectRoots } from '../src/project-roots.js';
import { listWorkspaces, saveWorkspace, type Workspace } from '../src/workspaces.js';

const apply = process.argv.includes('--apply');
const field = (text: string, key: string): string => text.match(new RegExp(`^- \\*\\*${key}:\\*\\* ?(.*)$`, 'm'))?.[1]?.trim() ?? '';
const blank = (v: string): string => (v === '—' || v === '-' ? '' : v);

const roots = await listProjectRoots();
const rosterDir = storeDir('team_rosters');
const campaigns = (await readdir(rosterDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
const planned = new Map<string, Workspace>(); // campaign/name -> Workspace
const moves: { file: string; team: string; workspace: string; text: string }[] = [];

for (const campaign of campaigns) {
  const existing = new Map((await listWorkspaces(campaign)).map((w) => [w.name, w]));
  for (const file of (await readdir(path.join(rosterDir, campaign))).filter((f) => f.endsWith('.md'))) {
    const full = path.join(rosterDir, campaign, file);
    const text = await readFile(full, 'utf8');
    if (field(text, 'workspace')) continue; // already moved
    const team = file.slice(0, -3);
    const born = blank(field(text, 'project_root'));
    const repos = blank(field(text, 'repos')).split(',').map((r) => r.trim()).filter(Boolean);
    let defaults: Record<string, unknown> = {};
    try { defaults = JSON.parse(blank(field(text, 'agent_defaults')) || '{}'); } catch { /* unreadable defaults carry nothing */ }
    const mode = defaults.launch_mode === 'live_dangerously' ? 'live_dangerously' : 'configured';
    delete defaults.launch_mode;
    const rest = (workspace: string) => text
      .replace(/^- \*\*project_root:\*\*.*\n/m, `- **workspace:** ${workspace || '—'}\n`)
      .replace(/^- \*\*repos:\*\*.*\n/m, '')
      .replace(/^- \*\*agent_defaults:\*\*.*$/m, `- **agent_defaults:** ${JSON.stringify(defaults)}`);
    if (!born) { moves.push({ file: full, team: `${campaign}/${team}`, workspace: '', text: rest('') }); continue; }
    const repoNames = [...new Set([born, ...repos].filter((name) => name && roots.some((root) => root.name === name)))];
    const base = born;
    const same = (w: Workspace) => w.launch_mode === mode && JSON.stringify(w.repos.map((r) => r.name)) === JSON.stringify(repoNames);
    let name = base;
    for (let n = 2; ; n++) {
      const held = planned.get(`${campaign}/${name}`) ?? existing.get(name);
      if (!held || same(held)) break;
      name = `${base}-${n}`;
    }
    if (!planned.has(`${campaign}/${name}`) && !existing.has(name)) {
      const root = roots.find((r) => r.name === born);
      planned.set(`${campaign}/${name}`, {
        name, campaign_id: campaign, title: root?.title || name, objective: root?.remit || '', instructions: '',
        repos: repoNames.map((r) => ({ name: r, note: '' })), folders: [], launch_mode: mode,
      });
    }
    moves.push({ file: full, team: `${campaign}/${team}`, workspace: name, text: rest(name) });
  }
}

for (const w of planned.values()) {
  console.log(`Workspace ${w.campaign_id}/${w.name}: ${w.title} · repos ${w.repos.map((r) => r.name).join(', ') || '—'} · Mode ${w.launch_mode === 'live_dangerously' ? 'Dangerously' : 'Native'}`);
}
for (const m of moves) console.log(`Team ${m.team} → ${m.workspace ? `Workspace ${m.workspace}` : 'no Workspace (Ronin house)'}`);
if (!moves.length) console.log('Nothing to move.');
if (!apply) { console.log('\nDry run: nothing written. Run with --apply to write.'); process.exit(0); }
for (const w of planned.values()) await saveWorkspace(w);
for (const m of moves) await writeFile(m.file, m.text, 'utf8');
console.log(`\nWrote ${planned.size} Workspace(s) and ${moves.length} Team roster(s).`);
