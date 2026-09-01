/**
 * SAVE AS TEMPLATE — the one write the template catalog offers (NEW_AGENT.md leg 6).
 *
 * A save is always NEW: the forms offer "Save as template" over a fresh definition and
 * "Save as new template" over an edited one, and neither writes over the box the owner
 * started from — shipped templates are edited on the campaign page, not here. So a name
 * that already resolves, stock or user's, is refused rather than shadowed: a quiet
 * shadow would be an upgrade-proof copy the owner never asked for.
 *
 * The file lands in the OWNER'S catalogs store (`<catalogs store>/templates/<token>.md`),
 * which is what makes it survive upgrade and uninstall like every catalog of theirs, and
 * it is read back through the ordinary reader before success is reported — a definition
 * that does not read back is a tray that would render without it.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listTemplates, templateMandate, type TemplateRow } from './definitions.js';
import { storeDir } from './stores.js';

const isValidToken = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);
const KINDS = ['coding', 'work', 'personal', 'household', 'social', 'school'];
const text = (value: unknown, max = 2000): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const words = (value: unknown, max = 500): string => text(value, max).replace(/\n/g, ' ');
const list = (value: unknown): string[] => Array.isArray(value)
  ? value.map((entry) => words(entry, 160)).filter(Boolean)
  : [];

export interface TemplateSave {
  name: string;
  label?: unknown;
  art?: unknown;
  blurb?: unknown;
  kinds?: unknown;
  brief?: unknown;
  objective?: unknown;
  mandate?: unknown;
  behaviours?: unknown;
  routines_on?: unknown;
  routines_off?: unknown;
  lead_brief?: unknown;
  lead_mandate?: unknown;
}

export async function saveTemplate(body: TemplateSave): Promise<TemplateRow> {
  const token = words(body.name, 64).toLowerCase();
  if (!isValidToken(token)) throw new Error('A template name is lowercase letters, digits, _ and -.');
  if ((await listTemplates()).some((row) => row.name === token)) {
    throw new Error(`A template called "${token}" already exists — a save is always a new one.`);
  }
  const kinds = list(body.kinds).filter((kind) => KINDS.includes(kind));
  const mandate = words(body.mandate);
  if (mandate && !templateMandate(mandate)) {
    throw new Error('A mandate is `reach · recruit · output`, each one of its ruled values.');
  }
  const leadMandate = words(body.lead_mandate);
  if (leadMandate && !templateMandate(leadMandate)) {
    throw new Error('A lead mandate is `reach · recruit · output`, each one of its ruled values.');
  }
  const line = (key: string, value: string): string[] => (value ? [`- **${key}:** ${value}`] : []);
  const lines = [
    `# ${words(body.label, 100) || token}`,
    ...line('label', words(body.label, 100)),
    ...line('art', words(body.art, 8)),
    ...line('blurb', words(body.blurb, 200)),
    ...line('kinds', kinds.join(', ')),
    ...line('brief', words(body.brief, 2000)),
    ...line('objective', words(body.objective, 2000)),
    ...line('mandate', mandate),
    ...line('behaviours', list(body.behaviours).join(', ')),
    ...line('routines_on', list(body.routines_on).join(', ')),
    ...line('routines_off', list(body.routines_off).join(', ')),
    ...line('lead_brief', words(body.lead_brief, 2000)),
    ...line('lead_mandate', leadMandate),
    '',
  ];
  const dir = path.join(storeDir('catalogs'), 'templates');
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, `${token}.md`);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, lines.join('\n'), 'utf8');
  await rename(tmp, target);
  const back = (await listTemplates()).find((row) => row.name === token);
  if (!back) throw new Error(`Refused: "${token}" does not read back after the save.`);
  return back;
}
