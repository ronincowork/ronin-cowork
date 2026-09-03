/* part of the ronin-cowork client — see js/README.md */
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
    // A bare fetch, not request.js: request.js reads t() for its own two messages, and a
    // module the whole client imports cannot also import the client. Nothing is lost —
    // an unreachable or unknown lexicon is stock, which is the ordinary state.
    try {
      const res = await fetch(`/api/lexicons/${encodeURIComponent(want)}`, { cache: 'no-store' });
      const d = res.ok ? await res.json() : null;
      if (d && d.words) next = { name: d.name, label: d.label, words: d.words };
    } catch {
      next = null;
    }
  }
  active = next;
  return active;
}
