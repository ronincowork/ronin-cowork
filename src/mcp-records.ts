/**
 * THE MCP SERVER AND WEB API RECORDS, as the brief reads them (docs/architecture/integrations.md,
 * The integration record; What Agents are told). One file per record in this machine's Settings,
 * `~/ronin/custom/integrations/<name>.md`, written by Settings › Integrations, `mcp add` or `api add`
 * (the Services part `mcp`). A record with a `reach:` is an MCP server, one with a `base:` a web API.
 * The brief reads only the name, the kind, the description and whether its secret is saved yet
 * (KAN-600: a record added before its key says so on its line); it never calls a server and never
 * reads a secret's value. A record is on where the cascade has it on, like a bridge.
 */
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { entryValue, isKeyLine, storeDir } from './resources.js';

/** `needs`: what the record still lacks before a call works ('' when nothing), for its brief line. */
export interface McpRecord { name: string; kind: 'mcp' | 'api'; label: string; description: string; needs: string; signIn: string; secret: string }

const NAME = /^[a-z0-9][a-z0-9-]*$/;

export const mcpRecordsDir = (): string => path.join(storeDir('custom'), 'integrations');

export function parseMcpRecord(name: string, text: string): McpRecord | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const header = lines.filter(isKeyLine);
  const kind = entryValue(header, 'reach') ? 'mcp' : entryValue(header, 'base') ? 'api' : '';
  if (!kind) return null;
  const label = /^#\s+(.+?)\s*$/m.exec(text)?.[1] ?? name;
  return {
    name,
    kind,
    label,
    description: entryValue(header, 'description') || label,
    needs: '',
    signIn: (entryValue(header, 'sign-in') || 'none').toLowerCase(),
    secret: entryValue(header, 'secret'),
  };
}

/** Every MCP server and web API record in the owner's store, by name. */
export async function readMcpRecords(): Promise<McpRecord[]> {
  const files = await readdir(mcpRecordsDir()).catch(() => [] as string[]);
  const rows = await Promise.all(files.filter((file) => file.endsWith('.md') && NAME.test(file.slice(0, -3))).map(async (file) =>
    parseMcpRecord(file.slice(0, -3), await readFile(path.join(mcpRecordsDir(), file), 'utf8').catch(() => ''))));
  const records = rows.filter((row): row is McpRecord => !!row).sort((a, b) => a.name.localeCompare(b.name));
  // Whether its secret is saved: the file is there (never read).
  await Promise.all(records.map(async (record) => {
    if (record.signIn === 'none' || !record.secret || !/^[a-z0-9][a-z0-9-]*$/.test(record.secret)) return;
    const saved = await access(path.join(storeDir('services_secrets'), record.secret)).then(() => true, () => false);
    if (!saved) record.needs = record.signIn === 'oauth' ? 'the owner to sign in once' : `its key: secret ask ${record.secret}`;
  }));
  return records;
}
