/**
 * INTEGRATIONS, THE COMMON WAY (KAN-328; KAN-339). Every outside service a user brings is held
 * the same way, whether or not Ronin has a bridge for it:
 *
 *   the record    ronin_catalogs/integrations/<name>.md (an Agent's in the owner store's catalogs)
 *   the token     ~/ronin/services_secrets/<name>-<campaign>.env, plain KEY=value, mode 0600
 *                 (a record may name another file: Jira keeps jira-<campaign>.json)
 *   the link      each Workspace lists the integrations it uses (workspaces.ts)
 *
 * The state is read live: whether the token file is there and which of its keys are set (names
 * only, never a value), the Workspaces using it, and where a bridge is a Services part, whether
 * it runs. Connect writes the `.env` and Disconnect removes it, for any provider.
 */
import { chmod, readFile, rename, unlink, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';
import { listIntegrations, type IntegrationRow } from './resource-adapters.js';
import { listWorkspaces } from './workspaces.js';

export class IntegrationBadInput extends Error {}
export class IntegrationMissing extends Error {}

/** running: the bridge, a Services part, is loaded; parked: on disk, not loaded; other: no such
 * part on this machine (a command, or Services not installed); '' is no bridge. */
export type BridgeState = 'running' | 'parked' | 'other' | '';

export interface IntegrationState extends IntegrationRow {
  /** The token file, whole path. */
  token_file: string;
  connected: boolean;
  /** The keys the file sets, names only. */
  set: string[];
  /** The record's keys the file does not set. */
  missing: string[];
  workspaces: string[];
  bridge_state: BridgeState;
}

const KEY = /^[A-Z][A-Z0-9_]{0,63}$/;

export const tokenFile = (row: Pick<IntegrationRow, 'token'>, campaign: string): string =>
  path.join(storeDir('services_secrets'), row.token.replaceAll('{campaign}', campaign));

const isEnv = (file: string): boolean => file.endsWith('.env');

async function readText(file: string): Promise<string | null> {
  try { return await readFile(file, 'utf8'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}

/** The `.env` lines as [key, value], in order; comments and blanks dropped. */
function envPairs(text: string): Array<[string, string]> {
  return text.split('\n').flatMap((line) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    return m ? [[m[1], m[2].trim()] as [string, string]] : [];
  });
}

export interface PartFacts { onDisk: string[]; loaded: string[] }

function bridgeState(bridge: string, parts: PartFacts): BridgeState {
  if (!bridge) return '';
  if (parts.loaded.includes(bridge)) return 'running';
  if (parts.onDisk.includes(bridge)) return 'parked';
  return 'other';
}

export async function integrationsState(campaign: string, parts: PartFacts): Promise<IntegrationState[]> {
  const [rows, workspaces] = await Promise.all([listIntegrations(), listWorkspaces(campaign)]);
  return Promise.all(rows.map(async (row) => {
    const file = tokenFile(row, campaign);
    const text = await readText(file);
    const set = text === null ? [] : isEnv(file) ? envPairs(text).filter(([, v]) => v !== '').map(([k]) => k) : [];
    return {
      ...row,
      token_file: file,
      connected: text !== null,
      set,
      missing: text === null || isEnv(file) ? row.keys.filter((key) => !set.includes(key)) : [],
      workspaces: workspaces.filter((w) => w.integrations.some((i) => i.provider === row.name)).map((w) => w.name),
      bridge_state: bridgeState(row.bridge, parts),
    };
  }));
}

async function recordOf(name: string): Promise<IntegrationRow> {
  const row = (await listIntegrations()).find((one) => one.name === name);
  if (!row) throw new IntegrationMissing(`No integration "${name}" in the index.`);
  return row;
}

/** Connect: write the given keys into the provider's `.env` (mode 0600), keeping the lines it had. */
export async function connectIntegration(campaign: string, name: string, values: Record<string, unknown>): Promise<string> {
  const row = await recordOf(name);
  const file = tokenFile(row, campaign);
  if (!isEnv(file)) throw new IntegrationBadInput(`${row.label} keeps its token in ${path.basename(file)}; connect it in its own panel.`);
  const given = Object.entries(values ?? {}).map(([k, v]) => [k.trim(), String(v ?? '').trim()] as [string, string]).filter(([, v]) => v !== '');
  if (!given.length) throw new IntegrationBadInput('Nothing to write: give at least one key and its value.');
  for (const [k, v] of given) {
    if (!KEY.test(k)) throw new IntegrationBadInput(`"${k}" is not a key name: capitals, digits and _.`);
    if (/[\r\n]/.test(v)) throw new IntegrationBadInput(`${k}: a value is one line.`);
  }
  const pairs = new Map(envPairs(await readText(file) ?? ''));
  for (const [k, v] of given) pairs.set(k, v);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, [...pairs].map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, file);
  return file;
}

/** Disconnect: remove the provider's `.env`. Gone already is fine. */
export async function disconnectIntegration(campaign: string, name: string): Promise<string> {
  const row = await recordOf(name);
  const file = tokenFile(row, campaign);
  if (!isEnv(file)) throw new IntegrationBadInput(`${row.label} keeps its token in ${path.basename(file)}; disconnect it in its own panel.`);
  try { await unlink(file); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  return file;
}
