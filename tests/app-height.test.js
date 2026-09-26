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
  for (const event of ['resize', 'scroll', 'orientationchange']) {
    assert.match(height, new RegExp(`'${event}'`), `re-measured on ${event}`);
  }
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
