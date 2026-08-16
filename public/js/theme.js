/* part of the tmux-ronin client — see js/README.md */
/**
 * THEME — dark and light, resolved from the stylesheet, spelled once.
 *
 * The palette lives in style.css as semantic tokens on `:root` (dark) and
 * `:root[data-theme='light']`. This module owns the three things CSS cannot:
 *
 *   1. which theme is active. THE DEFAULT IS THE DEVICE'S OWN: flip the Mac between
 *      light and dark and Ronin flips with it, live (the owner's ask, 2026-08-16).
 *      The one control is the flip button in ⚙ System — flipping AWAY from the
 *      device's mode pins the shell; flipping back to match re-arms following.
 *      Persisted per device (localStorage, like the layout: which surface is dark
 *      is a fact about the screen you are holding, not about the install);
 *   2. the xterm theme object — READ from the same tokens with getComputedStyle,
 *      never restated. One palette, two spellings was TOKENS' D2 defect: `--bg` in
 *      CSS and `background:` in a THEME literal drifted apart because nothing tied
 *      them. Now the stylesheet is the only statement and this derives from it;
 *   3. the browser's own chrome — <meta theme-color> follows the bar surface.
 *
 * TERMINAL SURFACES STAY DARK IN BOTH THEMES, deliberately: the `--term-*` tokens are
 * not remapped by the light theme. A terminal is read against a dark ground by long
 * convention and every TUI palette assumes it; a light shell around a dark pane is
 * the design, not an omission. index.html applies the saved attribute inline before
 * CSS paints, so a light-theme reload never flashes dark.
 */
import { tiles } from './state.js';

export const LS_THEME = 'tmuxgrid.theme';

/** The owner's CHOICE: 'auto' (the default — follow this device), or a pin. */
export const currentTheme = () => {
  const t = localStorage.getItem(LS_THEME);
  return t === 'light' || t === 'dark' ? t : 'auto';
};

const prefersLight = () => window.matchMedia('(prefers-color-scheme: light)').matches;

/** What the choice RESOLVES to right now — the only two shells CSS knows. */
export const resolvedTheme = (choice = currentTheme()) =>
  choice === 'auto' ? (prefersLight() ? 'light' : 'dark') : choice;

/**
 * The xterm theme, read off the resolved tokens. Called per Terminal construction and
 * again on a theme flip — cheap (one getComputedStyle), and it CANNOT disagree with
 * the stylesheet, which is the whole point.
 */
export function termTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    background: v('--term-bg'),
    foreground: v('--term-fg'),
    cursor: v('--term-cursor'),
    cursorAccent: v('--term-bg'),
    selectionBackground: v('--term-selection'),
    black: v('--term-ansi-black'),
    red: v('--term-ansi-red'),
    green: v('--term-ansi-green'),
    yellow: v('--term-ansi-yellow'),
    blue: v('--term-ansi-blue'),
    magenta: v('--term-ansi-magenta'),
    cyan: v('--term-ansi-cyan'),
    white: v('--term-ansi-white'),
    brightBlack: v('--term-ansi-br-black'),
    brightRed: v('--term-ansi-br-red'),
    brightGreen: v('--term-ansi-br-green'),
    brightYellow: v('--term-ansi-br-yellow'),
    brightBlue: v('--term-ansi-br-blue'),
    brightMagenta: v('--term-ansi-br-magenta'),
    brightCyan: v('--term-ansi-br-cyan'),
    brightWhite: v('--term-ansi-br-white'),
  };
}

/** Put the active (or given) choice on the page: attribute, browser chrome, terminals. */
export function applyTheme(name) {
  const choice = name === 'light' || name === 'dark' || name === 'auto' ? name : currentTheme();
  document.documentElement.dataset.theme = resolvedTheme(choice);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bar = getComputedStyle(document.documentElement).getPropertyValue('--bg-2').trim();
    if (bar) meta.content = bar;
  }
  // Live terminals re-read the palette; tape/composer surfaces are plain CSS and
  // follow the tokens on their own.
  tiles.forEach((tile) => tile.term?.setTheme?.(termTheme()));
}

/**
 * The flip button's whole contract (⚙ System → appearance). One button, two moves:
 * flipping AWAY from what the device prefers stores a pin; flipping BACK to match
 * the device stores 'auto' — "make it match my Mac" and "follow my Mac" are the
 * same act, so following resumes without a third control existing.
 */
export function setTheme(name) {
  const want = name === 'light' || name === 'dark' ? name : 'auto';
  const device = prefersLight() ? 'light' : 'dark';
  localStorage.setItem(LS_THEME, want === 'auto' || want === device ? 'auto' : want);
  applyTheme();
}

// AUTO IS LIVE: while the choice is auto, the device flipping its appearance flips
// Ronin in place — attribute, browser chrome and every live terminal, no reload.
// One page-lifetime listener; it does nothing unless auto is the standing choice.
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (currentTheme() === 'auto') applyTheme('auto');
});
