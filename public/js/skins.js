/* part of the ronin-cowork client — see js/README.md */
/**
 * SKINS — the look, chosen at runtime, spelled as design tokens.
 *
 * A skin is a set of `--token: value` pairs from `ronin_catalogs/SKINS.md` (shadowable:
 * shipped skins update with the repo, a skin of yours is yours and an upgrade cannot touch
 * it — `docs/shadowing.md`). Applying one sets those custom properties and nothing else.
 *
 * THE WHOLE FEATURE IS THIRTY LINES BECAUSE THE FOUNDATION WAS MADE FIRST. Every value that
 * carries look became a token on 2026-08-19 — shape, space, type, voice, edge, motion —
 * and `check-css` keeps it that way. Before that, a skin could have changed colour and
 * nothing else; the rest of the look was spelled in five hundred places. This file is the
 * dividend, not the work.
 *
 * WHY A <style> BLOCK AND NOT INLINE PROPERTIES. Inline styles on `<html>` beat every
 * stylesheet rule, including `:root[data-theme='light']` — so a skin set inline would
 * silently kill the light shell for any colour token it named, whether it meant to or not.
 * A stylesheet block plays by the ordinary rules instead, which is what lets the decision
 * below be a decision rather than an accident.
 *
 * LIGHT AND DARK ARE AN AXIS INSIDE A SKIN, not a thing a skin fights (2026-08-19). Three
 * spellings in the catalog and three rules out of them:
 *
 *   --radius-md      both shells   — shape, space, type and motion want this
 *   dark--bg         the dark one
 *   light--bg        the light one
 *
 * Until today there was only the first, so naming a colour overrode it in light mode too
 * and the flip quietly stopped working for that token. Harmless for the shipped skins,
 * which are shape and spacing; useless for a skin that is actually about colour. A skin can
 * now have a dark face and a light face, which is what lets the theme keep being the theme.
 *
 * EXACTLY ONE SHELL RULE EVER MATCHES, because `applyTheme` always resolves the choice to
 * an explicit `data-theme` — even 'auto' writes the attribute it resolved to. So there is
 * no third state to design for and no `prefers-color-scheme` query needed here.
 *
 * A MISSPELLED TOKEN IS INERT. It sets a custom property no rule reads. A skin cannot break
 * the app, only fail to change it — which is the safety story, and it is structural rather
 * than checked: there is no selector in a skin to get wrong.
 */
import { request } from './request.js';
import { applyTheme } from './theme.js';

export const LS_SKIN = 'tmuxgrid.skin';
const STYLE_ID = 'skin';

/** The owner's choice. 'stock' is the no-op skin, and the honest default. */
export const currentSkin = () => localStorage.getItem(LS_SKIN) || 'stock';

/**
 * Paint one skin's tokens, replacing whatever was up. `tokens` empty (the `stock` entry
 * names none) leaves an empty block, which is the correct no-op: the shipped values win
 * because nothing overrides them.
 */
export function applySkin(skin) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  const body = (map) => Object.entries(map || {}).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  const rule = (sel, map) => (body(map) ? `${sel} {\n${body(map)}\n}` : '');
  // THE SKIN OUTRANKS THE STYLESHEET BY CONSTRUCTION, not by luck: style.css lives in
  // `@layer foundations`, and an UNLAYERED rule beats every layer whatever its specificity.
  // So this block wins without having to out-specify `:root[data-theme='light']`.
  // Shell-specific rules come last so they win over the both-shells rule, which they tie
  // with on specificity.
  el.textContent = [
    rule(":root[data-theme='dark'], :root[data-theme='light']", skin?.tokens),
    rule(":root[data-theme='dark']", skin?.dark),
    rule(":root[data-theme='light']", skin?.light),
  ].filter(Boolean).join('\n');
}

/** Every skin this install has, shipped and yours. `[]` when the service cannot answer. */
export async function listSkins() {
  const r = await request('/api/skins');
  return r.ok && Array.isArray(r.data) ? r.data : [];
}

/**
 * Put the saved skin up. Called once at boot, and after a pick.
 *
 * IT RE-FETCHES RATHER THAN CACHING THE TOKENS IN localStorage, which is the half that
 * makes the owner's update rule true: edit `SKINS.md` — yours or ours — and a reload wears
 * the change. Caching the values would freeze a skin at the moment it was picked, so a
 * shipped skin would stop tracking upgrades and a hand-edit to your own file would appear
 * to do nothing. The cost is one request at boot; the alternative is a stale look nobody
 * can explain.
 */
export async function restoreSkin(profileSkin = '') {
  // THE DESK PROFILE'S SKIN IS THE DEFAULT (R38), the device's own pick the override:
  // a device that never picked wears the profile's; a device that picked in ⚙ keeps its
  // pick until the profile changes (setDeskProfile clears the device pick, below).
  const want = localStorage.getItem(LS_SKIN) || profileSkin || 'stock';
  if (want === 'stock') return; // nothing to fetch and nothing to paint
  const skin = (await listSkins()).find((s) => s.name === want);
  // A skin that has been deleted or hidden since it was picked: fall back to stock rather
  // than leaving a name pointing at nothing.
  if (!skin) { localStorage.removeItem(LS_SKIN); return; }
  applySkin(skin);
  applyTheme();
}

/** Wear the profile's skin now and forget the device's own pick — a profile change is
 *  a whole-desk decision. `''`/`stock` clears to the shipped look. */
export async function followProfileSkin(name) {
  localStorage.removeItem(LS_SKIN);
  const skin = name && name !== 'stock' ? (await listSkins()).find((s) => s.name === name) : null;
  applySkin(skin || { tokens: {}, light: {}, dark: {} });
  applyTheme();
}

/** Choose one. Persisted per device, like the theme — the same kind of fact. */
export function setSkin(skin) {
  if (!skin || skin.name === 'stock') localStorage.removeItem(LS_SKIN);
  else localStorage.setItem(LS_SKIN, skin.name);
  applySkin(skin);
  /* THE TERMINALS HAVE TO BE TOLD. Every other surface is plain CSS and follows a token the
   * moment it changes; a live xterm holds its palette as a JS object and only re-reads on
   * `applyTheme`. Without this, a skin naming a --term-* colour would land everywhere
   * except the one pane the owner is actually looking at, and would then appear to work
   * after the next unrelated light/dark flip — the kind of half-applied that reads as a
   * ghost. Cheap and idempotent: applyTheme re-resolves and re-pushes. */
  applyTheme();
}
