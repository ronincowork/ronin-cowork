import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOCK_DIR, splitSections, readEntries } from '../src/catalog.js';
import {
  listAgentTemplates,
  listRoleFamilies,
  listRoutines,
  listSessionRoles,
  listTeamTemplates,
  type DefinitionKind,
  type TemplateBox,
} from '../src/resource-adapters.js';
import { listDeskProfiles } from '../src/desk-profiles.js';
import { listLexicons } from '../src/lexicon-catalog.js';
import { resolveLaunchProfile, type LaunchProfile } from '../src/launch-profile.js';
import { findDefinition } from '../src/resource-adapters.js';
import { listMacros } from '../src/macros.js';
import { listSessionLaunchSpecs } from '../src/project-roots.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
let warns = 0;
const fail = (msg: string) => {
  console.error(`  FAIL  ${msg}`);
  fails++;
};
const warn = (msg: string) => {
  console.warn(`  warn  ${msg}`);
  warns++;
};

const stockNames = async (file: string): Promise<string[]> => {
  const raw = await readFile(path.join(STOCK_DIR, file), 'utf8');
  return splitSections(raw, 'stock')
    .filter((s) => s.head === s.name) // a heading with a space is prose, never an entry
    .map((s) => s.name);
};

async function surfacing(file: string, served: () => Promise<{ name: string }[]>): Promise<void> {
  const want = await stockNames(file);
  const got = new Set((await served()).map((e) => e.name));
  for (const name of want) {
    if (!got.has(name)) {
      fail(
        `${file}: stock entry "${name}" does not surface from its reader — ` +
          `half-written (dropped by a filter), or hidden by a user file on this box`,
      );
    }
  }
}

async function macroCopy(): Promise<void> {
  for (const m of await listMacros()) {
    if (m.origin !== 'stock') continue; // a user's own file is theirs; the client handles a blank
    for (const field of ['label', 'blurb'] as const) {
      if (!m[field].trim()) {
        fail(
          `MACROS.md: macro "${m.name}" has no \`- **${field}:**\` — every entry carries the ` +
            `human copy as well as the agent's instruction, and no surface may show the ` +
            `instruction to a person in its place`,
        );
      }
    }
  }
}

async function deadLinks(file: string): Promise<void> {
  const raw = await readFile(path.join(STOCK_DIR, file), 'utf8');
  const re = /(?:^|[\s(`])((?:docs|reading-list|co-working|ronin_catalogs|ronin_library|hostside|scripts|bin)\/[A-Za-z0-9_./-]*[A-Za-z0-9_-])/gm;
  const seen = new Set<string>();
  for (const m of raw.matchAll(re)) {
    const p = m[1];
    if (seen.has(p)) continue;
    seen.add(p);
    try {
      await stat(path.join(REPO, p));
    } catch {
      warn(`${file}: names ${p} — not in this install`);
    }
  }
}

async function surfacingDefinitions(
  kind: DefinitionKind,
  served: () => Promise<{ name: string }[]>,
): Promise<void> {
  const want = (await readdir(path.join(STOCK_DIR, kind)))
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => f.replace(/\.md$/, ''));
  const got = new Set((await served()).map((e) => e.name));
  for (const name of want) {
    if (!got.has(name)) {
      fail(
        `${kind}/${name}.md: does not surface from its reader — ` +
          `malformed (no \`- **key:** value\` lines), or hidden by a user file on this box`,
      );
    }
  }
}

async function definitionsResolve(): Promise<void> {
  const families = await listRoleFamilies();
  const tasks = await listSessionRoles();
  for (const f of families) {
    for (const tk of f.session_roles) {
      if (!(await findDefinition('session_roles', tk))) {
        fail(`role_families/${f.name}.md: its session_roles names "${tk}", which is not a session_role on this box`);
      }
    }
    if (f.default_lead_role && !f.session_roles.includes(f.default_lead_role)) {
      fail(
        `role_families/${f.name}.md: its default_lead_role "${f.default_lead_role}" is not in its own family — the pin has nothing to pin to`,
      );
    }
  }
  for (const tk of tasks) {
    const taskDef = await findDefinition('session_roles', tk.name);
    let profile: LaunchProfile;
    try {
      profile = resolveLaunchProfile(taskDef);
    } catch (e) {
      fail(`launch profile ${tk.name}: ${String((e as Error).message)}`);
      continue;
    }
    if (profile.agent && !profile.opening) {
      fail(`launch profile ${tk.name}: launches an agent with no \`opening:\``);
    }
  }
  try {
    resolveLaunchProfile(undefined);
  } catch (e) {
    fail(`launch profile (blank): ${String((e as Error).message)}`);
  }
}

async function routinesResolve(): Promise<void> {
  const routines = await listRoutines();
  const routineNames = new Set(routines.map((routine) => routine.name));
  const [macros, actionsRaw, toolsRaw] = await Promise.all([
    listMacros(),
    readFile(path.join(STOCK_DIR, 'ACTIONS.md'), 'utf8'),
    readFile(path.join(STOCK_DIR, 'TOOLS.md'), 'utf8'),
  ]);
  const known = {
    macros: new Set(macros.map((x) => x.name)),
    actions: new Set(splitSections(actionsRaw, 'stock').map((x) => x.name)),
    tools: new Set([...toolsRaw.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1])),
  };
  const owners = new Map<string, string>();
  for (const routine of routines.filter((x) => x.origin === 'stock')) {
    if (!routine.blurb.trim()) fail(`routines/${routine.name}.md: missing blurb`);
    const def = await findDefinition('routines', routine.name);
    const rawBundles = (def?.get('bundles') ?? '').split(',').map((s) => s.trim()).filter((s) => s && s !== '—');
    for (const rung of rawBundles) {
      if (!routine.bundles.includes(rung)) fail(`routines/${routine.name}.md: bundles names unknown rung "${rung}"`);
    }
    for (const dependency of routine.requires) {
      if (!routineNames.has(dependency)) fail(`routines/${routine.name}.md: requires missing "${dependency}"`);
      if (dependency === routine.name) fail(`routines/${routine.name}.md: requires itself`);
    }
    for (const reading of [...routine.reading, ...routine.reading_off].filter((name) => name.startsWith('routine/'))) {
      try { await stat(path.join(REPO, 'ronin_session_boot', reading)); }
      catch { fail(`routines/${routine.name}.md: reading names missing "${reading}"`); }
    }
    for (const field of ['macros', 'actions', 'tools'] as const) {
      for (const name of routine[field]) {
        if (!known[field].has(name)) fail(`routines/${routine.name}.md: ${field} names missing "${name}"`);
        const key = `${field}:${name}`;
        const prior = owners.get(key);
        if (prior) fail(`routines/${routine.name}.md: ${key} already belongs to ${prior}`);
        else owners.set(key, routine.name);
      }
    }
    for (const sop of routine.sops) {
      try { await stat(path.join(REPO, 'ronin_sops', `${sop}.md`)); }
      catch { fail(`routines/${routine.name}.md: sops names missing "${sop}"`); }
      const key = `sops:${sop}`;
      const prior = owners.get(key);
      if (prior) fail(`routines/${routine.name}.md: ${key} already belongs to ${prior}`);
      else owners.set(key, routine.name);
    }
  }
  const visit = (name: string, path: string[]) => {
    const at = path.indexOf(name);
    if (at !== -1) {
      fail(`routines: requires cycle ${[...path.slice(at), name].join(' -> ')}`);
      return;
    }
    const routine = routines.find((item) => item.name === name);
    if (!routine) return;
    for (const dependency of routine.requires) visit(dependency, [...path, name]);
  };
  for (const routine of routines) visit(routine.name, []);
}

async function templateBoxResolves(
  at: string,
  box: TemplateBox,
  routineNames: Set<string>,
): Promise<void> {
  const shelfDirs: Record<string, string> = { sops: 'ronin_sops', ways: 'ways' };
  if (!box.blurb.trim()) fail(`${at}: missing blurb`);
  if (!box.art.trim()) fail(`${at}: missing art`);
  if (!box.kinds.length) fail(`${at}: names no valid kinds — nothing brings it forward`);
  for (const book of box.behaviours) {
    const [shelf, name] = book.split(':');
    const dir = shelfDirs[shelf];
    if (!dir || !name) { fail(`${at}: behaviour "${book}" is not <shelf>:<name> on a known shelf`); continue; }
    try { await stat(path.join(REPO, dir, `${name}.md`)); }
    catch { fail(`${at}: behaviour names missing ${dir}/${name}.md`); }
  }
  for (const name of [...box.routines_on, ...box.routines_off]) {
    if (!routineNames.has(name)) fail(`${at}: routines switch names missing routine "${name}"`);
  }
}

async function templatesResolve(): Promise<void> {
  const routineNames = new Set((await listRoutines()).map((routine) => routine.name));
  const DEAD = ['lead_brief', 'lead_mandate'];
  for (const template of (await listAgentTemplates()).filter((x) => x.origin === 'stock')) {
    const at = `templates/agents/${template.name}.md`;
    await templateBoxResolves(at, template, routineNames);
    const def = await findDefinition('templates/agents', template.name);
    if (def?.has('mandate') && !template.mandate) fail(`${at}: mandate is not \`reach · recruit · output\` in ruled values`);
    if (!template.brief.trim()) fail(`${at}: an agent template seeds a brief`);
    for (const key of ['objective', ...DEAD]) {
      if (def?.has(key)) fail(`${at}: \`${key}:\` is a team answer — it does not belong on the agent shelf`);
    }
  }
  for (const template of (await listTeamTemplates()).filter((x) => x.origin === 'stock')) {
    const at = `templates/teams/${template.name}.md`;
    await templateBoxResolves(at, template, routineNames);
    const def = await findDefinition('templates/teams', template.name);
    if (!template.objective.trim()) fail(`${at}: a team template states its objective`);
    for (const key of ['brief', 'team_mode', ...DEAD]) {
      if (def?.has(key)) fail(`${at}: \`${key}:\` does not belong on the team shelf`);
    }
    if (template.agents.length < 2) fail(`${at}: a cast is several agents — ${template.agents.length} row(s) found`);
    if (template.agents.filter((row) => row.team_lead).length !== 1) {
      fail(`${at}: exactly one cast row is marked \`team_lead: yes\``);
    }
    const seen = new Set<string>();
    for (const row of template.agents) {
      if (seen.has(row.name)) fail(`${at}: two cast rows are both called "${row.name}"`);
      seen.add(row.name);
      if (!row.instructions.trim()) fail(`${at}: cast row "${row.name}" has no instructions`);
    }
  }
}

const FILES = ['MACROS.md', 'ACTIONS.md', 'TOOLS.md', 'PROJECT_ROOTS.md'];

await surfacingDefinitions('role_families', listRoleFamilies);
await surfacingDefinitions('session_roles', listSessionRoles);
await surfacingDefinitions('desk_profiles', listDeskProfiles);
await surfacingDefinitions('lexicons', listLexicons);
await surfacingDefinitions('routines', listRoutines);
await surfacingDefinitions('templates/agents', listAgentTemplates);
await surfacingDefinitions('templates/teams', listTeamTemplates);
await definitionsResolve();
await routinesResolve();
await templatesResolve();
await surfacing('MACROS.md', listMacros);
await surfacing('ACTIONS.md', () => readEntries('ACTIONS.md'));
await surfacing('TOOLS.md', () => readEntries('TOOLS.md'));
await macroCopy();

const launchSpecs = await listSessionLaunchSpecs();
if (launchSpecs.length === 0) fail('PROJECT_ROOTS.md: the launch table yields no session_launch_specs');
const openaiSpecs = launchSpecs.filter((s) => s.provider === 'openai');
if (openaiSpecs.length < 2) fail('PROJECT_ROOTS.md: OpenAI must offer more than one real model choice');
for (const spec of openaiSpecs) {
  if (spec.model === 'default') fail('PROJECT_ROOTS.md: OpenAI model heading "default" hides the model being launched');
  const expected = `codex --model ${spec.model}`;
  if (spec.cmd !== expected) {
    fail(`PROJECT_ROOTS.md: openai · ${spec.model} must launch "${expected}", got "${spec.cmd}"`);
  }
}

for (const f of FILES) await deadLinks(f);

if (fails) {
  console.error(`check-catalogs: ${fails} failure(s), ${warns} dead link(s)`);
  process.exit(1);
}
console.log(`check-catalogs: ok — every stock entry surfaces${warns ? `; ${warns} dead link(s) awaiting ronin_library material` : ''}`);
