import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBehaviourBooks } from './behaviours.js';
import { STOCK_DIR, isShadowable, readCatalogSections, seedUserCatalog, splitSections } from './resources.js';
import { findDefinition, readDefinitions } from './resource-adapters.js';
import { storeDir } from './resources.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const BUNDLE_FORMAT = 'ronin-bundle/1';
export const LIBRARY_FORMAT = 'ronin-library/1';

export type BundleStore = 'catalogs' | 'sops' | 'ways' | 'library' | 'tools';
export type BundleCatalog = 'MACROS.md' | 'ACTIONS.md' | 'TOOLS.md';

export interface BundleFile {
  store: BundleStore;
  path: string;
  text: string;
  executable?: boolean;
}

export interface BundleEntry {
  catalog: BundleCatalog;
  name: string;
  text: string;
}

export interface Bundle {
  format: typeof BUNDLE_FORMAT;
  name: string;
  label: string;
  art: string;
  blurb: string;
  kinds: string[];
  version: string;
  files: BundleFile[];
  entries: BundleEntry[];
}

export interface LibraryCard {
  name: string;
  label: string;
  art: string;
  blurb: string;
  kinds: string[];
  version: string;
  url: string;
  sha256: string;
  bytes: number;
  holds: Record<string, number>;
}

export interface LibraryIndex {
  format: typeof LIBRARY_FORMAT;
  bundles: LibraryCard[];
}

const TOKEN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const STORES: readonly BundleStore[] = ['catalogs', 'sops', 'ways', 'library', 'tools'];
const CATALOGS: readonly BundleCatalog[] = ['MACROS.md', 'ACTIONS.md', 'TOOLS.md'];
const CATALOG_DIRS = ['templates/agents', 'templates/teams', 'routines', 'session_roles', 'role_families', 'desk_profiles', 'lexicons'];
const KINDS = ['coding', 'work', 'personal', 'household', 'social', 'school'];
const GUARDS = ['tmux', 'systemctl', 'git'];

const str = (v: unknown, max = 4000): string => (typeof v === 'string' ? v.slice(0, max) : '');
const words = (v: unknown, max = 500): string => str(v, max).replace(/\s+/g, ' ').trim();

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

function stockPathFor(file: Pick<BundleFile, 'store' | 'path'>): string {
  switch (file.store) {
    case 'catalogs': return path.join(STOCK_DIR, file.path);
    case 'sops': return path.join(ROOT, 'ronin_sops', file.path);
    case 'ways': return path.join(ROOT, 'ways', file.path);
    case 'library': return path.join(ROOT, 'ronin_library', file.path);
    case 'tools': return path.join(ROOT, 'ronin_bin', file.path);
  }
}

const userPathFor = (file: Pick<BundleFile, 'store' | 'path'>): string =>
  path.join(storeDir(file.store), file.path);

function checkPath(store: BundleStore, p: string): string | null {
  if (!p || p.length > 200 || p.includes('\\') || p.includes('..') || p.startsWith('/')) return 'a path stays inside its store';
  const parts = p.split('/');
  if (parts.some((part) => !part || part.startsWith('.'))) return 'a path stays inside its store';
  if (store === 'tools') {
    if (parts.length !== 1 || !TOKEN.test(p)) return 'a tool is one bare command name';
    if (GUARDS.includes(p)) return 'a bundle never supplies a guard';
    return null;
  }
  if (!p.endsWith('.md')) return 'a book is a Markdown file';
  const stem = parts[parts.length - 1].slice(0, -3);
  if (store === 'catalogs') {
    const dir = parts.slice(0, -1).join('/');
    if (!CATALOG_DIRS.includes(dir)) return `a catalog file sits on one of: ${CATALOG_DIRS.join(', ')}`;
    if (!/^[\w-]{1,64}$/.test(stem)) return 'a definition is named by its token';
    return null;
  }
  if (parts.length !== 1 || !TOKEN.test(stem)) return 'a book is one file, named by its token';
  return null;
}

function checkEntry(entry: BundleEntry): string | null {
  if (!TOKEN.test(entry.name) && !/^[\w-]{1,64}$/.test(entry.name)) return 'an entry is named by its token';
  if (entry.catalog === 'TOOLS.md') {
    const m = /^\|\s*`([^`]+)`\s*\|\s*[a-z-]+\s*\|\s*.+?\s*\|\s*$/.exec(entry.text.trim());
    if (!m || m[1] !== entry.name) return 'a TOOLS row is `| `name` | action | usage |`, on one line';
    return null;
  }
  const head = /^##\s+`?([\w-]+)`?(?:\s.*)?$/.exec(entry.text.split('\n')[0] ?? '');
  if (!head || head[1] !== entry.name) return 'a MACROS or ACTIONS entry opens with its own `## name` heading';
  if (/^##\s/m.test(entry.text.split('\n').slice(1).join('\n'))) return 'one entry, one heading';
  return null;
}

export function parseBundle(raw: unknown): Bundle {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (b.format !== BUNDLE_FORMAT) throw new Error(`Not a template bundle: format is not ${BUNDLE_FORMAT}.`);
  const name = words(b.name, 64).toLowerCase();
  if (!TOKEN.test(name)) throw new Error('A bundle name is lowercase letters, digits, _ and -.');
  const files: BundleFile[] = [];
  for (const raw of Array.isArray(b.files) ? b.files : []) {
    const f = (raw ?? {}) as Record<string, unknown>;
    const store = str(f.store, 16) as BundleStore;
    if (!STORES.includes(store)) throw new Error(`"${name}": a file's store is one of ${STORES.join(', ')}.`);
    const p = str(f.path, 200);
    const why = checkPath(store, p);
    if (why) throw new Error(`"${name}": ${p || '(no path)'} — ${why}.`);
    if (typeof f.text !== 'string') throw new Error(`"${name}": ${p} carries no text.`);
    if (files.some((x) => x.store === store && x.path === p)) throw new Error(`"${name}": ${store}/${p} is listed twice.`);
    files.push({ store, path: p, text: f.text, ...(store === 'tools' ? { executable: true } : {}) });
  }
  const entries: BundleEntry[] = [];
  for (const raw of Array.isArray(b.entries) ? b.entries : []) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const catalog = str(e.catalog, 16) as BundleCatalog;
    if (!CATALOGS.includes(catalog)) throw new Error(`"${name}": an entry's catalog is one of ${CATALOGS.join(', ')}.`);
    const entry: BundleEntry = { catalog, name: words(e.name, 64), text: str(e.text, 20000).trimEnd() };
    const why = checkEntry(entry);
    if (why) throw new Error(`"${name}": ${catalog} ${entry.name || '(unnamed)'} — ${why}.`);
    if (entries.some((x) => x.catalog === catalog && x.name === entry.name)) throw new Error(`"${name}": ${catalog} ${entry.name} is listed twice.`);
    entries.push(entry);
  }
  if (!files.length && !entries.length) throw new Error(`"${name}" holds nothing.`);
  return {
    format: BUNDLE_FORMAT,
    name,
    label: words(b.label, 100) || name,
    art: words(b.art, 8),
    blurb: words(b.blurb, 200),
    kinds: (Array.isArray(b.kinds) ? b.kinds : []).map((k) => words(k, 16)).filter((k) => KINDS.includes(k)),
    version: words(b.version, 32),
    files,
    entries,
  };
}

export function bundleHolds(bundle: Bundle): Record<string, number> {
  const holds: Record<string, number> = {};
  const bump = (key: string) => { holds[key] = (holds[key] ?? 0) + 1; };
  for (const f of bundle.files) {
    if (f.store === 'catalogs') bump(f.path.startsWith('templates/teams/') ? 'teams' : f.path.startsWith('templates/agents/') ? 'agents' : f.path.split('/')[0]);
    else bump(f.store);
  }
  for (const e of bundle.entries) bump(e.catalog === 'MACROS.md' ? 'macros' : e.catalog === 'ACTIONS.md' ? 'actions' : 'tools');
  return holds;
}

export function parseLibraryIndex(raw: unknown): LibraryIndex {
  const i = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (i.format !== LIBRARY_FORMAT) throw new Error(`Not a template library: format is not ${LIBRARY_FORMAT}.`);
  const bundles: LibraryCard[] = [];
  for (const raw of Array.isArray(i.bundles) ? i.bundles : []) {
    const c = (raw ?? {}) as Record<string, unknown>;
    const name = words(c.name, 64).toLowerCase();
    const url = str(c.url, 300);
    if (!TOKEN.test(name) || !url || url.includes('..') || /^[a-z]+:/i.test(url) || url.startsWith('/')) continue;
    const holds: Record<string, number> = {};
    for (const [k, v] of Object.entries((c.holds && typeof c.holds === 'object' ? c.holds : {}) as Record<string, unknown>)) {
      if (typeof v === 'number' && /^[a-z_]{1,24}$/.test(k)) holds[k] = v;
    }
    bundles.push({
      name,
      label: words(c.label, 100) || name,
      art: words(c.art, 8),
      blurb: words(c.blurb, 200),
      kinds: (Array.isArray(c.kinds) ? c.kinds : []).map((k) => words(k, 16)).filter((k) => KINDS.includes(k)),
      version: words(c.version, 32),
      url,
      sha256: /^[0-9a-f]{64}$/.test(str(c.sha256, 64)) ? str(c.sha256, 64) : '',
      bytes: typeof c.bytes === 'number' ? c.bytes : 0,
      holds,
    });
  }
  return { format: LIBRARY_FORMAT, bundles };
}

export type Verdict =
  | 'new'              // nothing of that name anywhere — added
  | 'shadows-shipped'  // a shipped copy exists and differs — the owner's copy will outrank it
  | 'replaces-yours'   // the owner already has their own, and it differs — written only on `replace`
  | 'same-as-shipped'  // identical to what ships — skipped, a shadow that changes nothing
  | 'same-as-yours'    // identical to the owner's own — skipped
  | 'refused';         // never written: a tool that would stand in for one of Ronin's

export interface PlanItem {
  kind: 'file' | 'entry';
  store: BundleStore | BundleCatalog;
  path: string;
  verdict: Verdict;
  executable: boolean;
  why: string;
}

const same = (a: string, b: string): boolean => normalize(a) === normalize(b);
const normalize = (s: string): string => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim();

async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw e;
  }
}

async function planFile(f: BundleFile): Promise<PlanItem> {
  const item: PlanItem = { kind: 'file', store: f.store, path: f.path, verdict: 'new', executable: !!f.executable, why: '' };
  const [stock, own] = await Promise.all([readOrNull(stockPathFor(f)), readOrNull(userPathFor(f))]);
  if (f.store === 'tools' && stock !== null) {
    return { ...item, verdict: 'refused', why: `${f.path} is one of Ronin's own tools; a bundle may add a command, never take one.` };
  }
  if (own !== null) return { ...item, verdict: same(own, f.text) ? 'same-as-yours' : 'replaces-yours' };
  if (stock !== null) return { ...item, verdict: same(stock, f.text) ? 'same-as-shipped' : 'shadows-shipped' };
  return item;
}

function findEntry(raw: string, catalog: BundleCatalog, name: string): { text: string; start: number; end: number } | null {
  if (catalog === 'TOOLS.md') {
    const re = new RegExp(`^\\|\\s*\`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\`\\s*\\|.*$`, 'm');
    const m = re.exec(raw);
    return m ? { text: m[0], start: m.index, end: m.index + m[0].length } : null;
  }
  const footer = raw.search(/^---\s*$/m);
  const body = footer === -1 ? raw : raw.slice(0, footer);
  const re = new RegExp(`^##\\s+\`?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\`?(?:\\s.*)?$`, 'm');
  const m = re.exec(body);
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^##\s/m);
  const end = m.index + m[0].length + (next === -1 ? rest.length : next);
  return { text: body.slice(m.index, end), start: m.index, end };
}

async function planEntry(e: BundleEntry): Promise<PlanItem> {
  const item: PlanItem = { kind: 'entry', store: e.catalog, path: e.name, verdict: 'new', executable: false, why: '' };
  const [stock, own] = await Promise.all([
    readOrNull(path.join(STOCK_DIR, e.catalog)),
    readOrNull(path.join(storeDir('catalogs'), e.catalog)),
  ]);
  if (e.catalog === 'TOOLS.md' && stock && findEntry(stock, e.catalog, e.name)) {
    return { ...item, verdict: 'refused', why: `${e.name} is one of Ronin's own tools; a bundle may add a command, never take one.` };
  }
  const mine = own ? findEntry(own, e.catalog, e.name) : null;
  if (mine) return { ...item, verdict: same(mine.text, e.text) ? 'same-as-yours' : 'replaces-yours' };
  const theirs = stock ? findEntry(stock, e.catalog, e.name) : null;
  if (theirs) return { ...item, verdict: same(theirs.text, e.text) ? 'same-as-shipped' : 'shadows-shipped' };
  return item;
}

export async function planInstall(bundle: Bundle): Promise<PlanItem[]> {
  return [
    ...(await Promise.all(bundle.files.map(planFile))),
    ...(await Promise.all(bundle.entries.map(planEntry))),
  ];
}

export interface InstallReceipt {
  name: string;
  version: string;
  written: PlanItem[];
  skipped: PlanItem[];
  refused: PlanItem[];
}

const writes = (v: Verdict, replace: boolean): boolean => v === 'new' || v === 'shadows-shipped' || (v === 'replaces-yours' && replace);

async function writeWhole(target: string, text: string, executable: boolean): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, text, 'utf8');
  if (executable) await chmod(tmp, 0o755);
  await rename(tmp, target);
}

const TOOLS_HEAD = '| Tool | Implements (action) | Usage |\n|---|---|---|';

function mergeEntry(raw: string, e: BundleEntry): string {
  const have = findEntry(raw, e.catalog, e.name);
  if (have) return raw.slice(0, have.start) + e.text.trimEnd() + (e.catalog === 'TOOLS.md' ? '' : '\n\n') + raw.slice(have.end).replace(/^\n+/, e.catalog === 'TOOLS.md' ? '\n' : '');
  if (e.catalog === 'TOOLS.md') {
    const trimmed = raw.trimEnd();
    const hasTable = /^\|\s*Tool\s*\|/m.test(trimmed);
    return `${trimmed}\n\n${hasTable ? '' : `${TOOLS_HEAD}\n`}${e.text.trim()}\n`.replace(/\n\n\n+/g, '\n\n');
  }
  const footer = raw.search(/^---\s*$/m);
  const block = `${e.text.trimEnd()}\n\n`;
  if (footer === -1) return `${raw.trimEnd()}\n\n${block}`;
  return `${raw.slice(0, footer).trimEnd()}\n\n${block}${raw.slice(footer)}`;
}

export async function installBundle(bundle: Bundle, opts: { replace?: boolean } = {}): Promise<InstallReceipt> {
  const replace = !!opts.replace;
  const plan = await planInstall(bundle);
  const receipt: InstallReceipt = { name: bundle.name, version: bundle.version, written: [], skipped: [], refused: [] };
  const byKey = new Map(plan.map((p) => [`${p.kind}:${p.store}:${p.path}`, p] as const));
  for (const f of bundle.files) {
    const item = byKey.get(`file:${f.store}:${f.path}`)!;
    if (item.verdict === 'refused') { receipt.refused.push(item); continue; }
    if (!writes(item.verdict, replace)) { receipt.skipped.push(item); continue; }
    await writeWhole(userPathFor(f), f.text, !!f.executable);
    receipt.written.push(item);
  }
  const touched = new Map<BundleCatalog, string>();
  for (const e of bundle.entries) {
    const item = byKey.get(`entry:${e.catalog}:${e.name}`)!;
    if (item.verdict === 'refused') { receipt.refused.push(item); continue; }
    if (!writes(item.verdict, replace)) { receipt.skipped.push(item); continue; }
    if (!touched.has(e.catalog)) {
      if (!isShadowable(e.catalog)) throw new Error(`${e.catalog} is not a catalog you can keep your own copy of.`);
      const seeded = await seedUserCatalog(e.catalog);
      touched.set(e.catalog, (await readOrNull(seeded.path)) ?? '');
    }
    touched.set(e.catalog, mergeEntry(touched.get(e.catalog)!, e));
    receipt.written.push(item);
  }
  for (const [catalog, text] of touched) await writeWhole(path.join(storeDir('catalogs'), catalog), text, false);
  return receipt;
}

export interface PackRequest {
  team: string;
  agents?: string[];
  sops?: string[];
  ways?: string[];
  library?: string[];
  macros?: string[];
  actions?: string[];
  tools?: string[];
  version?: string;
}

const today = (): string => new Date().toISOString().slice(0, 10);

export async function packBundle(req: PackRequest): Promise<Bundle> {
  const team = await findDefinition('templates/teams', req.team);
  if (!team) throw new Error(`"${req.team}" is not a team template on this box.`);
  const files = new Map<string, BundleFile>();
  const entries = new Map<string, BundleEntry>();
  const addFile = async (store: BundleStore, rel: string, file: string, executable = false) => {
    const key = `${store}:${rel}`;
    if (files.has(key)) return;
    const text = await readOrNull(file);
    if (text === null) return;
    files.set(key, { store, path: rel, text, ...(executable ? { executable: true } : {}) });
  };
  await addFile('catalogs', `templates/teams/${team.name}.md`, team.file);
  const books = new Set(team.get('behaviours').split(',').map((b) => b.trim()).filter(Boolean));
  const routineNames = new Set(team.get('routines_on').split(',').map((b) => b.trim()).filter(Boolean));
  for (const name of req.agents ?? []) {
    const agent = await findDefinition('templates/agents', name);
    if (!agent) throw new Error(`"${name}" is not an agent template on this box.`);
    await addFile('catalogs', `templates/agents/${agent.name}.md`, agent.file);
    for (const b of agent.get('behaviours').split(',')) if (b.trim()) books.add(b.trim());
    for (const r of agent.get('routines_on').split(',')) if (r.trim()) routineNames.add(r.trim());
  }
  for (const s of req.sops ?? []) books.add(`sops:${s}`);
  for (const w of req.ways ?? []) books.add(`ways:${w}`);
  const macroNames = new Set(req.macros ?? []);
  const actionNames = new Set(req.actions ?? []);
  const toolNames = new Set(req.tools ?? []);
  for (const r of await readDefinitions('routines')) {
    if (!routineNames.has(r.name) || r.origin !== 'user') continue;
    await addFile('catalogs', `routines/${r.name}.md`, r.file);
    for (const s of r.get('sops').split(',')) if (s.trim() && s.trim() !== '—') books.add(`sops:${s.trim()}`);
    for (const m of r.get('macros').split(',')) if (m.trim() && m.trim() !== '—') macroNames.add(m.trim());
    for (const a of r.get('actions').split(',')) if (a.trim() && a.trim() !== '—') actionNames.add(a.trim());
    for (const t of r.get('tools').split(',')) if (t.trim() && t.trim() !== '—') toolNames.add(t.trim());
  }
  const resolved = await resolveBehaviourBooks([...books]);
  for (const b of resolved.delivered) {
    const [shelf, name] = b.book.split(':') as [BundleStore, string];
    if (b.file.startsWith(storeDir(shelf))) await addFile(shelf, `${name}.md`, b.file);
  }
  for (const name of req.library ?? []) await addFile('library', `${name}.md`, path.join(storeDir('library'), `${name}.md`));
  for (const name of toolNames) {
    if (!TOKEN.test(name)) continue;
    await addFile('tools', name, path.join(storeDir('tools'), name), true);
  }
  const takeEntries = async (catalog: BundleCatalog, wanted: Set<string>) => {
    if (!wanted.size) return;
    if (catalog === 'TOOLS.md') {
      const own = await readOrNull(path.join(storeDir('catalogs'), catalog));
      for (const name of wanted) {
        const row = own ? findEntry(own, catalog, name) : null;
        if (row) entries.set(`${catalog}:${name}`, { catalog, name, text: row.text.trim() });
      }
      return;
    }
    for (const s of await readCatalogSections(catalog)) {
      if (s.origin !== 'user' || s.head !== s.name || !wanted.has(s.name)) continue;
      entries.set(`${catalog}:${s.name}`, { catalog, name: s.name, text: `## ${s.head}\n${s.lines.join('\n')}`.trimEnd() });
    }
  };
  await takeEntries('MACROS.md', macroNames);
  await takeEntries('ACTIONS.md', actionNames);
  await takeEntries('TOOLS.md', toolNames);
  return parseBundle({
    format: BUNDLE_FORMAT,
    name: team.name,
    label: team.get('label') || team.name,
    art: team.get('art'),
    blurb: team.get('blurb'),
    kinds: team.get('kinds').split(',').map((k) => k.trim()).filter(Boolean),
    version: req.version || today(),
    files: [...files.values()],
    entries: [...entries.values()],
  });
}

export function libraryCard(bundle: Bundle, text: string, url: string): LibraryCard {
  return {
    name: bundle.name,
    label: bundle.label,
    art: bundle.art,
    blurb: bundle.blurb,
    kinds: bundle.kinds,
    version: bundle.version,
    url,
    sha256: sha256(text),
    bytes: Buffer.byteLength(text, 'utf8'),
    holds: bundleHolds(bundle),
  };
}
