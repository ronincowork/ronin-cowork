import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import type express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.join(__dirname, '..');

export type RootId = 'user' | 'data';
export type StoreSource = 'env' | 'default';
export interface Store { readonly id: string; readonly root: RootId; readonly rel: string }
export const ROOT_REL: Record<RootId, string> = { user: 'ronin', data: '.ronin' };
const store = (id: string, root: RootId, rel: string): Store => ({ id, root, rel });
export const STORES: readonly Store[] = [
  store('session', 'data', 'sessions'),
  store('archived_sessions', 'data', 'archived-sessions'),
  store('session_boot_cache', 'data', 'session-boot'),
  store('session_commands', 'data', 'session-commands'),
  store('bench', 'data', 'bench'),
  store('telemetry', 'data', 'telemetry'),
  store('ageru', 'user', 'ageru'),
  store('ledger', 'data', 'ledger'),
  store('message_queue', 'data', 'message-queue'),
  store('sops', 'user', 'sops'),
  store('ways', 'user', 'ways'),
  store('library', 'user', 'library'),
  store('session_boot', 'user', 'session_boot'),
  store('wipeboards', 'user', 'wipeboards'),
  store('jikan', 'user', 'jikan'),
  store('team_rosters', 'user', 'team_rosters'),
  store('desks', 'user', 'desks'),
  store('worktrees', 'user', 'worktrees'),
  store('catalogs', 'user', 'catalogs'),
  store('tools', 'user', 'tools'),
  store('memory', 'user', 'memory'),
  store('config', 'user', 'config'),
  store('campaigns', 'user', 'campaigns'),
  store('koshi_weights', 'user', 'koshi_weights'),
  store('koshi_weights_service', 'user', 'koshi_weights_service'),
  store('gbrain_brain', 'user', 'gbrain_brain'),
  store('gbrain_service', 'user', 'gbrain_service'),
  store('promotion_ledger', 'data', 'promotion-ledger'),
  store('services_secrets', 'user', 'services_secrets'),
];
const storesById = new Map(STORES.map((row) => [row.id, row]));
export const envName = (id: string): string => `RONIN_${id.toUpperCase()}_DIR`;
export function rootDir(root: RootId): string {
  const override = root === 'user' ? process.env.RONIN_USER_ROOT : process.env.RONIN_DATA_ROOT;
  return override?.trim() || path.join(os.homedir(), ROOT_REL[root]);
}
export function resolveStore(id: string): { dir: string; source: StoreSource } {
  const row = storesById.get(id);
  if (!row) throw new Error(`unknown store '${id}'`);
  const override = process.env[envName(id)]?.trim();
  return override
    ? { dir: override, source: 'env' }
    : { dir: path.join(rootDir(row.root), row.rel), source: 'default' };
}
export const storeDir = (id: string): string => resolveStore(id).dir;

export const STOCK_DIR = path.join(__dirname, '..', 'ronin_catalogs');

export type Origin = 'stock' | 'user';

export interface ResolvedFile {
  name: string;
  relative: string;
  path: string;
  origin: Origin;
  shadowed: boolean;
  text: string;
}

export interface ResolveSpec {
  stock: string;
  store?: string;
  user?: string;
  include?: (relative: string) => boolean;
  symlinks?: boolean;
}

const requestListings = new AsyncLocalStorage<Map<string, Promise<Map<string, { path: string; text: string }>>>>();

export const resourceRequestCache: express.RequestHandler = (_req, _res, next) => {
  requestListings.run(new Map(), next);
};

async function layerFiles(
  dir: string,
  symlinks: boolean,
): Promise<Map<string, { path: string; text: string }>> {
  if (!dir) return new Map();
  const cache = requestListings.getStore();
  const key = `${symlinks ? 'links' : 'files'}:${dir}`;
  const found = cache?.get(key);
  if (found) return found;
  const pending = readLayerFiles(dir, symlinks);
  cache?.set(key, pending);
  return pending;
}

async function readLayerFiles(
  dir: string,
  symlinks: boolean,
): Promise<Map<string, { path: string; text: string }>> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw error;
  }
  const files = new Map<string, { path: string; text: string }>();
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if ((!entry.isFile() && !(symlinks && entry.isSymbolicLink())) || entry.name.startsWith('.')) continue;
    const file = path.join(dir, entry.name);
    try {
      files.set(entry.name, { path: file, text: await readFile(file, 'utf8') });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return files;
}

export async function resolveFiles(spec: ResolveSpec): Promise<ResolvedFile[]> {
  const userDir = spec.user ?? (spec.store ? storeDir(spec.store) : '');
  const [stock, user] = await Promise.all([
    layerFiles(spec.stock, spec.symlinks === true),
    layerFiles(userDir, spec.symlinks === true),
  ]);
  const names = [...new Set([...stock.keys(), ...user.keys()])].sort();
  return names.flatMap((relative) => {
    if (spec.include && !spec.include(relative)) return [];
    const selected = user.get(relative) ?? stock.get(relative);
    if (!selected) return [];
    return [{
      name: relative.replace(/\.[^.]+$/, ''),
      relative,
      path: selected.path,
      text: selected.text,
      origin: user.has(relative) ? 'user' as const : 'stock' as const,
      shadowed: user.has(relative) && stock.has(relative),
    }];
  });
}

export interface SopRow {
  name: string;
  label: string;
  blurb: string;
  content: string;
  origin: Origin;
  shadowed: boolean;
}

export async function listSops(): Promise<SopRow[]> {
  const files = await resolveFiles({
    stock: path.join(__dirname, '..', 'ronin_sops'),
    store: 'sops',
    include: (name) => name.endsWith('.md') && name !== 'README.md',
  });
  return files.map((file) => {
    const label = file.text.match(/^#\s+(.+)$/m)?.[1]?.trim() || file.name;
    const blurb = file.text.split(/\n\s*\n/)
      .map((part) => part.replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim())
      .find((part) => part && !part.startsWith('#')) || '';
    return {
      name: file.name, label, blurb, content: file.text,
      origin: file.origin, shadowed: file.shadowed,
    };
  }).sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name));
}

export interface WayRow {
  name: string;
  label: string;
  blurb: string;
  kinds: string[];
  origin: Origin;
  shadowed: boolean;
}

const WAY_KINDS = new Set(['coding', 'work', 'personal', 'household', 'social', 'school']);

export async function listWays(): Promise<WayRow[]> {
  const roleFiles = await resolveFiles({
    stock: path.join(STOCK_DIR, 'session_roles'),
    include: (name) => name.endsWith('.md') && name !== 'README.md',
  });
  const userFiles = await resolveFiles({
    stock: '', store: 'ways',
    include: (name) => name.endsWith('.md') && name !== 'README.md',
  });
  const snake = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const files = new Map(roleFiles.map((file) => [snake(file.name), { ...file, name: snake(file.name) }]));
  for (const file of userFiles) files.set(file.name, { ...file, shadowed: files.has(file.name) });
  return [...files.values()].map((file) => {
    const label = file.text.match(/^#\s+(.+)$/m)?.[1]?.trim() || file.name;
    const kinds = (file.text.match(/^-\s+\*\*kinds:\*\*\s*(.+)$/m)?.[1] ?? '')
      .split(',').map((kind) => kind.trim()).filter((kind) => WAY_KINDS.has(kind));
    const blurb = file.text.split(/\n\s*\n/)
      .map((part) => part.replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim())
      .find((part) => part && !part.startsWith('#') && !part.startsWith('- **')) || '';
    return {
      name: file.name, label, kinds, blurb: blurb.slice(0, 200),
      origin: file.origin, shadowed: file.shadowed,
    };
  }).sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name));
}

export async function wayFile(name: string, origin: Origin): Promise<string> {
  if (origin === 'user') return path.join(storeDir('ways'), `${name}.md`);
  const snake = (token: string) => token.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const files = await resolveFiles({
    stock: path.join(STOCK_DIR, 'session_roles'),
    include: (relative) => relative.endsWith('.md') && relative !== 'README.md',
  });
  return files.find((file) => snake(file.name) === name)?.path ?? '';
}

export interface CatalogSection {
  name: string;
  head: string;
  lines: string[];
  origin: Origin;
  shadowed: boolean;
}

export type Entry = { name: string; origin: Origin; shadowed: boolean; get: (key: string) => string };

export const isKeyLine = (line: string): boolean => /^-\s*\*\*[\w.-]+:\*\*/.test(line.trim());
const keyPattern = (key: string): string => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const entryValue = (lines: string[], key: string): string =>
  (lines.find((l) => new RegExp(`^-\\s*\\*\\*${keyPattern(key)}:\\*\\*`, 'i').test(l.trim())) ?? '')
    .replace(new RegExp(`^\\s*-\\s*\\*\\*${keyPattern(key)}:\\*\\*\\s*`, 'i'), '')
    .trim();

export const entryPairs = (lines: string[]): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  for (const raw of lines) {
    const m = /^-\s*\*\*([\w.-]+):\*\*\s*(.*?)\s*$/.exec(raw.trim());
    if (m) out.push([m[1], m[2]]);
  }
  return out;
};

async function readUserCatalog(file: string): Promise<string> {
  try {
    return await readFile(path.join(storeDir('catalogs'), file), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return '';
    throw e;
  }
}

export function splitSections(raw: string, origin: Origin): CatalogSection[] {
  const body = raw.split(/^---\s*$/m)[0];
  const out: CatalogSection[] = [];
  for (const chunk of body.split(/^## +/m).slice(1)) {
    const lines = chunk.split('\n');
    const head = (lines[0] ?? '').trim();
    const name = (head.split(/\s+/)[0] ?? '').replace(/`/g, '');
    if (!name) continue;
    out.push({ name, head, lines: lines.slice(1), origin, shadowed: false });
  }
  return out;
}

const isHidden = (s: CatalogSection): boolean =>
  s.lines.some((l) => /^-\s*\*\*hidden:\*\*\s*yes\b/i.test(l.trim()));

function mergeSections(stock: CatalogSection[], user: CatalogSection[]): CatalogSection[] {
  const byName = new Map(user.map((s) => [s.name, s] as const));
  const out: CatalogSection[] = [];
  const placed = new Set<string>();
  for (const s of stock) {
    const u = byName.get(s.name);
    placed.add(s.name);
    if (u) {
      if (!isHidden(u)) out.push({ ...u, shadowed: true });
    } else out.push(s);
  }
  for (const u of user) {
    if (placed.has(u.name) || isHidden(u)) continue;
    placed.add(u.name);
    out.push(u);
  }
  return out;
}

export async function readCatalogSections(file: string, stockOptional = false): Promise<CatalogSection[]> {
  const [stockRaw, userRaw] = await Promise.all([
    readFile(path.join(STOCK_DIR, file), 'utf8').catch((e: NodeJS.ErrnoException) => {
      if (stockOptional && e?.code === 'ENOENT') return '';
      throw e;
    }),
    readUserCatalog(file),
  ]);
  return mergeSections(splitSections(stockRaw, 'stock'), splitSections(userRaw, 'user'));
}

export async function readEntries(file: string, stockOptional = false): Promise<Entry[]> {
  const out: Entry[] = [];
  for (const s of await readCatalogSections(file, stockOptional)) {
    if (s.head !== s.name) continue;
    out.push({
      name: s.name,
      origin: s.origin,
      shadowed: s.shadowed,
      get: (key: string) => entryValue(s.lines, key),
    });
  }
  return out;
}

export const splitList = (v: string): string[] =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function parseCredit(v: string): { text: string; url: string } | undefined {
  const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(v.trim());
  return m ? { text: m[1], url: m[2] } : undefined;
}

const SHADOWABLE: Record<string, string> = {
  'MACROS.md': 'a workflow an agent runs when you type +name:',
  'ACTIONS.md': 'a primitive step macros are composed from',
  'TOOLS.md': 'an executable of yours that implements an action',
  'SAVED_LAUNCHES.md': 'a launcher form, filled in ahead of time and named',
  'SKINS.md': 'a look — a set of design tokens, and nothing else',
};

export const isShadowable = (file: string): boolean => Object.hasOwn(SHADOWABLE, file);

function newFileHeader(file: string): string {
  const what = SHADOWABLE[file] ?? 'your own entries';
  const stock = file === 'SAVED_LAUNCHES.md' ? '' :
    `>\n> The shipped copy is \`ronin_catalogs/${file}\` — read it for the format and copy a\n` +
    `> block out of it to start from. An entry here with the SAME \`## name\` REPLACES that\n` +
    `> one whole; a new name is added after them; \`- **hidden:** yes\` deletes one.\n`;
  return `# ${file.replace(/\.md$/, '')} — yours (user scope)

> **Ronin made this file; Ronin never replaces it.** It lives outside every repo, an
> upgrade cannot touch it, and an uninstall leaves it. Hand-edit it freely.
>
> One \`## <name>\` block per ${what}, with \`- **key:** value\` lines under it.
${stock}>
> The rule in full: \`docs/shadowing.md\`.
`;
}

export async function seedUserCatalog(file: string): Promise<{ path: string; created: boolean }> {
  if (!isShadowable(file)) throw new Error(`"${file}" is not a catalog you can keep your own copy of.`);
  const dir = storeDir('catalogs');
  const target = path.join(dir, file);
  try {
    await readFile(target, 'utf8');
    return { path: target, created: false };
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e;
  }
  await writeCatalogFile(file, newFileHeader(file));
  return { path: target, created: true };
}

async function writeCatalogFile(file: string, text: string): Promise<void> {
  const dir = storeDir('catalogs');
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, file);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, target);
}

export interface SavedLaunchInfo {
  name: string;
  origin: Origin;
  shadowed: boolean;
  label: string;
  role_family: string;
  session_role: string;
  project_root: string;
  group: string;
  prompt: string;
}

export async function listSavedLaunches(): Promise<SavedLaunchInfo[]> {
  return (await readEntries('SAVED_LAUNCHES.md', true))
    .map((e) => ({
      name: e.name,
      origin: e.origin,
      shadowed: e.shadowed,
      label: e.get('label') || e.name,
      role_family: e.get('role_family'),
      session_role: e.get('session_role'),
      project_root: e.get('project_root'),
      group: e.get('team') || e.get('group'),
      prompt: e.get('prompt'),
    }))
    .filter((l) => l.role_family || l.session_role);
}

export const isValidLaunchName = (n: string) => /^[a-z0-9][a-z0-9_-]*$/.test(n) && n.length <= 32;

const LAUNCH_FIELDS = ['label', 'session_role', 'project_root', 'team', 'prompt'] as const;
export type LaunchField = (typeof LAUNCH_FIELDS)[number];

export function savedLaunchFields(body: unknown): Partial<Record<LaunchField, string>> {
  const fields: Partial<Record<LaunchField, string>> = {};
  for (const key of LAUNCH_FIELDS) {
    const value = (body as Record<string, unknown>)?.[key];
    if (typeof value === 'string') fields[key] = value.trim().slice(0, 500);
  }
  return fields;
}

export async function saveLaunch(name: string, fields: Partial<Record<LaunchField, string>>): Promise<void> {
  if (!isValidLaunchName(name)) throw new Error(`"${name}" is not a valid handle (lowercase letters, digits, - and _).`);
  if (!fields.session_role) throw new Error('A saved launch needs a session_role.');
  const file = 'SAVED_LAUNCHES.md';
  await seedUserCatalog(file);
  const raw = await readUserCatalog(file);
  const lines = raw.split('\n');

  const at = lines.findIndex((l) => new RegExp(`^## +${name}\\s*$`).test(l));
  let end = lines.length;
  if (at !== -1) for (let i = at + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; }

  const block = [`## ${name}`];
  for (const key of LAUNCH_FIELDS) {
    const v = (fields[key] ?? '').trim();
    if (v) block.push(`- **${key}:** ${v.replace(/\n+/g, ' ')}`);
  }
  if (at === -1) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', ...block, '');
  } else lines.splice(at, end - at, ...block, '');

  const text = lines.join('\n');
  const back = splitSections(text, 'user').find((s) => s.name === name);
  if (!back) throw new Error(`Refused: "${name}" is not in the catalog after the edit.`);
  await writeCatalogFile(file, text);
}

export async function removeLaunch(name: string): Promise<void> {
  if (!isValidLaunchName(name)) throw new Error(`"${name}" is not a valid handle.`);
  const raw = await readUserCatalog('SAVED_LAUNCHES.md');
  const lines = raw.split('\n');
  const at = lines.findIndex((l) => new RegExp(`^## +${name}\\s*$`).test(l));
  if (at === -1) throw new Error(`"${name}" is not in the catalog.`);
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { end = i; break; }
  let from = at;
  while (from > 0 && lines[from - 1].trim() === '') from--;
  lines.splice(from, end - from);
  await writeCatalogFile('SAVED_LAUNCHES.md', lines.join('\n'));
}
