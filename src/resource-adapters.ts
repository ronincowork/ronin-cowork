import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STOCK_DIR, entryValue, isKeyLine, resolveFiles, type Origin } from './resources.js';
import { storeDir } from './resources.js';

export type DefinitionKind =
  | 'role_families' | 'session_roles' | 'desk_profiles' | 'lexicons' | 'routines'
  | 'templates/agents' | 'templates/teams';

export interface Definition {
  name: string;
  origin: Origin;
  shadowed: boolean;
  file: string;
  get: (key: string) => string;
  has: (key: string) => boolean;
}

const isDefinitionFile = (n: string): boolean =>
  n.endsWith('.md') && !n.startsWith('.') && n !== 'README.md';

const isHidden = (d: Definition): boolean => /^yes$/i.test(d.get('hidden'));

export async function readDefinitions(kind: DefinitionKind): Promise<Definition[]> {
  const merged = new Map<string, Definition>();
  for (const file of await resolveFiles({
    stock: path.join(STOCK_DIR, kind),
    user: path.join(storeDir('catalogs'), kind),
    include: isDefinitionFile,
    symlinks: true,
  })) {
    const lines = file.text.split('\n');
    if (!lines.some(isKeyLine)) {
      console.error(`[ronin] ${file.path}: no \`- **key:** value\` lines — not a definition, skipped.`);
      continue;
    }
    merged.set(file.name, {
      name: file.name,
      origin: file.origin,
      shadowed: file.shadowed,
      file: file.path,
      get: (key: string) => entryValue(lines, key),
      has: (key: string) => entryValue(lines, key) !== '',
    });
  }
  const rank = (d: Definition): number => {
    const n = Number(d.get('order'));
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };
  const label = (d: Definition): string => (d.get('label') || d.name).toLowerCase();
  return [...merged.values()]
    .filter((d) => !isHidden(d))
    .sort((a, b) => rank(a) - rank(b) || label(a).localeCompare(label(b)));
}

export async function findDefinition(kind: DefinitionKind, token: string): Promise<Definition | undefined> {
  if (!token) return undefined;
  return (await readDefinitions(kind)).find((d) => d.name === token);
}

export const splitDefinitionList = (v: string): string[] =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== '—' && s !== '-');

interface Row {
  name: string;
  origin: Origin;
  shadowed: boolean;
  icon: string;
  label: string;
  blurb: string;
  ask: string;
  remit: string;
  credit?: { text: string; url: string };
}

export interface RoleFamilyRow extends Row {
  session_roles: string[];
  default_lead_role: string;
}

export interface SessionRoleRow extends Row {
  match: string[];
}

export const ROUTINE_BUNDLES = ['nothing', 'floor', 'base', 'worktrees', 'services'] as const;
export type RoutineBundle = (typeof ROUTINE_BUNDLES)[number];

export interface RoutineRow extends Pick<Row, 'name' | 'origin' | 'shadowed' | 'label' | 'blurb'> {
  reading: string[];
  reading_off: string[];
  sops: string[];
  macros: string[];
  actions: string[];
  tools: string[];
  mcp: string[];
  /** Services parts this Routine runs inside the server; loaded only while its switch is on. */
  parts: string[];
  requires: string[];
  bundles: string[];
}

function credit(v: string): { text: string; url: string } | undefined {
  const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(v.trim());
  return m ? { text: m[1], url: m[2] } : undefined;
}

const row = (d: Definition): Row => ({
  name: d.name,
  origin: d.origin,
  shadowed: d.shadowed,
  icon: d.get('icon'),
  label: d.get('label') || d.name,
  blurb: d.get('blurb'),
  ask: d.get('ask'),
  remit: d.get('remit'),
  credit: credit(d.get('credit')),
});

export async function listRoleFamilies(): Promise<RoleFamilyRow[]> {
  return (await readDefinitions('role_families')).map((d) => {
    const roles = splitDefinitionList(d.get('session_roles'));
    const lead = d.get('default_lead_role').trim();
    const pinned = lead && roles.includes(lead) ? [lead, ...roles.filter((r) => r !== lead)] : roles;
    return { ...row(d), session_roles: pinned, default_lead_role: lead };
  });
}

export async function listSessionRoles(): Promise<SessionRoleRow[]> {
  return (await readDefinitions('session_roles')).map((d) => ({
    ...row(d),
    match: splitDefinitionList(d.get('match')),
  }));
}

export async function listRoutines(): Promise<RoutineRow[]> {
  return (await readDefinitions('routines')).map((d) => ({
    name: d.name,
    origin: d.origin,
    shadowed: d.shadowed,
    label: d.get('label') || d.name,
    blurb: d.get('blurb'),
    reading: splitDefinitionList(d.get('reading')),
    reading_off: splitDefinitionList(d.get('reading_off')),
    sops: splitDefinitionList(d.get('sops')),
    macros: splitDefinitionList(d.get('macros')),
    actions: splitDefinitionList(d.get('actions')),
    tools: splitDefinitionList(d.get('tools')),
    mcp: splitDefinitionList(d.get('mcp')),
    parts: splitDefinitionList(d.get('parts')),
    requires: splitDefinitionList(d.get('requires')),
    bundles: splitDefinitionList(d.get('bundles')).filter((bundle) =>
      (ROUTINE_BUNDLES as readonly string[]).includes(bundle)),
  }));
}

const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
const OUTPUT = ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team', 'no code'];
const TEMPLATE_KINDS = ['coding', 'work', 'personal', 'household', 'social', 'school'];

export interface TemplateMandate { reach: string; recruit: string; output: string[] }

export interface TemplateBox extends Pick<Row, 'name' | 'origin' | 'shadowed' | 'label' | 'blurb'> {
  art: string;
  kinds: string[];
  behaviours: string[];
  routines_on: string[];
  routines_off: string[];
}

export interface AgentTemplateRow extends TemplateBox {
  brief: string;
  mandate: TemplateMandate | null;
  team_mode: string;
}

export interface TemplateAgentRow {
  name: string;
  instructions: string;
  mandate: TemplateMandate | null;
  team_lead: boolean;
  routines_on: string[];
  routines_off: string[];
}

export interface TeamTemplateRow extends TemplateBox {
  objective: string;
  agents: TemplateAgentRow[];
}

export function templateMandate(value: string): TemplateMandate | null {
  const [reach, recruit, outputText] = value.split('·').map((part) => part.trim());
  const output = outputText?.split(',').map((part) => part.trim()).filter(Boolean) ?? [];
  if (!REACH.includes(reach) || !RECRUIT.includes(recruit) || !output.length || output.some((part) => !OUTPUT.includes(part))) return null;
  return { reach, recruit, output };
}

const templateBox = (d: Definition): TemplateBox => ({
  name: d.name,
  origin: d.origin,
  shadowed: d.shadowed,
  label: d.get('label') || d.name,
  blurb: d.get('blurb'),
  art: d.get('art'),
  kinds: splitDefinitionList(d.get('kinds')).filter((kind) => TEMPLATE_KINDS.includes(kind)),
  behaviours: splitDefinitionList(d.get('behaviours')),
  routines_on: splitDefinitionList(d.get('routines_on')),
  routines_off: splitDefinitionList(d.get('routines_off')),
});

export async function listAgentTemplates(): Promise<AgentTemplateRow[]> {
  return (await readDefinitions('templates/agents')).map((d) => ({
    ...templateBox(d),
    brief: d.get('brief'),
    mandate: d.has('mandate') ? templateMandate(d.get('mandate')) : null,
    team_mode: d.get('team_mode') === 'new' ? 'new' : '',
  }));
}

export function parseTemplateAgents(raw: string): TemplateAgentRow[] {
  const at = raw.search(/^## agents\s*$/m);
  if (at === -1) return [];
  return raw
    .slice(at)
    .split(/^###\s+/m)
    .slice(1)
    .map((section) => {
      const lines = section.split('\n');
      const mandate = entryValue(lines, 'mandate');
      return {
        name: lines[0].trim(),
        instructions: entryValue(lines, 'instructions'),
        mandate: mandate ? templateMandate(mandate) : null,
        team_lead: /^yes$/i.test(entryValue(lines, 'team_lead')),
        routines_on: splitDefinitionList(entryValue(lines, 'routines_on')),
        routines_off: splitDefinitionList(entryValue(lines, 'routines_off')),
      };
    })
    .filter((row) => row.name);
}

export async function listTeamTemplates(): Promise<TeamTemplateRow[]> {
  const rows: TeamTemplateRow[] = [];
  for (const d of await readDefinitions('templates/teams')) {
    let raw = '';
    try {
      raw = await readFile(d.file, 'utf8');
    } catch {
      continue; // vanished mid-read, exactly as readDir treats it
    }
    rows.push({
      ...templateBox(d),
      objective: d.get('objective'),
      agents: parseTemplateAgents(raw),
    });
  }
  return rows;
}

const isValidToken = (s: string): boolean => /^[\w-]{1,64}$/.test(s);

export async function writeRoleTasks(role: string, tasks: string[]): Promise<string[]> {
  const def = await findDefinition('role_families', role);
  if (!def) throw new Error(`"${role}" is not a role_family on this box.`);
  const clean = [...new Set(tasks.map((t) => String(t).trim()).filter(Boolean))];
  for (const t of clean) if (!isValidToken(t)) throw new Error(`"${t}" is not a session_role name.`);
  const lead = def.get('default_lead_role').trim();
  if (lead && !clean.includes(lead)) {
    throw new Error(
      `"${lead}" is ${role}'s default_lead_role — it stays pinned on this shelf. ` +
        `Clear the \`default_lead_role:\` line in ${def.file} first if you mean to remove it.`,
    );
  }
  if (clean.length > 64) throw new Error(`A role may shelve at most 64 tasks; "${role}" was given ${clean.length}.`);
  const known = new Set((await readDefinitions('session_roles')).map((d) => d.name));
  for (const t of clean) if (!known.has(t)) throw new Error(`"${t}" is not a session_role on this box.`);

  const raw = await readFile(def.file, 'utf8');
  const line = `- **session_roles:** ${clean.length ? clean.join(', ') : '—'}`;
  const lines = raw.split('\n');
  const at = lines.findIndex((l) => /^-\s*\*\*session_roles:\*\*/i.test(l.trim()));
  if (at === -1) {
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (isKeyLine(lines[i])) last = i;
    lines.splice(last + 1, 0, line);
  } else lines[at] = line;

  const dir = path.join(storeDir('catalogs'), 'role_families');
  const target = path.join(dir, `${role}.md`);
  await mkdir(dir, { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, lines.join('\n'), 'utf8');
  await rename(tmp, target);

  const back = await findDefinition('role_families', role);
  if (!back) throw new Error(`Refused: "${role}" does not read back after the edit.`);
  return splitDefinitionList(back.get('session_roles'));
}

export const routineReading = (
  routines: readonly { enabled: boolean; reading: string[]; reading_off: string[] }[],
): string[] => routines.flatMap((routine) => routine.enabled ? routine.reading : routine.reading_off);
