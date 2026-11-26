/* part of the ronin-cowork client — see js/README.md */
/**
 * THE RULED GLYPHS — one face per ruled word, product-wide. A square stone in ask() carries a
 * glyph and a word; the same word wears the same glyph on New Team and Team Configuration,
 * because it is read from here and nowhere else. The mandate menus are files (mandates.js)
 * and draw as rectangles.
 * Change a glyph in this table and every form follows. `glyph(axis, value)` returns '' for a
 * word this table does not know, and a caller then draws that list as rectangles.
 */
import { t } from './lexicon.js';

export const GLYPHS = Object.freeze({
  kind: { open: '○', business: '💼', personal: '🎩', household: '🏠', social: '🎪', school: '🎓' },
});

/** THE KINDS (owner, 25 Nov): what a project is, whether it is code or crayons; an Agent's, a Team's
 * and a Workspace's, one list. No coding: everything is some code. Each reads as its `kind.<value>` word. */
export const KINDS = Object.freeze(['open', 'business', 'personal', 'household', 'social', 'school']);
const KIND_WORDS = { open: 'Open', business: 'Business', personal: 'Personal', household: 'Household', social: 'Social', school: 'School' };
export const kindWord = (value) => t(`kind.${value}`, KIND_WORDS[value] || value);

export const glyph = (axis, value) => GLYPHS[axis]?.[value] || '';

/** Rows for a ruled axis: `{ v, l, glyph }`, worded by the caller's `word(value)`. */
export const ruledRows = (axis, values, word = (value) => value) => values.map((value) => ({ v: value, l: word(value), glyph: glyph(axis, value) }));
