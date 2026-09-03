/**
 * SAVE AS TEMPLATE — the one write the template catalog offers, now per shelf.
 *
 * A save is always NEW: the forms offer "Save as template" over a fresh definition and
 * "Save as new template" over an edited one, and neither writes over the box the owner
 * started from — shipped templates are edited on the campaign page, not here. So a name
 * that already resolves ON ITS SHELF, stock or user's, is refused rather than shadowed:
 * a quiet shadow would be an upgrade-proof copy the owner never asked for. The two
 * shelves are separate namespaces — an agent box and a cast may share a name.
 *
 * The file lands in the OWNER'S catalogs store (`<catalogs store>/templates/<shelf>/`),
 * which is what makes it survive upgrade and uninstall like every catalog of theirs, and
 * it is read back through the ordinary reader before success is reported — a definition
 * that does not read back is a tray that would render without it.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  listAgentTemplates,
  listTeamTemplates,
  templateMandate,
  type AgentTemplateRow,
  type TeamTemplateRow,
} from './definitions.js';
import { storeDir } from './resources.js';

const isValidToken = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);
const KINDS = ['coding', 'work', 'personal', 'household', 'social', 'school'];
const text = (value: unknown, max = 2000): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const words = (value: unknown, max = 500): string => text(value, max).replace(/\n/g, ' ');
const list = (value: unknown): string[] => Array.isArray(value)
  ? value.map((entry) => words(entry, 160)).filter(Boolean)
  : [];
const line = (key: string, value: string): string[] => (value ? [`- **${key}:** ${value}`] : []);

/** A mandate arrives as the file's `reach · recruit · output` string OR as the wire
 *  object (`agentPicks()` output); either way the file stores the string form. */
const mandateText = (value: unknown): string => {
  if (typeof value === 'string') return words(value);
  if (value && typeof value === 'object') {
    const m = value as Record<string, unknown>;
    const output = Array.isArray(m.output) ? m.output.join(', ') : String(m.output ?? '');
    const parts = [m.reach, m.recruit, output].map((part) => words(part, 160));
    return parts.every(Boolean) ? parts.join(' · ') : '';
  }
  return '';
};

interface TemplateBoxSave {
  name: string;
  label?: unknown;
  art?: unknown;
  blurb?: unknown;
  kinds?: unknown;
  behaviours?: unknown;
  routines_on?: unknown;
  routines_off?: unknown;
}

export interface AgentTemplateSave extends TemplateBoxSave {
  brief?: unknown;
  mandate?: unknown;
  team_mode?: unknown;
}

export interface TeamTemplateSave extends TemplateBoxSave {
  objective?: unknown;
  /** The cast — the ruled wire rows, exactly as `agentPicks()` produces them. */
  agents?: unknown;
}

/** The shared half: token, collision refusal, and the box lines every shelf carries. */
async function openSave(
  shelf: 'agents' | 'teams',
  body: TemplateBoxSave,
  taken: { name: string }[],
): Promise<{ token: string; head: string[]; commit: (lines: string[]) => Promise<void> }> {
  const token = words(body.name, 64).toLowerCase();
  if (!isValidToken(token)) throw new Error('A template name is lowercase letters, digits, _ and -.');
  if (taken.some((row) => row.name === token)) {
    throw new Error(`A template called "${token}" already exists on this shelf — a save is always a new one.`);
  }
  const kinds = list(body.kinds).filter((kind) => KINDS.includes(kind));
  const head = [
    `# ${words(body.label, 100) || token}`,
    ...line('label', words(body.label, 100)),
    ...line('art', words(body.art, 8)),
    ...line('blurb', words(body.blurb, 200)),
    ...line('kinds', kinds.join(', ')),
  ];
  const commit = async (lines: string[]): Promise<void> => {
    const dir = path.join(storeDir('catalogs'), 'templates', shelf);
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, `${token}.md`);
    const tmp = `${target}.tmp-${process.pid}`;
    await writeFile(tmp, lines.join('\n'), 'utf8');
    await rename(tmp, target);
  };
  return { token, head, commit };
}

const boxTail = (body: TemplateBoxSave): string[] => [
  ...line('behaviours', list(body.behaviours).join(', ')),
  ...line('routines_on', list(body.routines_on).join(', ')),
  ...line('routines_off', list(body.routines_off).join(', ')),
];

export async function saveAgentTemplate(body: AgentTemplateSave): Promise<AgentTemplateRow> {
  const { token, head, commit } = await openSave('agents', body, await listAgentTemplates());
  const mandate = mandateText(body.mandate);
  if (mandate && !templateMandate(mandate)) {
    throw new Error('A mandate is `reach · recruit · output`, each one of its ruled values.');
  }
  const teamMode = words(body.team_mode, 16);
  if (teamMode && teamMode !== 'new') {
    throw new Error("An agent template's team_mode seed is `new`, or absent.");
  }
  await commit([
    ...head,
    ...line('brief', words(body.brief, 2000)),
    ...line('mandate', mandate),
    ...line('team_mode', teamMode),
    ...boxTail(body),
    '',
  ]);
  const back = (await listAgentTemplates()).find((row) => row.name === token);
  if (!back) throw new Error(`Refused: "${token}" does not read back after the save.`);
  return back;
}

export async function saveTeamTemplate(body: TeamTemplateSave): Promise<TeamTemplateRow> {
  const { token, head, commit } = await openSave('teams', body, await listTeamTemplates());
  const rows = Array.isArray(body.agents) ? body.agents : [];
  const cast: string[] = [];
  const seen = new Set<string>();
  let leads = 0;
  for (const raw of rows) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const name = words(row.name, 100);
    if (!name) throw new Error('Every agent row names its agent.');
    if (seen.has(name)) throw new Error(`Two agent rows are both called "${name}".`);
    seen.add(name);
    const mandate = mandateText(row.mandate);
    if (mandate && !templateMandate(mandate)) {
      throw new Error(`Agent "${name}": a mandate is \`reach · recruit · output\`, each one of its ruled values.`);
    }
    const lead = row.team_lead === true || row.team_lead === 'yes';
    if (lead && ++leads > 1) throw new Error('A cast marks at most one agent as team lead.');
    cast.push(
      '',
      `### ${name}`,
      ...line('team_lead', lead ? 'yes' : ''),
      ...line('instructions', words(row.instructions, 2000)),
      ...line('mandate', mandate),
      ...line('routines_on', list(row.routines_on).join(', ')),
      ...line('routines_off', list(row.routines_off).join(', ')),
    );
  }
  await commit([
    ...head,
    ...line('objective', words(body.objective, 2000)),
    ...boxTail(body),
    ...(cast.length ? ['', '## agents', ...cast] : []),
    '',
  ]);
  const back = (await listTeamTemplates()).find((row) => row.name === token);
  if (!back) throw new Error(`Refused: "${token}" does not read back after the save.`);
  return back;
}
