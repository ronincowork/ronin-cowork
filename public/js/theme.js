/* part of the ronin-cowork client — see js/README.md */
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
 * TERMINAL SURFACES GO LIGHT TOO (2026-08-19). They did not until then, and this comment
 * argued for it: a terminal is read against a dark ground by long convention and every TUI
 * palette assumes it. The convention is real; the conclusion was still wrong. White-on-black
 * IS the wall a non-terminal person hits, so a light shell that keeps a black pane has not
 * gone light — it has put a light frame around the intimidating part. The `--term-*` tokens
 * are now remapped by `:root[data-theme='light']` like every other role, which means THIS
 * FILE NEEDED NO CHANGE to carry it: `termTheme()` re-reads the tokens on every flip, so
 * remapping them in CSS is the entire mechanism. That is the token rule paying for itself.
 * index.html applies the saved attribute inline before CSS paints, so a light-theme reload
 * never flashes dark.
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
/**
 * THE TERMINAL'S FACE, read from the stylesheet like its palette (2026-08-19).
 *
 * `fontFamily` was spelled a second time in js/termview.js, three inches under a comment
 * saying the palette is spelled once in CSS and xterm reads that spelling. The face was
 * the exception, and an exception in a one-source-of-truth rule is where the drift starts:
 * the tape, the composer and the jump button all have to match this stack glyph-for-glyph
 * or a wrapped line stops lining up with the terminal above it, and there were already
 * three mono stacks in the file doing the work of two roles. Now `--font-term` is the
 * spelling and everyone reads it — including the re-skin that changes it.
 */
export function termFace() {
  const cs = getComputedStyle(document.documentElement);
  return {
    fontFamily: cs.getPropertyValue('--font-term').trim(),
    // parseFloat, because xterm wants a NUMBER and the token is a length ('13px').
    fontSize: parseFloat(cs.getPropertyValue('--text-4')),
  };
}

/**
 * THE OTHER 240 COLOURS — xterm's 256-colour cube, read forwards or flipped.
 *
 * WHY THIS EXISTS AT ALL. A terminal palette is sixteen named slots plus 240 more, and
 * only the sixteen are tokens. The 240 are DEFINED ARITHMETICALLY by the xterm standard —
 * a 6x6x6 RGB cube on the levels below, then 24 greys — so they are generated here rather
 * than written down, and this file still spells no colour.
 *
 * A PROGRAM CHOOSES WHICH HALF IT ADDRESSES, and that choice decides whether it follows
 * the shell. Claude Code under an `-ansi` theme emits slot NAMES, so remapping the sixteen
 * carries it. Codex addresses the cube: `38;5;231` (pure white) and fills of `48;5;22`,
 * `52`, `237`, `16`. Nothing remapped those, so when cfb8230 made the terminal follow the
 * shell, Codex kept painting for a dark ground that was no longer there — white text at
 * 1.06:1 on paper, which reads as blank white blocks where the output should be.
 *
 * MIRROR PERCEPTUAL LIGHTNESS (CIE L*), KEEPING HUE AND CHROMA. Two obvious transforms
 * are both wrong and were measured before this one was kept:
 *
 *   HSL lightness    a saturated colour sits at L=0.5 whatever its brightness, so it does
 *                    not move. Gold (#ffd700) stayed at 1.32:1 on paper — unreadable, and
 *                    it is what a TUI warns in.
 *   relative luminance  mirrors on a curve so steep that mid greys land near-white:
 *                    #949494 -> #dadada, 1.32:1. Worst case across the cube was 1.00:1.
 *
 * L* is perceptually even, so a mid grey stays mid and a bright colour genuinely darkens:
 * gold -> 14.25:1, the greys 4.8-7.4:1, white -> black at 19.77:1.
 *
 * AND DO NOT "FIX" CONTRAST AFTERWARDS. One palette serves both text and background fills,
 * so the transform has to reverse MEANING, not maximise legibility: light ink becomes dark
 * ink, and a dark rectangle becomes a light one. Clamp every entry to 3:1 on paper and
 * every fill turns back into the dark rectangle this exists to remove.
 *
 * 33 of the 240 still fall under 3:1 as text on paper, and that is the honest floor rather
 * than a miss: they are the entries that START dark, so mirroring makes them light. Those
 * were never readable as text on the dark shell either — they are the fill half of the
 * palette. Codex's own tape is the proportion that matters: foreground codes outnumber
 * background ones about fifty to one, so the direction optimised here is the one in use.
 */
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const unlin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Entry `n` (16–255) of the standard cube, as [r, g, b]. Arithmetic, not a table. */
function cubeRgb(n) {
  if (n >= 232) {
    const v = 8 + (n - 232) * 10; // the 24-step grey ramp
    return [v, v, v];
  }
  const i = n - 16;
  return [CUBE_LEVELS[Math.floor(i / 36)], CUBE_LEVELS[Math.floor((i % 36) / 6)], CUBE_LEVELS[i % 6]];
}

const F = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const Finv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);

/** Same hue and chroma, mirrored perceptual lightness. */
function mirrorLightness([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = F((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = F(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = F((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  const fy = (100 - (116 * y - 16) + 16) / 116;            // L* mirrored about 50
  const fx = fy + (500 * (x - y)) / 500;
  const fz = fy - (200 * (y - z)) / 200;
  const X = Finv(fx) * 0.95047, Y = Finv(fy), Z = Finv(fz) * 1.08883;
  return [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ].map((c) => unlin(Math.max(0, Math.min(1, c))));
}

/** The 240, for xterm's `extendedAnsi`. Index 0 is colour 16. */
export function termCube() {
  const mode = getComputedStyle(document.documentElement).getPropertyValue('--term-cube').trim();
  const out = [];
  for (let n = 16; n < 256; n++) {
    const c = mode === 'invert' ? mirrorLightness(cubeRgb(n)) : cubeRgb(n);
    out.push(`#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`);
  }
  return out;
}

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
    // The other 240. Pushed with the sixteen so one setTheme carries the whole palette.
    extendedAnsi: termCube(),
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
