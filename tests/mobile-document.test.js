import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// The phone downloads the mobile document and nothing else. The frame Glen photographed —
// the desktop bar and a squashed boot skeleton, replaced a beat later by the phone UI —
// cannot recur while nothing in mobile.html can paint a desktop frame and nothing in the
// desktop document decides "phone".
test('the mobile document holds only the mobile page, and the desktop document never decides phone', async () => {
  const [mobile, index, main, state, server] = await Promise.all([
    source('public/mobile.html'), source('public/index.html'), source('public/js/main.js'),
    source('public/js/state.js'), source('src/index.ts'),
  ]);
  assert.doesNotMatch(mobile, /id="bar"|id="bootframe"|id="viewhost"|wk-workbench|workspace-kit\.css|boot-pending/);
  assert.match(mobile, /<div id="phone">\s*<header class="ph-bar">/);
  // The document reads its own address before its first frame, so a tile address never
  // paints the Teams bar first.
  assert.match(mobile, /document\.documentElement\.dataset\.screen = 'inside'/);
  assert.match(mobile, /<a class="ph-back" href="#\/" data-boot="inside"/);
  assert.match(mobile, /<script type="module" src="\/__RONIN_ASSET_VERSION__\/js\/phone\.js"><\/script>/);
  assert.doesNotMatch(index, /js\/phone\.js/);
  assert.doesNotMatch(main, /IS_PHONE|buildPhone|phone\.js/);
  assert.doesNotMatch(state, /IS_PHONE/);
  assert.match(server, /app\.get\('\/m', sendMobile\)/);
  assert.match(server, /res\.setHeader\('Vary', 'User-Agent'\)/);
  assert.match(server, /isPhone\(req\) \? sendMobile : sendIndex/);
});
