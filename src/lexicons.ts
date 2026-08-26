/**
 * LEXICONS — the words a surface uses, as a shadowable catalog (`ronin_catalogs/lexicons/`).
 *
 * A lexicon is keys to strings and a `base:` to fall through to. Mechanically it is a
 * language: a wording (Home says *occasion*) and a translation (French) are the same
 * kind of file (KOTOBA `lexicon`, 2026-08-27). This module reads the directory through
 * the one definitions reader — stock ⊕ yours, whole-file by name — and RESOLVES a lexicon
 * flat: the file's own words over its base's, the base's over its base's, to the floor.
 *
 * WHY RESOLVE ON THE SERVER. The client reads one flat object per pick and never learns
 * the chain, so a French Home (`home_fr`, base `fr`) costs it nothing; and the
 * cycle guard lives in one place. `label`, `blurb`, `base`, `order`, `hidden` are fields,
 * not words, and never reach the flat map.
 *
 * THE FLOOR IS NOT SPECIAL HERE. `professional` is a file like any other; what makes it
 * the floor is `scripts/check-lexicon.mjs`, which holds it complete against every `t()`
 * the client reads. A key no lexicon carries falls through to the VIEW's own literal —
 * that is the client's half (`public/js/lexicon.js`), and it is why a missing lexicon
 * paints exactly as stock.
 */
import { entryPairs, type Origin } from './catalog.js';
import { findDefinition, readDefinitions, type Definition } from './definitions.js';
import { readFile } from 'node:fs/promises';

const FIELDS = new Set(['label', 'blurb', 'base', 'order', 'hidden']);

export interface LexiconInfo {
  name: string;
  label: string;
  blurb: string;
  base: string;
  origin: Origin;
  shadowed: boolean;
}

export interface ResolvedLexicon extends LexiconInfo {
  /** The chain that produced `words`, this lexicon first, the floor last. */
  chain: string[];
  /** key → string, flat, after the chain. */
  words: Record<string, string>;
}

const info = (d: Definition): LexiconInfo => ({
  name: d.name,
  label: d.get('label') || d.name,
  blurb: d.get('blurb'),
  base: d.get('base'),
  origin: d.origin,
  shadowed: d.shadowed,
});

export async function listLexicons(): Promise<LexiconInfo[]> {
  return (await readDefinitions('lexicons')).map(info);
}

/** A definition's word lines only — every `- **key:** value` that is not a field. */
async function wordsOf(d: Definition): Promise<Record<string, string>> {
  const lines = (await readFile(d.file, 'utf8')).split('\n');
  const out: Record<string, string> = {};
  for (const [k, v] of entryPairs(lines)) if (!FIELDS.has(k) && v) out[k] = v;
  return out;
}

/**
 * One lexicon, flat. Unknown name → undefined; the route words the refusal. A base that
 * names nothing simply ends the chain (named on `chain` as far as it went), and a cycle
 * ends it too — a lexicon cannot be its own floor.
 */
export async function resolveLexicon(name: string): Promise<ResolvedLexicon | undefined> {
  const head = await findDefinition('lexicons', name);
  if (!head) return undefined;
  const chain: string[] = [];
  const layers: Record<string, string>[] = [];
  let cur: Definition | undefined = head;
  while (cur && !chain.includes(cur.name) && chain.length < 16) {
    chain.push(cur.name);
    layers.push(await wordsOf(cur));
    const base = cur.get('base').trim();
    cur = base ? await findDefinition('lexicons', base) : undefined;
  }
  // The floor is applied first and each nearer layer over it, so the head wins.
  const words: Record<string, string> = {};
  for (const layer of layers.reverse()) Object.assign(words, layer);
  return { ...info(head), chain, words };
}
