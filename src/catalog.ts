/**
 * THE CATALOG — the Markdown foundations: facts, behaviours and tools (docs/architecture/brief.md,
 * The files and their header; ronin_stock/stock_readme.md).
 *
 * One flat folder per kind in `ronin_stock/` (`facts/`, `behaviours/`, `tools/`): the
 * stock-foundations. The person's custom-foundations (`~/ronin/custom/<kind>/`) add files and
 * replace stock ones by name. A file's name (without `.md`) is its id: the one `when:`,
 * `serves:` and the brief settings name. Every file starts the same:
 *
 *   # Title
 *   - **seed:** the one line            (behaviours, tools)
 *   - **line:** User: {user.name}{, user.role}   (facts)
 *   - **when:** cowork, !mika           (all; blank = every Agent)
 *   - **depth:** none | seed | full     (blank = seed; a fact's blank = full; a fact at seed is its line only)
 *   - **serves:** write-it-down         (tools; blank = Other tools)
 *   - **mandate:** reach                (behaviours: a mandate value; the title is the value)
 *   - **with:** planning                (mandate values: the behaviours choosing it puts in play)
 *   - **lists:** workspace_types        (behaviours: a catalog directory `ronin-help` prints after it)
 *   - **facts:** site                   (bridges: the facts its Workspace entry holds, set on the Workspace page)
 *   - **order:** 40
 *
 *   <the full text>
 *
 * An unknown key is ignored. Nothing here decides who is told what: that is docs/architecture/brief.md, Conditionals; The work record is the source of truth; Layers and brief settings.
 */
import path from 'node:path';
import { STOCK_DIR, entryValue, isKeyLine, resolveFiles, storeDir, type Origin } from './resources.js';

export type CatalogKind = 'facts' | 'behaviours' | 'tools';
export type Depth = 'none' | 'seed' | 'full';
export const CATALOG_KINDS: readonly CatalogKind[] = ['facts', 'behaviours', 'tools'];
export const DEPTHS: readonly Depth[] = ['none', 'seed', 'full'];

export interface CatalogFile {
  kind: CatalogKind;
  name: string;
  title: string;
  seed: string;
  line: string;
  when: string[];
  depth: Depth;
  serves: string[];
  /** The mandate axis this behaviour is a value of (docs/architecture/brief.md, Mandates): reach, recruit, output; '' if none. */
  mandate: string;
  /** Its value on that axis: the title, lower-cased ('Propose agents' → 'propose agents'). */
  value: string;
  /** A bridge's integration: the `<name>` of its `when: integration:<name>`; '' if none. */
  integration: string;
  /** A mandate value's `with:`: the behaviours choosing it puts in play, at their depth. */
  with: string[];
  /** A bridge's `facts:`: the fact names its Workspace entry takes ({provider, site}); [] for any other file. */
  facts: string[];
  order: number;
  /** The full text: everything after the header. */
  body: string;
  file: string;
  origin: Origin;
  shadowed: boolean;
}

/** The user's folder for a kind. Tool files sit beside the user's own tool executables. */
export const userCatalogDir = (kind: CatalogKind): string => storeDir(kind);

const list = (value: string): string[] => value.split(',').map((part) => part.trim()).filter(Boolean);

/** The header and the full text of one catalog file. */
export function parseCatalogFile(kind: CatalogKind, name: string, text: string): Omit<CatalogFile, 'file' | 'origin' | 'shadowed'> {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let at = 0;
  while (at < lines.length && !lines[at].trim()) at++;
  const title = /^#\s+(.+?)\s*$/.exec(lines[at] ?? '')?.[1] ?? name;
  if (/^#\s/.test(lines[at] ?? '')) at++;
  while (at < lines.length && !lines[at].trim()) at++;
  const header: string[] = [];
  while (at < lines.length && isKeyLine(lines[at])) header.push(lines[at++]);
  const get = (key: string): string => entryValue(header, key);
  const depth = get('depth').toLowerCase();
  const order = Number(get('order'));
  const axis = kind === 'behaviours' ? get('mandate').toLowerCase() : '';
  const integration = kind === 'behaviours'
    ? list(get('when')).find((word) => word.startsWith('integration:'))?.slice('integration:'.length) ?? ''
    : '';
  return {
    kind,
    name,
    title,
    seed: get('seed'),
    line: get('line'),
    when: list(get('when')),
    depth: (DEPTHS as readonly string[]).includes(depth) ? depth as Depth : kind === 'facts' ? 'full' : 'seed',
    serves: kind === 'tools' ? list(get('serves')) : [],
    mandate: axis,
    value: axis ? title.toLowerCase() : '',
    with: axis ? list(get('with')) : [],
    integration,
    facts: integration ? list(get('facts')).map((word) => word.toLowerCase()) : [],
    order: Number.isFinite(order) && get('order') !== '' ? order : Number.MAX_SAFE_INTEGER,
    body: lines.slice(at).join('\n').trim(),
  };
}

const isCatalogFile = (relative: string): boolean =>
  relative.endsWith('.md') && !relative.startsWith('.') && !/readme\.md$/i.test(relative); // <kind>_readme.md says the format

/** One kind, stock and user merged by name, in `order:` then title order. */
export async function readCatalog(kind: CatalogKind): Promise<CatalogFile[]> {
  const files = await resolveFiles({
    stock: path.join(STOCK_DIR, kind),
    user: userCatalogDir(kind),
    include: isCatalogFile,
    symlinks: true,
  });
  return files
    .map((file) => ({ ...parseCatalogFile(kind, file.name, file.text), file: file.path, origin: file.origin, shadowed: file.shadowed }))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export interface Catalog { facts: CatalogFile[]; behaviours: CatalogFile[]; tools: CatalogFile[] }

/** THE INTEGRATIONS LISTING (docs/architecture/brief.md, What comes next): the bridges, the
 * behaviours whose `when:` is `integration:<name>`. Adding a bridge file adds an integration;
 * the brief keeps no other list of names. In `order:`; one row per name (its first bridge). */
export function catalogIntegrations(catalog: Pick<Catalog, 'behaviours'>): Array<{ name: string; behaviour: string; title: string; seed: string; facts: string[] }> {
  const rows = new Map<string, { name: string; behaviour: string; title: string; seed: string; facts: string[] }>();
  for (const file of catalog.behaviours) {
    if (file.integration && !rows.has(file.integration)) rows.set(file.integration, { name: file.integration, behaviour: file.name, title: file.title, seed: file.seed, facts: file.facts });
  }
  return [...rows.values()];
}

export async function readCatalogs(): Promise<Catalog> {
  const [facts, behaviours, tools] = await Promise.all(CATALOG_KINDS.map(readCatalog));
  return { facts, behaviours, tools };
}
