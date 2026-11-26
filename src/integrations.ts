/**
 * INTEGRATIONS (docs/architecture/integrations.md; owner, 2026-11-26, KAN-857). Every outside
 * service is one record in this machine's Settings, set up and keyed there; a Workspace only uses it.
 *
 *   the record    ~/ronin/custom/integrations/<name>.md (written by Settings, `mcp add`, `api add`;
 *                 the Services part `mcp` owns the writes); Jira's record is its connection file,
 *                 ~/ronin/jira/<campaign>.json (the Services part `jira`)
 *   the bridge    a behaviour with `when: integration:<name>` (catalog.ts catalogIntegrations)
 *   the key       the record's secret, ~/ronin/services_secrets/<secret> (secrets.ts)
 *   the use       each Workspace's `integrations` entries, `{provider, …facts}` (workspaces.ts)
 *
 * The list reads the files, never a server: each record with its ways (bridge, MCP, web API),
 * whether its key is saved (never the value), whether its Services part runs, and the Workspaces
 * using it.
 */
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { catalogIntegrations, readCatalog } from './catalog.js';
import { machineCampaignId } from './campaign-scope.js';
import { readCampaign, writeCampaign } from './campaigns.js';
import { storeDir } from './resources.js';
import { secretNames } from './secrets.js';
import { listWorkspaces } from './workspaces.js';

/** running: a Services part of the name is loaded; parked: on disk, not loaded; '': no such part. */
export type PartState = 'running' | 'parked' | '';
export type SignIn = 'key' | 'oauth' | 'none';

export interface IntegrationState {
  name: string;
  /** The record's title; the bridge's title without "bridge" when the record has none. */
  label: string;
  /** The record's description, else the bridge's seed. */
  blurb: string;
  /** The bridge behaviour's id; '' is none. */
  bridge: string;
  /** The running details a Workspace gives its bridge (its `facts:` line); [] is none. */
  facts: string[];
  /** An MCP server: its URL or start command; '' otherwise. */
  reach: string;
  /** A web API: its root URL; '' otherwise. */
  base: string;
  sign_in: SignIn;
  /** The secret that holds its key or token; '' with none. */
  secret: string;
  /** The secret is saved (or none is needed). */
  saved: boolean;
  part: PartState;
  workspaces: string[];
}

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const recordsDir = (): string => path.join(storeDir('custom'), 'integrations');

/** The record's fields: `- **key:** value` lines under a `# Title`. */
function parseRecord(name: string, text: string) {
  const lines = text.split(/\r?\n/);
  const field = (key: string): string => {
    const line = lines.find((one) => one.toLowerCase().startsWith(`- **${key}:**`));
    return line ? line.slice(line.indexOf(':**') + 3).trim() : '';
  };
  const signIn = field('sign-in').toLowerCase();
  return {
    name,
    label: (lines.find((one) => one.startsWith('# ')) ?? `# ${name}`).slice(2).trim() || name,
    description: field('description'),
    reach: field('reach'),
    base: field('base'),
    sign_in: (signIn === 'key' || signIn === 'oauth' ? signIn : 'none') as SignIn,
    secret: field('secret'),
  };
}

async function records() {
  const files = await readdir(recordsDir()).catch(() => [] as string[]);
  const rows = await Promise.all(files.filter((f) => f.endsWith('.md') && NAME.test(f.slice(0, -3))).map(async (file) =>
    parseRecord(file.slice(0, -3), await readFile(path.join(recordsDir(), file), 'utf8'))));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Jira's record is its connection file; its token is `jira-<campaign>`. */
async function jiraRecord(campaign: string) {
  const connected = await access(path.join(storeDir('jira'), `${campaign}.json`)).then(() => true, () => false);
  return connected ? { name: 'jira', label: 'Jira', description: '', reach: '', base: '', sign_in: 'key' as SignIn, secret: `jira-${campaign}` } : null;
}

/** Adding an integration turns it on in this machine's Settings, the top of the cascade; removing
 * takes it off (docs/architecture/integrations.md, On and off). Levels that exist keep theirs. */
export async function setOnInSettings(name: string, on: boolean): Promise<void> {
  const id = await machineCampaignId();
  const campaign = id ? await readCampaign(id) : null;
  if (!campaign) return;
  const now = campaign.config.integrations ?? [];
  if (now.includes(name) === on) return;
  await writeCampaign(id, { config: { integrations: on ? [...now, name] : now.filter((one) => one !== name) } });
}

export interface PartFacts { onDisk: string[]; loaded: string[] }

const partState = (name: string, parts: PartFacts): PartState =>
  parts.loaded.includes(name) ? 'running' : parts.onDisk.includes(name) ? 'parked' : '';

export async function integrationsState(campaign: string, parts: PartFacts): Promise<IntegrationState[]> {
  const [behaviours, workspaces, saved, owned, jira] = await Promise.all([readCatalog('behaviours'), listWorkspaces(campaign), secretNames(), records(), jiraRecord(campaign)]);
  const bridges = catalogIntegrations({ behaviours });
  const all = [...(jira ? [jira] : []), ...owned.filter((r) => r.name !== 'jira')];
  return all.map((record) => {
    const bridge = bridges.find((b) => b.name === record.name);
    return {
      name: record.name,
      label: record.label !== record.name ? record.label : bridge ? bridge.title.replace(/\s+bridge$/i, '') : record.label,
      blurb: record.description || bridge?.seed || '',
      bridge: bridge?.behaviour ?? '',
      facts: bridge?.facts ?? [],
      reach: record.reach,
      base: record.base,
      sign_in: record.sign_in,
      secret: record.secret,
      saved: record.sign_in === 'none' || (!!record.secret && saved.includes(record.secret)),
      part: partState(record.name, parts),
      workspaces: workspaces.filter((w) => w.integrations.some((i) => i.provider === record.name)).map((w) => w.name),
    };
  });
}
