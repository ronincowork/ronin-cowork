/* part of the ronin-cowork client — see js/README.md */
import { tiles } from './state.js';

export const LS_THEME = 'tmuxgrid.theme';

/** The owner's CHOICE on THIS DEVICE: a light or dark pin, or 'auto' — follow the
 *  Campaign's configured theme (the Machine Settings control), else the house light. */
export const currentTheme = () => {
  const t = localStorage.getItem(LS_THEME);
  return t === 'light' || t === 'dark' ? t : 'auto';
};

const clean = (value) => (value === 'light' || value === 'dark' ? value : '');
// START FROM THE SAME LAST-KNOWN ANSWER AS THE INLINE HEAD SCRIPT. The head restores
// this cache before CSS paints; starting the module from empty made main.js's first
// applyTheme() replace a cached dark shell with the light fallback while the served
// Campaign desk was still in flight, then loadDeskProfile() changed it back to dark.
// That dark → light → dark sequence was the reload flash. The server remains
// authoritative: setCampaignTheme() replaces both values as soon as its answer arrives.
const cachedCampaignThemes = () => {
  try {
    return {
      desktop: clean(localStorage.getItem('tmuxgrid.theme.system')),
      mobile: clean(localStorage.getItem('tmuxgrid.theme.system.mobile')),
    };
  } catch (_) {
    return { desktop: '', mobile: '' }; // private/blocked storage: house light below
  }
};
let campaignThemes = cachedCampaignThemes();
const COARSE = window.matchMedia('(pointer: coarse)').matches;
export function setCampaignTheme(desk) {
  campaignThemes = { desktop: clean(desk?.theme), mobile: clean(desk?.theme_mobile) };
  try {
    localStorage.setItem('tmuxgrid.theme.system', campaignThemes.desktop);
    localStorage.setItem('tmuxgrid.theme.system.mobile', campaignThemes.mobile);
  } catch (_) { /* private mode */ }
}

/** What resolves onto the page: a device pin (legacy, no UI writes one today)
 *  outranks the Campaign's setting for this surface, which outranks the house light. */
export const resolvedTheme = (choice = currentTheme()) =>
  choice === 'auto' ? ((COARSE ? campaignThemes.mobile : campaignThemes.desktop) || 'light') : choice;

/**
 * The xterm theme, read off the resolved tokens. Called per Terminal construction and
 * again on a theme flip — cheap (one getComputedStyle), and it CANNOT disagree with
 * the stylesheet, which is the whole point.
 */
export function termFace() {
  const cs = getComputedStyle(document.documentElement);
  return {
    fontFamily: cs.getPropertyValue('--font-term').trim(),
    // parseFloat, because xterm wants a NUMBER and the token is a length ('13px').
    fontSize: parseFloat(cs.getPropertyValue('--text-4')),
  };
}

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

export function setTheme(name) {
  localStorage.setItem(LS_THEME, name === 'light' || name === 'dark' ? name : 'auto');
  applyTheme();
}

// campaign page "didn't really apply to all the other pages"). localStorage 'storage'
// fires in every OTHER document on this origin when the campaign theme cache — or the
// legacy pin — moves, so tabs already open flip in place; pages opened later read the
// cached values at boot as they already did. The module-local campaignThemes is
// refreshed from the event so resolvedTheme answers with the new value, not this
// tab's stale boot copy.
function onThemeStorage(e) {
  if (e.key === 'tmuxgrid.theme.system') campaignThemes.desktop = clean(e.newValue);
  else if (e.key === 'tmuxgrid.theme.system.mobile') campaignThemes.mobile = clean(e.newValue);
  else if (e.key !== LS_THEME) return;
  applyTheme();
}
window.addEventListener('storage', onThemeStorage);
