import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './stores.js';

/**
 * A saved template belongs to ONE Campaign (CAMPAIGN_SCOPING § Templates). Stock templates
 * are offered by the selected Campaign's `desk_profile`; these saved ones are the owner's
 * and carry the Campaign they were saved in, so a plural view can group libraries rather
 * than merge two same-named templates from different bodies of work.
 *
 * '' is unmarked — a template saved before Campaigns — and reads through the same
 * compatibility mapping as every other durable record.
 */
export interface TeamTemplate { name: string; campaign_id: string; draft: Record<string, unknown> }
const file = () => path.join(storeDir('catalogs'), 'TEAM_TEMPLATES.json');
const valid = (name: string) => /^[a-z0-9][a-z0-9_-]{0,31}$/.test(name);

export async function listTeamTemplates(): Promise<TeamTemplate[]> {
  try {
    const rows = JSON.parse(await readFile(file(), 'utf8'));
    return Array.isArray(rows)
      ? rows
          .filter((row) => valid(row?.name) && row?.draft && typeof row.draft === 'object')
          .map((row) => ({
            name: row.name,
            // Absent on every template written before Campaigns, which is the ordinary
            // case and not a fault: '' is unmarked, never a guess.
            campaign_id: typeof row.campaign_id === 'string' ? row.campaign_id : '',
            draft: row.draft,
          }))
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function write(rows: TeamTemplate[]): Promise<void> {
  await mkdir(storeDir('catalogs'), { recursive: true });
  const target = file(), temp = `${target}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  await rename(temp, target);
}

export async function saveTeamTemplate(
  name: string,
  draft: Record<string, unknown>,
  campaign_id = '',
): Promise<void> {
  if (!valid(name)) throw new Error('Template name: lowercase letters, digits, - and _.');
  const rows = await listTeamTemplates(), clean = structuredClone(draft);
  delete clean.transaction;
  if (clean.team && typeof clean.team === 'object') {
    (clean.team as Record<string, unknown>).name = '';
    (clean.team as Record<string, unknown>).wipeboard = '';
    // THE CAMPAIGN IS BLANKED OUT OF THE DRAFT, beside the name and the wipeboard, and for
    // the same reason: those three are the identity of the team this draft was saved FROM,
    // and a template is a shape to make a new team with, not a copy of an old one. A draft
    // that carried its Campaign would silently create the next team in the body of work the
    // template happened to be saved in. The row's own `campaign_id` says which library the
    // template lives in; it never says which Campaign the team it builds belongs to.
    (clean.team as Record<string, unknown>).campaign_id = '';
  }
  // Identity is campaign_id + name, exactly as it is for a Cowork: two Campaigns may each
  // keep a template called `standard` and neither overwrites the other.
  const at = rows.findIndex((row) => row.name === name && row.campaign_id === campaign_id);
  const next = { name, campaign_id, draft: clean };
  if (at < 0) rows.push(next); else rows[at] = next;
  await write(rows.sort((a, b) => a.campaign_id.localeCompare(b.campaign_id) || a.name.localeCompare(b.name)));
}

export async function removeTeamTemplate(name: string, campaign_id = ''): Promise<void> {
  if (!valid(name)) throw new Error('Invalid template name.');
  const rows = await listTeamTemplates();
  const next = rows.filter((row) => !(row.name === name && row.campaign_id === campaign_id));
  if (next.length === rows.length) throw new Error(`Template "${name}" does not exist.`);
  await write(next);
}
