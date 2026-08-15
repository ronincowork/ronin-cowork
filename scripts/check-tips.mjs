#!/usr/bin/env node
/**
 * check-tips — every hover label fits the help box.
 *
 *   node scripts/check-tips.mjs [url]
 *
 * The help box (`js/tips.js`) is a FIXED rectangle: it does not grow for a long label
 * and does not shrink for a short one, because growing is what made the old tooltip
 * restless — crossing a row of buttons resized the panel under the pointer. A fixed box
 * buys that steadiness with one obligation: every label has to fit inside it.
 *
 * "Has to fit" is not a thing to keep in your head. Left to prose, the first label
 * someone writes a sentence too long is clipped in silence, and clipped help is worse
 * than none — it reads as a complete sentence that happens to be wrong. So this measures
 * every label in the running client, in the real browser, against the real box, and
 * fails the build naming the ones that overflow and by how much.
 *
 * IT MEASURES THE RENDERED APP, not the source. Titles are built from templates, rewritten
 * on refresh, and injected by half a dozen modules; grepping for them would check a
 * different set of strings than the one a user actually hovers. So it opens the page,
 * walks the commons tabs to bring their controls into existence, and reads what is there.
 *
 * IN BOTH STATES, and that is not a detail — the first version of this check passed a
 * label that was 17px too long and visibly spilling out of the box. A control REWRITES
 * its title depending on whether a session is connected: `setInert()` swaps the dial's
 * for "no session in this tile yet", and 🏷 / 📝 / the mark do the same. Reading the page
 * in one state therefore measures one of the two strings a control can carry, and the
 * long one is usually the other. So it collects with nothing connected, connects a
 * session, and collects again.
 */
import { defaultUrl, loadPlaywright } from './lib/ui-host.mjs';

const pw = await loadPlaywright();
if (!pw) {
  // Same posture as smoke-ui: a missing host tool is a SKIP, not a failure. The free
  // build must verify on a box that never installed a browser.
  console.log('check-tips: SKIPPED — playwright not installed (see docs/host-tools.md)');
  process.exit(0);
}

// The URL is derived exactly as the server binds (scripts/lib/ui-host.mjs). It used to be
// worked out here instead, assumed loopback, and failed against a server that was up and
// answering — which is why that derivation now lives in one place.
const url = process.argv[2] || defaultUrl();

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let rows;
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
  // Bring the commons surfaces into existence — their controls do not exist until the
  // tab is opened, and their labels are the majority of the set.
  await page.keyboard.press('Control+Shift+C').catch(() => {});
  await page.waitForTimeout(1200);
  for (const tab of ['new', 'wipe', 'docs', 'proj', 'hotwords', 'stats', 'koshi']) {
    await page.locator(`.home-tabs button[data-pane="${tab}"]`).first().click({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(250);
  }

  // Both states. A control's title changes when a session connects, and the long
  // variant is usually the connected one.
  const collect = () => page.evaluate(() => {
    // Measure inside a REAL help box, so padding, font, line-height and the status
    // line's reserved height are the ones that ship rather than numbers copied here.
    const probe = document.createElement('div');
    probe.className = 'helpbox';
    probe.style.cssText = 'display:block;visibility:hidden;left:-9999px;top:0';
    const status = document.createElement('div');
    status.className = 'helpbox-status';
    status.textContent = 'x'; // reserve the line, as a real one does
    const what = document.createElement('div');
    what.className = 'helpbox-what';
    probe.append(status, what);
    document.body.appendChild(probe);

    const seen = new Map();
    for (const el of document.querySelectorAll('[title], [data-tip]')) {
      const text = (el.title || el.dataset.tip || '').trim();
      if (!text || seen.has(text)) continue;
      what.textContent = text;
      // How much room the explanation actually has: the box, less its padding, less
      // the status line and its rule.
      const room = probe.clientHeight
        - parseFloat(getComputedStyle(probe).paddingTop)
        - parseFloat(getComputedStyle(probe).paddingBottom)
        - status.getBoundingClientRect().height;
      seen.set(text, { over: Math.round(what.scrollHeight - room), chars: text.length });
    }
    probe.remove();
    return [...seen.entries()].map(([text, m]) => ({ text, ...m }));
  });

  const merged = new Map();
  for (const r of await collect()) merged.set(r.text, r);
  // Connect the first real session, then read every label again.
  const picked = await page.evaluate(() => {
    const sel = document.querySelector('select.sess');
    const opt = [...(sel?.options ?? [])].find((o) => o.value && !o.value.startsWith('\u0000') && o.value !== 'new');
    if (!sel || !opt) return null;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return opt.value;
  });
  if (picked) {
    await page.waitForTimeout(4000);
    for (const r of await collect()) merged.set(r.text, r);
  } else {
    console.log('check-tips: note — no session to connect to; only the idle-state labels were measured.');
  }
  rows = [...merged.values()];
} finally {
  await browser.close();
}

const over = rows.filter((r) => r.over > 0).sort((a, b) => b.over - a.over);
console.log('check-tips — every hover label fits the help box');
if (!over.length) {
  console.log(`check-tips: ok — ${rows.length} label(s) checked, all fit`);
  process.exit(0);
}
for (const r of over) {
  console.log(`  FAIL  ${r.over}px over (${r.chars} chars) — ${JSON.stringify(r.text.slice(0, 88))}`);
}
console.log(`\ncheck-tips: ${over.length} label(s) too long for the help box.`);
console.log('Shorten them, or change the box in style.css (.helpbox) and re-run.');
process.exit(1);
