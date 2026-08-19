import { entryValue, isKeyLine, readCatalogSections, type Origin } from './catalog.js';

/**
 * SKINS — the look as a shadowable catalog (`ronin_catalogs/SKINS.md`).
 *
 * WHY THIS IS FIFTY LINES AND NOT FIVE HUNDRED. A skin is a set of design token values and
 * nothing else, which is only a coherent idea because the whole look became tokens on
 * 2026-08-19: shape, space, type, voice, edge and motion, gated by `scripts/check-css.mjs`
 * so nothing carrying look is spelled anywhere else. Before that a skin could have changed
 * colour and nothing more. The feature is small because the foundation was made first.
 *
 * IT INHERITS THE STOCK/USER LAW RATHER THAN INVENTING ONE. `readCatalogSections` already
 * gives the merge the owner asked for — shipped entries replaced wholesale by an upgrade,
 * the user's own copy outside every repo where an upgrade cannot touch it, entry-merge by
 * name, `origin` on every entry so a surface can say which is which (`docs/shadowing.md`).
 * There is no skin-specific persistence, no skin-specific update rule and no second place
 * to look, because a skin is a catalog entry and catalogs already answer all of that.
 *
 * THERE IS NO SELECTOR IN A SKIN, and that is the safety story. A skin answers questions
 * `@layer foundations` already asks; it cannot add a rule, move a control, or style one
 * surface differently from another. The worst a bad skin does is look bad, and the worst a
 * misspelled token does is nothing at all — `applySkin` in the client sets custom
 * properties, and a property no rule reads is inert.
 */
export interface SkinInfo {
  name: string;
  label: string;
  blurb: string;
  origin: Origin;
  shadowed: boolean;
  /** `--token` → value, applied in BOTH shells. */
  tokens: Record<string, string>;
  /** `light--token` → value. Applied only under the light shell. */
  light: Record<string, string>;
  /** `dark--token` → value. Applied only under the dark shell. */
  dark: Record<string, string>;
}

/**
 * A skin's own field lines, as against `label`/`blurb`. Three spellings, and the prefix is
 * WHICH SHELL:
 *
 *   - **--radius-md:** 0       both shells — shape, space, type, motion want this
 *   - **dark--bg:** #05070a    the dark shell only
 *   - **light--bg:** #fffdf8   the light shell only
 *
 * THE PREFIXED PAIR EXISTS BECAUSE A COLOUR SKIN OTHERWISE SPENDS THE FLIP (2026-08-19).
 * Until today a skin had one place to put a value, so naming `--bg` overrode it in light
 * mode too and the theme quietly stopped working for that token. Fine for the shipped
 * skins, which are all shape and spacing; useless for a skin that is actually about
 * colour. Now light and dark are an axis INSIDE a skin rather than a thing a skin fights.
 *
 * No colon in the prefix: the catalog's `- **key:** value` grammar keys on `[\w-]+`, and a
 * second colon would end the key early. `light--bg` is one word to that reader and reads
 * as what it is.
 */
// `dark--bg` is `dark` + `--bg`, NOT `dark-` + `-bg` — the prefix must not eat one of the
// token's own dashes, or the group after it never sees the `--` it requires and the whole
// line is silently skipped. It did exactly that for one run on 2026-08-19: `paper` parsed
// to zero tokens and the skin appeared to do nothing at all.
const TOKEN_LINE = /^-\s*\*\*(light|dark)?(--[\w-]+):\*\*\s*(.+?)\s*$/;

export async function listSkins(): Promise<SkinInfo[]> {
  // stockOptional: a build that ships no SKINS.md is a build with no skins, not a fault.
  const sections = await readCatalogSections('SKINS.md', true);
  const out: SkinInfo[] = [];
  for (const s of sections) {
    if (entryValue(s.lines, 'hidden').toLowerCase() === 'yes') continue;
    const tokens: Record<string, string> = {};
    const light: Record<string, string> = {};
    const dark: Record<string, string> = {};
    for (const line of s.lines) {
      if (!isKeyLine(line)) continue;
      const m = TOKEN_LINE.exec(line.trim());
      if (!m) continue;
      (m[1] === 'light' ? light : m[1] === 'dark' ? dark : tokens)[m[2]] = m[3];
    }
    out.push({
      name: s.name,
      label: entryValue(s.lines, 'label') || s.name,
      blurb: entryValue(s.lines, 'blurb'),
      origin: s.origin,
      shadowed: s.shadowed,
      tokens,
      light,
      dark,
    });
  }
  return out;
}
