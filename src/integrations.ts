/**
 * INTEGRATIONS, THE COMMON WAY (KAN-328; KAN-513). Every outside service a user brings is held
 * the same way, whether or not Ronin has a bridge for it (docs/architecture/brief.md,
 * Integrations and bridges):
 *
 *   the bridge    a behaviour with `when: integration:<name>` (catalog.ts catalogIntegrations)
 *   the keys      secrets in the store named `<name>-<key>`, asked with `secret ask` (secrets.ts)
 *   the link      each Workspace lists the integrations it uses (workspaces.ts)
 *
 *   an MCP server a record, `~/ronin/custom/integrations/<name>.md` (docs/architecture/integrations.md)
 *
 * The list is the bridges, then every MCP server record (KAN-592; a record named like a bridge is
 * that bridge's way through the broker and shows as the bridge), then any name a Workspace uses
 * that has neither. Each row is read live from the files, never from a server: the Workspaces
 * using it, whether a Services part of its name runs, and the secrets saved for it (names only,
 * never a value).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { catalogIntegrations, readCatalog } from './catalog.js';
import { storeDir } from './resources.js';
import { secretNames } from './secrets.js';
import { listWorkspaces } from './workspaces.js';

/** running: a Services part of the name is loaded; parked: on disk, not loaded; '': no such part. */
export type PartState = 'running' | 'parked' | '';

export interface IntegrationState {
  name: string;
  /** The bridge's title without "bridge"; the name when there is no bridge. */
  label: string;
  /** The bridge's seed; '' without one. */
  blurb: string;
  /** The bridge behaviour's id; '' is none. */
  bridge: string;
  /** The facts the bridge takes (its `facts:` line), each a field on the Workspace page's row; [] is none. */
  facts: string[];
  part: PartState;
  /** The secrets saved under `<name>-`, names only. */
  secrets: string[];
  workspaces: string[];
  /** An MCP server's record; null for a bridge or a bare Workspace name. */
  mcp: McpFacts | null;
  /** The Campaign may turn it on: a bridge, a bare name, or a record whose Campaigns include it (KAN-607). */
  available: boolean;
}

/** What Settings shows of an MCP server record. The broker owns the rest (ronin-services mcp/broker.ts). */
export interface McpFacts {
  reach: string;
  sign_in: 'key' | 'oauth' | 'none';
  /** The secret that holds its key or token; '' with sign-in none. */
  secret: string;
  /** The secret is saved. */
  saved: boolean;
  /** The Campaigns it is available to; [] is every Campaign. Available is not on (KAN-607). */
  campaigns: string[];
}

interface McpRecord { name: string; label: string; description: string; facts: Omit<McpFacts, 'saved'> }

const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const mcpRecordsDir = (): string => path.join(storeDir('custom'), 'integrations');

/** The record's fields as the broker reads them: `- **key:** value` lines under a `# Title`. */
function parseMcpRecord(name: string, text: string): McpRecord {
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
    facts: {
      reach: field('reach'),
      sign_in: signIn === 'key' || signIn === 'oauth' ? signIn : 'none',
      secret: field('secret'),
      campaigns: field('campaigns').split(',').map((one) => one.trim()).filter(Boolean),
    },
  };
}

async function mcpRecords(): Promise<McpRecord[]> {
  const files = await readdir(mcpRecordsDir()).catch(() => [] as string[]);
  const rows = await Promise.all(files.filter((f) => f.endsWith('.md') && NAME.test(f.slice(0, -3))).map(async (file) =>
    parseMcpRecord(file.slice(0, -3), await readFile(path.join(mcpRecordsDir(), file), 'utf8'))));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export interface PartFacts { onDisk: string[]; loaded: string[] }

const partState = (name: string, parts: PartFacts): PartState =>
  parts.loaded.includes(name) ? 'running' : parts.onDisk.includes(name) ? 'parked' : '';

export async function integrationsState(campaign: string, parts: PartFacts): Promise<IntegrationState[]> {
  const [behaviours, workspaces, saved, records] = await Promise.all([readCatalog('behaviours'), listWorkspaces(campaign), secretNames(), mcpRecords()]);
  const bridges = catalogIntegrations({ behaviours });
  const servers = records.filter((r) => !bridges.some((b) => b.name === r.name));
  const used = workspaces.flatMap((w) => w.integrations.map((i) => i.provider));
  const known = new Set([...bridges.map((b) => b.name), ...servers.map((r) => r.name)]);
  const names = [...known, ...[...new Set(used)].filter((name) => !known.has(name)).sort()];
  return names.map((name) => {
    const bridge = bridges.find((b) => b.name === name);
    const record = servers.find((r) => r.name === name);
    const secrets = saved.filter((one) => one.startsWith(`${name}-`) || one === record?.facts.secret);
    return {
      name,
      label: bridge ? bridge.title.replace(/\s+bridge$/i, '') : record?.label ?? name,
      blurb: bridge?.seed ?? record?.description ?? '',
      bridge: bridge?.behaviour ?? '',
      facts: bridge?.facts ?? [],
      part: partState(name, parts),
      secrets,
      workspaces: workspaces.filter((w) => w.integrations.some((i) => i.provider === name)).map((w) => w.name),
      mcp: record ? { ...record.facts, saved: !!record.facts.secret && secrets.includes(record.facts.secret) } : null,
      available: !record || !record.facts.campaigns.length || record.facts.campaigns.includes(campaign),
    };
  });
}
