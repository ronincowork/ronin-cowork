/* part of the ronin-cowork client — see js/README.md */
/**
 * LEXICON — the words a surface uses, chosen at runtime.
 *
 * `t(key, literal, vars)` is the whole surface: the active lexicon's word for `key`, else the
 * literal the view wrote, with `{name}` placeholders filled from `vars`. That second argument is the floor's floor — it is what makes a
 * missing lexicon paint exactly as stock, and a missing key never blank a label. A view
 * born after 2026-08-27 reads its strings through `t()`; a view older than that keeps
 * its literals until it is touched for another reason (no sweep, by ruling — the
 * check reports the unconverted, it does not fail on them).
 *
 * ONE FLAT OBJECT PER PICK. The server resolves the `base:` chain (`src/lexicons.ts`), so
 * this file never learns that `home_en` falls through to `professional_en`, or that a French
 * Home is one file. It is fetched at boot from the active desk profile and again on a
 * pick, never cached in storage — the same reason skins re-fetch: edit the file, reload,
 * wear the change.
 *
 * TWO KINDS OF KEY, ONE CALL. Surface strings (`campaign`, `go`) and catalog tokens by
 * prefix (`kind.household`, `role.DraftPlan`) — a view listing definitions asks
 * `t('kind.' + token, definition.label)` and gets the same fallback rule.
 *
 * WHAT IS NEVER HERE: anything an agent reads. The letter, the brief and the boot shelf
 * stay in stock tokens; a lexicon changes what a PERSON sees and nothing else.
 */
import { request } from './request.js';

/** The active lexicon: { name, label, words } — null is stock, and ordinary. */
let active = null;

/**
 * A word for the key, or the literal the view wrote. Never undefined, never ''.
 *
 * `vars` fills placeholders: `t('roster.running_no_limit', '{n} running · no limit', { n })`. A string with a
 * value in it stays ONE key with a `{name}` in it — word order differs between languages,
 * so two translated halves are never concatenated. A placeholder `vars` does not name is
 * left as written, so a lexicon's typo is visible rather than silently blanked.
 */
export function t(key, literal = '', vars) {
  const w = active?.words?.[key];
  const s = w != null && w !== '' ? w : (literal || key);
  return vars ? s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : s;
}

/**
 * Put one lexicon up by name. '' or an unknown name clears to stock — a lexicon that has
 * been removed since it was picked must not leave a name pointing at nothing.
 */
export async function loadLexicon(name) {
  const want = String(name || '').trim();
  let next = null;
  if (want) {
    const r = await request(`/api/lexicons/${encodeURIComponent(want)}`);
    if (r.ok && r.data && r.data.words) next = { name: r.data.name, label: r.data.label, words: r.data.words };
  }
  active = next;
  return active;
}
