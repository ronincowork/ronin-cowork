/* part of the tmux-ronin client — see js/README.md */
/**
 * THEME — dark and light, resolved from the stylesheet, spelled once.
 *
 * The palette lives in style.css as semantic tokens on `:root` (dark) and
 * `:root[data-theme='light']`. This module owns the three things CSS cannot:
 *
 *   1. which theme is active — the owner's choice, persisted per device
 *      (localStorage, like the layout: which surface is dark is a fact about the
 *      screen you are holding, not about the install);
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

/** The active theme name: 'dark' unless the owner chose light. */
export const currentTheme = () => (localStorage.getItem(LS_THEME) === 'light' ? 'light' : 'dark');

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

/** Put the active (or given) theme on the page: attribute, browser chrome, terminals. */
export function applyTheme(name) {
  const t = name === 'light' || name === 'dark' ? name : currentTheme();
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bar = getComputedStyle(document.documentElement).getPropertyValue('--bg-2').trim();
    if (bar) meta.content = bar;
  }
  // Live terminals re-read the palette; tape/composer surfaces are plain CSS and
  // follow the tokens on their own.
  tiles.forEach((tile) => tile.term?.setTheme?.(termTheme()));
}

/** The owner picked one (⚙ System → appearance). Persist, then apply. */
export function setTheme(name) {
  localStorage.setItem(LS_THEME, name === 'light' ? 'light' : 'dark');
  applyTheme(name);
}
