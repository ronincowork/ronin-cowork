/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { applyTheme } from './theme.js';

const LS_SKIN = 'tmuxgrid.skin';
const STYLE_ID = 'skin';

// A SKIN OF YOURS MAY NAME A TOKEN WE RENAMED (store-move rule): read the old name as the
// new one(s), and let a new name win where a skin spells both. A runtime header name a skin
// used to set painted every scope, so it still names all three. DARK_ONLY names were read
// only by the dark shell, so they keep painting there and nowhere else.
const heads = (part) => ['admin', 'teams', 'team'].map((scope) => `--head-${scope}-${part}`);
const RENAMED = {
  '--muted-3': ['--muted'],
  '--kanban-green': ['--ok-2'],
  '--kanban-red': ['--status-red'],
  '--setup-mark': ['--kaki-fill'],
  '--gc-cta-bg': ['--kaki-fill'],
  '--gc-cta-ink': ['--kaki-fill-ink'],
  '--gc-cta-bg-hover': ['--kaki-fill-hover'],
  '--scope-graphite': ['--graphite'],
  '--scope-campaign-head-bg': ['--head-admin-bg'],
  '--scope-teams-head-bg': ['--head-teams-bg'],
  '--scope-head-fg': ['--head-admin-fg', '--head-teams-fg'],
  '--scope-head-muted': ['--head-admin-muted', '--head-teams-muted'],
  '--team-workbench-head-bg': ['--head-team-bg'],
  '--team-workbench-head-fg': ['--head-team-fg'],
  '--team-workbench-head-muted': ['--head-team-muted'],
  '--team-workbench-head-line': ['--head-team-line'],
  '--cowork-head-bg': heads('bg'),
  '--cowork-head-fg': heads('fg'),
  '--cowork-head-muted': heads('muted'),
  '--cowork-head-line': heads('line'),
  '--cowork-surface-head-edge': heads('edge'),
  '--cowork-head-attention': ['--head-attention'],
  // cut 10: the rulers became roles. An old rung paints the roles it mostly served.
  '--muted-2': ['--muted'],
  '--dim': ['--muted'],
  '--text-1': ['--text-small'], '--text-micro': ['--text-small'], '--text-2': ['--text-small'],
  '--text-3': ['--text-body'], '--text-4': ['--text-body', '--term-size'], '--text-5': ['--text-label'],
  '--text-6': ['--text-heading'], '--text-7': ['--text-heading'], '--text-8': ['--text-heading'],
  '--text-9': ['--text-display'], '--text-10': ['--text-display'],
  '--space-1': ['--space-row'], '--space-2': ['--space-row'],
  '--space-3': ['--space-inline'], '--space-4': ['--space-inline', '--space-paragraph'], '--space-5': ['--space-control'],
  '--space-6': ['--space-inset'], '--space-7': ['--space-inset'], '--space-8': ['--space-subsection'],
  '--space-9': ['--space-section'], '--space-10': ['--space-section'], '--space-11': ['--space-section'], '--space-12': ['--space-section'],
  '--radius-xs': ['--radius-small'], '--radius-sm': ['--radius-small'],
  '--radius-md': ['--radius-large'], '--radius-lg': ['--radius-large'], '--radius-xl': ['--radius-large'],
  '--weight-medium': ['--weight-strong'],
  '--leading-loose': ['--leading-body'],
  // cut 13: two neutral surfaces. --panel was the base and --well the inside; --bg, --bg-2 and
  // --raise were shades with no purpose left, so a skin's --panel/--well carry its look over.
  '--panel': ['--surface'], '--well': ['--inset'],
  '--bg': [], '--bg-2': [], '--raise': [],
  '--term-panel': [], '--term-well': [], '--term-tape-bg': [], '--term-jump-bg': [], '--term-jump-bg-2': [],
  '--accent-soft': [],
};
const DARK_ONLY = {
  '--kiiro': '--head-attention',
  '--kaki-hint': '--head-team-bg',
};

function currentNames(skin) {
  const out = { tokens: {}, dark: {}, light: {} };
  const spelled = (shell, name) => name in (skin?.[shell] || {});
  for (const shell of ['tokens', 'dark', 'light']) {
    for (const [k, v] of Object.entries(skin?.[shell] || {})) {
      if (DARK_ONLY[k]) {
        if (shell !== 'light' && !spelled('dark', DARK_ONLY[k])) out.dark[DARK_ONLY[k]] = v;
        continue;
      }
      for (const name of RENAMED[k] || [k]) {
        if (name === k || !spelled(shell, name)) out[shell][name] = v;
      }
    }
  }
  return out;
}

/**
 * Paint one skin's tokens, replacing whatever was up. `tokens` empty (the `stock` entry
 * names none) leaves an empty block, which is the correct no-op: the shipped values win
 * because nothing overrides them.
 */
function applySkin(found) {
  const skin = currentNames(found);
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  const body = (map) => Object.entries(map || {}).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  const rule = (sel, map) => (body(map) ? `${sel} {\n${body(map)}\n}` : '');
  // THE SKIN OUTRANKS THE STYLESHEET BY CONSTRUCTION, not by luck: style.css lives in
  // `@layer base`, and an UNLAYERED rule beats every layer whatever its specificity.
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
