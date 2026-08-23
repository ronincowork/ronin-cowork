import { entryValue, isKeyLine, readCatalogSections, type Origin } from './catalog.js';

export interface MacroParam {
  name: string;
  hint: string;
}

export interface MacroInfo {
  name: string;
  /** Which scope defined this entry — `user` means shadowed or added, never shipped. */
  origin: Origin;
  /**
   * THE AGENT'S INSTRUCTION — the prose under the `## name` heading, and it is addressed to
   * the agent about to run the recipe, never to a person. It opens with the rule that must
   * not be broken (`forkit`: *"Owner-invoked only — never fork on your own initiative"*),
   * names actions and params, and assumes the house vocabulary.
   *
   * Renamed from `description` 2026-08-17 on the owner's ruling — *"we need to split out the
   * description and the agent instruction into two different things because they don't
   * overlap, and the macro should carry both."* The old name is what invited a human surface
   * to render it: `description` sounds like the thing you show somebody who asked what a
   * button does, and tilemacros.js did exactly that as a fallback. **No human surface may
   * render this field**; `label`/`blurb` below are the human half and are required.
   */
  instruction: string;
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
  /**
   * THE HUMAN HEADLINE, in plain words — never the `+name:` spelling.
   *
   * Required on EVERY entry, not just previewed ones (check-catalogs.ts fails a stock entry
   * without it): the next surface is a library people browse to adopt macros from, and copy
   * written for the four previewed today would have to be written again for all thirteen.
   */
  label: string;
  /**
   * THE HUMAN BODY COPY: one or two sentences on what this macro does, for somebody who does
   * not know it exists. Separate writing from `instruction`, on purpose and by the owner's
   * ruling — that one is addressed to the agent and opens with a prohibition, which teaches a
   * person nothing. **Never fall back to `instruction` when this is empty**; see
   * public/js/tilemacros.js for what an entry with no blurb renders instead.
   * Same two keys, same meaning, as a session_role definition's `label:`/`blurb:` buttons.
   */
  blurb: string;
}

/**
 * Parse MACROS.md at request time (no cache — the doc IS the registry), resolved
 * through both scopes by readCatalogSections: the shipped ronin_catalogs/ copy, then
 * the user's own file of the same name in the catalogs store, entry-merged by name
 * (docs/shadowing.md). Each `## name` heading is a macro; its first paragraph of PROSE is
 * the agent's `instruction`; an optional `Params:` paragraph lists its parameters as `name` (hint), … .
 * Everything after the `---` footer rule (the "add macros sparingly" note) is skipped.
 */
export async function listMacros(): Promise<MacroInfo[]> {
  const macros: MacroInfo[] = [];
  for (const s of await readCatalogSections('MACROS.md')) {
    const lines = s.lines;
    let i = 0;
    // Blanks AND the entry's `- **key:** value` lines are skipped before the instruction
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
      instruction: para.join(' '),
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
