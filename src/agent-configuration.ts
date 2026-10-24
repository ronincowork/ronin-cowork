/**
 * UPDATE (owner, 2026-10-24): the Agent's Configuration is one act. Press Update and Ronin
 * writes the configuration — the mandate to the work record, the chosen Behaviors to the
 * composition — builds the Agent a new brief from today's files over those facts, and tells
 * it once: here is your new brief, read it. The brief is built from the facts and the reading
 * alone (resolveFacts, resolveReading): nothing about launching is in the way, so nothing
 * about launching can fail it.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readAgentComposition, writeCurrentBehaviours } from './agent-composition.js';
import type { Mandate } from './agent-defaults.js';
import { compileBirthReadmeAt, isShelfTeaching, packetEndLine } from './birth-readme.js';
import { enqueueMessage } from './message-queue.js';
import { listBehaviours } from './resource-adapters.js';
import { sessionDir, sessionKey } from './session-dir.js';
import { resolveFacts, resolveReading, type SpawnForm } from './spawn.js';
import { writeMandate } from './tegami.js';
import { getCampaign, getLeads, getProjectRoot, getTags } from './tmux.js';

type Receipt = { team?: string; kind?: string; behaviours?: Array<{ book?: string }> };

/** The reading the Agent's brief has today: its current facts over today's files. */
async function configurationReading(name: string) {
  const dir = sessionDir(await sessionKey(name));
  const receipt = JSON.parse(await readFile(path.join(dir, 'birth-receipt.json'), 'utf8')) as Receipt;
  const [composition, tags, leads, projectRoot, campaign, catalog] = await Promise.all([
    readAgentComposition(name), getTags(name), getLeads(name), getProjectRoot(name), getCampaign(name), listBehaviours(),
  ]);
  const team = receipt.team && tags.includes(receipt.team) ? receipt.team : tags[0] ?? '';
  const selected = new Set(catalog.filter((row) => row.scope === 'selected').map((row) => row.name));
  const form: SpawnForm = {
    session_type: 'cowork_agent',
    name,
    team,
    team_lead: !!team && leads.includes(team),
    project_root: projectRoot || undefined,
    campaign_id: campaign || undefined,
    kind: receipt.kind,
    mandate: composition.current.mandate,
    behaviours: composition.current.behaviours.map((row) => row.name).filter((book) => selected.has(book)),
  };
  const reading = await resolveReading(form, await resolveFacts(form, new Set()));
  return { dir, receipt, catalog, reading };
}

/**
 * WHAT THE BRIEF CARRIES: every behaviour in it, as Always (floor), Because (a conditional
 * whose requirements hold now) or Chosen. `since_birth` marks a conditional the birth
 * receipt lacks: an Update would add it. The Configuration shows this list as its preview.
 */
export async function configurationSends(name: string) {
  const { receipt, catalog, reading } = await configurationReading(name);
  const born = new Set((receipt.behaviours ?? []).map((row) => row.book));
  const rows = new Map(catalog.map((row) => [row.name, row]));
  return reading.appliedBehaviours.flatMap((delivered) => {
    const row = rows.get(delivered.book.replace(/^ways:/, ''));
    if (!row) return [];
    return [{
      name: row.name, label: row.label, blurb: row.blurb, path: row.page, scope: row.scope, requires: row.requires,
      since_birth: row.scope === 'conditional' && !born.has(row.name),
    }];
  });
}

/** The one act: write, rebuild, tell once. `behaviours` is the whole chosen list; an unticked
 * behaviour simply is not in the new brief. */
export async function updateConfiguration(name: string, next: { mandate: Mandate; behaviours: string[] }): Promise<{ readme: string }> {
  const catalog = await listBehaviours();
  const chosen = catalog.filter((row) => row.scope === 'selected' && next.behaviours.includes(row.name)).map((row) => ({ name: row.name, path: row.page }));
  await writeMandate(name, next.mandate);
  await writeCurrentBehaviours(name, chosen);
  const { dir, reading } = await configurationReading(name);
  const readme = await compileBirthReadmeAt(dir, reading.birthReading, name, isShelfTeaching);
  await enqueueMessage(name, `Your configuration changed. Here is your new brief: ${readme}. Read it now, top to bottom; it ends with the line "${packetEndLine(name)}".`, 'house');
  return { readme };
}
