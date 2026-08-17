import { entryValue, isKeyLine, readCatalogSections, type Origin } from './catalog.js';

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
  /**
   * Does this macro appear on the tile's ⚡ drop? `- **preview:** yes` in the entry.
   *
   * DISPLAY ONLY, and opt-in (owner, 2026-08-17: *"I don't want to delete macros. I don't
   * want them to show up on this macro page anymore"*). Every macro runs whether or not it
   * is previewed — typed by hand, bound to a keypad key, compiled by `ronin_bin/tejun` —
   * so this hides nothing from an agent and deletes nothing. Opt-in rather than opt-out
   * because the drop is a teaching surface that holds about four and this catalog holds a
   * dozen: with opt-out, every macro added later would appear on the button until somebody
   * noticed it there.
   */
  preview: boolean;
  /** The ⚡ drop's headline for this macro, in plain words — never the `+name:` spelling. */
  label: string;
  /**
   * The ⚡ drop's body copy: what this macro does, for a person who does not know it
   * exists. A SEPARATE sentence from `description`, on purpose — the prose under the
   * heading is written for the agent that runs the recipe (it opens with the rule the
   * agent must not break), and that is not what teaches somebody what the button is for.
   * Same two keys, same meaning, as SESSION_JOBS.md's `label:`/`blurb:` kind buttons.
   */
  blurb: string;
}

/**
 * Parse MACROS.md at request time (no cache — the doc IS the registry), resolved
 * through both scopes by readCatalogSections: the shipped ronin_catalogs/ copy, then
 * the user's own file of the same name in the catalogs store, entry-merged by name
 * (docs/shadowing.md). Each `## name` heading is a macro; its first paragraph of PROSE is
 * the description; an optional `Params:` paragraph lists its parameters as `name` (hint), … .
 * Everything after the `---` footer rule (the "add macros sparingly" note) is skipped.
 */
export async function listMacros(): Promise<MacroInfo[]> {
  const macros: MacroInfo[] = [];
  for (const s of await readCatalogSections('MACROS.md')) {
    const lines = s.lines;
    let i = 0;
    // Blanks AND the entry's `- **key:** value` lines are skipped before the description
    // starts. Every entry opens with `- **class:**`, and until 2026-08-17 that line was
    // simply the first line of the "first paragraph", so the client rendered
    // "- class: session_macro.workflow Ask this session to…" as the macro's blurb.
    // A field is not prose; `isKeyLine` is the one place that says which is which.
    while (i < lines.length && (!lines[i].trim() || isKeyLine(lines[i]))) i++;
    const para: string[] = [];
    while (i < lines.length && lines[i].trim()) para.push(lines[i++].trim());
    const send = parseSend(lines);
    macros.push({
      name: s.name,
      origin: s.origin,
      description: para.join(' '),
      params: parseParams(lines),
      preview: /^y/i.test(entryValue(lines, 'preview')),
      label: entryValue(lines, 'label'),
      blurb: entryValue(lines, 'blurb'),
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
