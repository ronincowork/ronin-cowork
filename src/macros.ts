import { readCatalogSections, type Origin } from './catalog.js';

export interface MacroParam {
  name: string;
  hint: string;
}

export interface MacroInfo {
  name: string;
  /** Which scope defined this entry — `user` means shadowed or added, never shipped. */
  origin: Origin;
  description: string;
  params: MacroParam[];
  /**
   * A macro Ronin TYPES FOR YOU. Present = the tile's ⚡ menu sends this line to the
   * session (with Enter) instead of prefilling `+name: ` for you to finish. Absent —
   * which is every other macro — means prefill, the default and the safe one.
   * The text lives in the catalog, never in the client: one source, like every blurb.
   */
  send?: string;
}

/**
 * Parse MACROS.md at request time (no cache — the doc IS the registry), resolved
 * through both scopes by readCatalogSections: the shipped tejun_catalogs/ copy, then
 * the user's own file of the same name in the catalogs store, entry-merged by name
 * (docs/shadowing.md). Each `## name` heading is a macro; its first paragraph is the
 * description; an optional `Params:` paragraph lists its parameters as `name` (hint), … .
 * Everything after the `---` footer rule (the "add macros sparingly" note) is skipped.
 */
export async function listMacros(): Promise<MacroInfo[]> {
  const macros: MacroInfo[] = [];
  for (const s of await readCatalogSections('MACROS.md')) {
    const lines = s.lines;
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    const para: string[] = [];
    while (i < lines.length && lines[i].trim()) para.push(lines[i++].trim());
    const send = parseSend(lines);
    macros.push({
      name: s.name,
      origin: s.origin,
      description: para.join(' '),
      params: parseParams(lines),
      ...(send ? { send } : {}),
    });
  }
  return macros;
}

/**
 * Extract the `Send:` paragraph — the line Ronin types into the session for macros
 * that fire rather than prefill. One line: it is typed at a prompt, so an embedded
 * newline would submit half of it.
 */
function parseSend(lines: string[]): string {
  const start = lines.findIndex((l) => /^Send:/i.test(l.trim()));
  if (start < 0) return '';
  const buf: string[] = [];
  let i = start;
  while (i < lines.length && lines[i].trim()) buf.push(lines[i++].trim());
  return buf.join(' ').replace(/^Send:\s*/i, '');
}

/** Extract the `Params:` paragraph (may wrap lines) into [{name, hint}]. */
function parseParams(lines: string[]): MacroParam[] {
  const start = lines.findIndex((l) => /^Params:/i.test(l.trim()));
  if (start < 0) return [];
  const buf: string[] = [];
  let i = start;
  while (i < lines.length && lines[i].trim()) buf.push(lines[i++].trim());
  const blob = buf.join(' ').replace(/^Params:\s*/i, '');
  const params: MacroParam[] = [];
  for (const m of blob.matchAll(/`(\w+)`\s*(?:\(([^)]*)\))?/g)) {
    params.push({ name: m[1], hint: (m[2] ?? '').trim() });
  }
  return params;
}
