#!/usr/bin/env node
import { defaultUrl, loadPlaywright } from './lib/ui-host.mjs';

const pw = await loadPlaywright();
if (!pw) {
  console.log('check-tips: SKIPPED — playwright not installed (see docs/host-tools.md)');
  process.exit(0);
}

const url = process.argv[2] || defaultUrl();
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(2000);

  const control = page.locator('[data-tip]:visible').first();
  if (await control.count()) {
    await control.hover();
    await page.waitForTimeout(500);
    await control.focus();
    await page.waitForTimeout(500);
  }

  const state = await page.evaluate(() => ({
    nativeTitles: document.querySelectorAll('[title]').length,
    helpBoxes: document.querySelectorAll('.helpbox').length,
    labelled: document.querySelectorAll('[data-tip][aria-label]').length,
  }));
  if (state.nativeTitles || state.helpBoxes) {
    console.log(`check-tips: FAIL — ${state.nativeTitles} native title(s), ${state.helpBoxes} help box(es)`);
    process.exitCode = 1;
  } else {
    console.log(`check-tips: ok — no hover/focus boxes; ${state.labelled} controls retain accessible labels`);
  }
} finally {
  await browser.close();
}
