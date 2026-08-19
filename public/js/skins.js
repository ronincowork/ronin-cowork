/* part of the tmux-ronin client — see js/README.md */
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
 * A TOKEN A SKIN NAMES IS CHOSEN FOR BOTH SHELLS. Light and dark are themes; a skin is a
 * skin. That is why the block is written at all three selectors: name `--radius-md` and the
 * app is that shape in either shell, which is what anyone picking "Square" means. Name a
 * COLOUR and you have decided it for light mode too — legal, occasionally the point, and
 * the flip you are spending. The shipped skins stay off colour for exactly that reason, so
 * they compose with light/dark instead of competing with it.
 *
 * A MISSPELLED TOKEN IS INERT. It sets a custom property no rule reads. A skin cannot break
 * the app, only fail to change it — which is the safety story, and it is structural rather
 * than checked: there is no selector in a skin to get wrong.
 */
import { request } from './request.js';

export const LS_SKIN = 'tmuxgrid.skin';
const STYLE_ID = 'skin';

/** The owner's choice. 'stock' is the no-op skin, and the honest default. */
export const currentSkin = () => localStorage.getItem(LS_SKIN) || 'stock';

/**
 * Paint one skin's tokens, replacing whatever was up. `tokens` empty (the `stock` entry
 * names none) leaves an empty block, which is the correct no-op: the shipped values win
 * because nothing overrides them.
 */
export function applySkin(tokens) {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  const body = Object.entries(tokens || {})
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  // All three selectors: see the note above on why a skin outranks the theme for what it
  // names. `:root` alone would be overridden by `[data-theme]` for every colour role.
  el.textContent = body
    ? `:root, :root[data-theme='light'], :root[data-theme='dark'] {\n${body}\n}`
    : '';
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
export async function restoreSkin() {
  const want = currentSkin();
  if (want === 'stock') return; // nothing to fetch and nothing to paint
  const skin = (await listSkins()).find((s) => s.name === want);
  // A skin that has been deleted or hidden since it was picked: fall back to stock rather
  // than leaving a name pointing at nothing.
  if (!skin) { localStorage.removeItem(LS_SKIN); return; }
  applySkin(skin.tokens);
}

/** Choose one. Persisted per device, like the theme — the same kind of fact. */
export function setSkin(skin) {
  if (!skin || skin.name === 'stock') localStorage.removeItem(LS_SKIN);
  else localStorage.setItem(LS_SKIN, skin.name);
  applySkin(skin?.tokens);
}
