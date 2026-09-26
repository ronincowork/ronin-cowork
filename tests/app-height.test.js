import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the application is as tall as what the browser can show', async () => {
  const [style, height] = await Promise.all([read('public/style.css'), read('public/js/appheight.js')]);
  // 100dvh is the LAYOUT viewport. On iOS it does not shrink for the on-screen keyboard,
  // so the app kept its full height with the bottom behind the keys and reaching a work
  // surface's end meant panning the whole page; and it drifts as the address bar collapses,
  // which is the same screen being sometimes too short and sometimes too long.
  assert.match(style, /height: var\(--app-h, 100dvh\);/, 'body follows the measured height, with dvh only as a first-paint fallback');
  assert.match(height, /visualViewport/, 'measured from the visual viewport, the only thing that knows');
  assert.match(height, /setProperty\('--app-h'/);
  // Keeping the last good height: a zero arrives while a tab is restored.
  assert.match(height, /if \(height > 0\)/);
  for (const event of ['resize', 'scroll', 'orientationchange', 'focusout']) {
    assert.match(height, new RegExp(`'${event}'`), `re-measured on ${event}`);
  }
});

test('the application occupies the visible rectangle, position as well as size', async () => {
  const [style, height] = await Promise.all([read('public/style.css'), read('public/js/appheight.js')]);
  // Height alone is half the answer. iOS pans the visual viewport to keep a focused box
  // above the keyboard and the page underneath does not move with it, so an app that knows
  // only its height sits above what you can see: the work surface looks pushed up and the
  // page shows through along the bottom. Measured with the term removed, that strip was
  // exactly the pan distance.
  assert.match(height, /offsetTop/, 'where the visible window is');
  assert.match(height, /setProperty\('--app-top'/);
  assert.match(style, /position: fixed;[\s\S]{0,120}top: var\(--app-top, 0px\);[\s\S]{0,80}height: var\(--app-h, 100dvh\);/,
    'fixed to the visible window, taking both terms');
  // `top`, never a transform: a transformed ancestor becomes the containing block for
  // every position: fixed descendant, which would take the docked header caret with it.
  const body = style.slice(style.indexOf('  position: fixed;'));
  assert.doesNotMatch(body.slice(0, body.indexOf('}')), /transform:/);
});

test('the height is never left on a value read part-way through an animation', async () => {
  const height = await read('public/js/appheight.js');
  // iOS animates the keyboard away and reports the viewport as it goes, so the FINAL
  // resize can carry a mid-animation height — and then nothing fires again. Measured once,
  // the app stays that bit too short and leaves a strip of dead space along the bottom
  // that only a reload clears. So the last event is never trusted on its own.
  assert.match(height, /requestAnimationFrame\(measure\)/, 'again on the next frame');
  assert.match(height, /setTimeout\(measure, \d+\)/, 'and again once things have stopped moving');
  // Each is replaced rather than stacked, so a burst of resize events leaves one of each.
  assert.match(height, /cancelAnimationFrame\(frame\)/);
  assert.match(height, /clearTimeout\(settle\)/);
  // Leaving a text box is the keyboard going away, and does not always bring a viewport
  // event of its own — so it re-measures. Guarded by what the handler DOES, since it also
  // has the keyboard mark to update and is no longer a bare reference.
  const focusout = height.slice(height.indexOf("addEventListener('focusout'"));
  assert.match(focusout.slice(0, focusout.indexOf('}')), /remeasure\(\)/);
});

test('nothing pinned to the bottom compensates for the keyboard on its own', async () => {
  const composer = await read('public/js/composer.js');
  // The composer used to measure the keyboard and lift itself by that many pixels, because
  // the app was sized to a viewport that lied. With one honest measurement in one place,
  // every pinned thing can simply sit at the bottom.
  assert.doesNotMatch(composer, /const lift = /);
  assert.doesNotMatch(composer, /innerHeight - vv\.height/);
  assert.doesNotMatch(composer, /wrap\.style\.bottom/);
  // The clearance the view underneath needs is still reserved, and is now just the height.
  assert.match(composer, /--composer-clearance/);
});

test('both documents measure the height before they lay anything out', async () => {
  const [main, phone] = await Promise.all([read('public/js/main.js'), read('public/js/phone.js')]);
  for (const [name, src] of [['main.js', main], ['phone.js', phone]]) {
    assert.match(src, /import \{ trackAppHeight \} from '\.\/appheight\.js';/, `${name} imports it`);
    assert.match(src, /trackAppHeight\)|trackAppHeight\(\)/, `${name} calls it`);
  }
  // Before the theme and the grid in the desktop boot: surfaces are measured against it.
  assert.ok(main.indexOf('trackAppHeight') < main.indexOf("guard('apply theme'"), 'measured before the grid is built');
});

test('the application cannot be dragged around: the heads are fixed furniture', async () => {
  const style = await read('public/style.css');
  const root = style.slice(style.indexOf('html,\nbody {'));
  const rule = root.slice(0, root.indexOf('}'));
  // overflow: hidden stops the document SCROLLING but not the DRAG. On iOS a pull
  // anywhere still rubber-bands the whole page, taking the bar and the surface heads off
  // the top of the screen, and a scroll that reaches the end of a transcript chains
  // outward into that same drag. There is nothing above or below the app to reach.
  assert.match(rule, /overflow: hidden/);
  assert.match(rule, /overscroll-behavior: none/);
  // The bar is a flex child of that box, never a scrolled one, so it cannot travel.
  assert.match(style, /#bar \{[^}]*flex: 0 0 auto/);
});

test('the top header stands down for the keyboard; the workspace heads do not', async () => {
  const [style, height] = await Promise.all([read('public/style.css'), read('public/js/appheight.js')]);
  // With the keys up there is little room left, and the application bar is the part you
  // are not using. The heads over the work surfaces are what tell you where you are, so
  // they stay and the space between them gives (owner, 2026-09-26).
  assert.match(style, /:root\[data-keyboard='open'\] #bar \{ display: none; \}/);
  // Nothing hides a surface head or a tile head for the keyboard.
  assert.doesNotMatch(style, /\[data-keyboard='open'\][^{]*(?:wk-surface-header|tile-head)/);
  // A text box holding focus is what "the keyboard is up" means — the same signal the
  // keys row already uses, and no pixel threshold to guess wrong.
  assert.match(height, /dataset\.keyboard = 'open'/);
  assert.match(height, /input\|textarea/);
  assert.match(height, /isContentEditable/);
  assert.doesNotMatch(height, /keyboard[\s\S]{0,200}> \d{2,}/, 'no height threshold decides it');
  // Moving between two boxes fires focusout before focusin, so who holds focus is read
  // afterwards — otherwise the top header leaves and returns between fields.
  assert.match(height, /setTimeout\(markKeyboard, 0\)/);
  assert.match(height, /addEventListener\('focusin', markKeyboard\)/);
});
