#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { defaultUrl, loadPlaywright } from './lib/ui-host.mjs';

const URL_ = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || defaultUrl(true);
const ARTIFACTS = process.env.RONIN_SETUP_ARTIFACTS || '/tmp/ronin-setup-verify';
const playwright = await loadPlaywright();
if (!playwright) throw new Error('Playwright is required for the Setup rendering gate');
fs.mkdirSync(ARTIFACTS, { recursive: true });

const failures = [];
const ok = (message) => console.log(`  ok   — ${message}`);
const bad = (message) => { failures.push(message); console.log(`  FAIL — ${message}`); };
const PRESET_COPY = [
  ['Bare Metal', 'Start one to four agents, each in its own tile. Lock and load.'],
  ['Code Stack Eval', 'Point a team at a codebase and get its read on the stack.'],
  ['Develop a New Project', 'A lead plus feature agents, each in its own worktree.'],
  ['Personal Assistant', 'One assistant that remembers. Alone, or a lead that hires help.'],
  ['Home Health', 'Head coach, nutritionist, race guide. Drop or add roles.'],
  ['Grokbot Morning Briefing', 'Grok writes you a briefing on a schedule you set.'],
  ['Agent + Editable Doc', 'One coding agent beside a document you both edit.'],
];

async function context(browser, { phone = false, theme = 'light', reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({
    viewport: phone ? { width: 402, height: 681 } : { width: 1400, height: 900 },
    isMobile: phone,
    hasTouch: phone,
    colorScheme: theme,
    reducedMotion,
  });
  await ctx.addInitScript((chosen) => localStorage.setItem('tmuxgrid.theme', chosen), theme);
  return ctx;
}

async function runtimeBand(browser, count) {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.route('**/api/setup/runtime', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      activated_count: count,
      activated_band: count >= 2 ? 'two_plus' : count === 1 ? 'one' : 'zero',
      providers: [],
      roots: [],
    }),
  }));
  await page.route('**/api/setup/registration', (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'optional', submitted_at: null, communication: { newsletter: false, release_updates: false, follow_up: [], no_communication: true } }),
    });
  });
  await page.goto(`${URL_.replace(/#.*$/, '')}#/home`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-workspace-view="home"]:not([hidden]) .ch-door');
  const doors = await page.locator('.ch-door').evaluateAll((nodes) => nodes.map((node) => ({
    name: node.querySelector('h2')?.textContent,
    href: node.getAttribute('href'),
    disabled: node.getAttribute('aria-disabled'),
    gate: node.querySelector('.ch-gate')?.textContent || '',
  })));
  const expectedSettings = count >= 2 ? '#/campaign' : '#/setup';
  if (doors.length === 3 && doors[0]?.name === 'Machine Settings' && doors[0]?.href === expectedSettings) ok(`${count} providers: Machine Settings defaults to ${expectedSettings.slice(2)}`);
  else bad(`${count} providers: wrong Three Blocks settings route ${JSON.stringify(doors)}`);
  const locked = doors.slice(1).every((door) => door.disabled === 'true' && /Activate one model provider/.test(door.gate));
  const open = doors.slice(1).every((door) => door.disabled === null && !door.gate);
  if ((count === 0 && locked) || (count > 0 && open)) ok(`${count} providers: Teams and New Project gate correctly`);
  else bad(`${count} providers: Teams/New Project gate mismatch ${JSON.stringify(doors.slice(1))}`);
  await ctx.close();
}

async function setupPass(browser, options) {
  const label = `${options.phone ? 'phone' : 'desktop'} ${options.theme} ${options.reducedMotion} ${options.providerCount ?? 2}-providers${options.ready ? '-ready' : '-blocked'}`;
  const ctx = await context(browser, options);
  const page = await ctx.newPage();
  const providerRows = [
    { id: 'anthropic', label: 'Claude', state: options.ready ? 'activated' : 'installable', installable: !options.ready, installed: options.ready, activated: !!options.ready },
    { id: 'openai', label: 'Codex', state: 'installed', installed: true, activated: false },
  ].slice(0, options.providerCount ?? 2);
  const errors = [];
  const failed = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('requestfailed', (request) => failed.push(`${request.url()} ${request.failure()?.errorText || ''}`));
  await page.route('**/api/setup/runtime', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      activated_count: options.ready ? 1 : 0,
      activated_band: options.ready ? 'one' : 'zero',
      providers: providerRows,
      roots: [],
      gbrain: { installed: false, active: false },
      services: { installed: false, active: false },
    }),
  }));
  await page.goto(`${URL_.replace(/#.*$/, '')}#/setup`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-workspace-view="setup"]:not([hidden]) .wk-workbench-layout');
  const state = await page.evaluate(() => {
    const active = document.querySelector('[data-workspace-view="setup"]:not([hidden])');
    return {
      profile: active?.querySelector('.wk-workbench-layout')?.dataset.workbenchProfile || '',
      title: document.title,
      island: document.querySelector('#viewplace')?.textContent?.trim() || '',
      workspaces: [...(active?.querySelectorAll('.wk-workbench-cell:not([hidden])') || [])].map((node) => ({
        id: node.dataset.workspace,
        surface: node.firstElementChild?.dataset.workbenchSurface || '',
      })),
      columns: [...(active?.querySelectorAll('.wk-workbench-layout > [data-surface]:not([hidden])') || [])].map((node) => node.getAttribute('data-surface')),
      selectors: [...(active?.querySelectorAll('.wk-workbench-selector-cards .wk-card-heading') || [])].map((node) => node.textContent?.trim()),
      providerCards: [...(active?.querySelectorAll('.wk-workbench-selector-cards [data-workbench-offer-resource]') || [])].map((node) => ({
        key: node.getAttribute('data-workbench-offer-resource'),
        label: node.querySelector('.wk-card-heading')?.textContent?.trim(),
      })),
      presets: active?.querySelectorAll('.sp-slot').length || 0,
      feedback: [...(document.querySelectorAll('button, a') || [])].some((node) => node.textContent?.trim() === 'Feedback' && node.getClientRects().length > 0),
      stoneBoxes: [...(active?.querySelectorAll('.sp-slot') || [])].map((node) => {
        const box = node.getBoundingClientRect();
        const copy = node.querySelector('.sp-slot-copy');
        const copyBox = copy?.getBoundingClientRect();
        return {
          width: box.width, height: box.height, top: box.top,
          label: node.querySelector('b')?.textContent?.trim(), copy: copy?.textContent?.trim(),
          accessible: node.innerText.trim(), glyphHidden: node.querySelector('.sp-glyph')?.getAttribute('aria-hidden'),
          copyFits: !!copyBox && copy.scrollWidth <= copy.clientWidth + 1 && copyBox.right <= box.right + 1 && copyBox.bottom <= box.bottom + 1,
        };
      }),
      launch: (() => {
        const node = [...(active?.querySelectorAll('button') || [])].find((item) => item.textContent?.trim() === 'Launch');
        if (!node) return null;
        const style = getComputedStyle(node);
        const kaki = getComputedStyle(document.documentElement).getPropertyValue('--kaki').trim();
        return { background: style.backgroundColor, border: style.borderColor, kaki, mark: !!node.querySelector('.wk-launch-mark') };
      })(),
      register: (() => {
        const form = active?.querySelector('.setup-register-form');
        const details = form?.querySelector('.setup-register-disclosure');
        const action = [...(form?.querySelectorAll('button') || [])].find((node) => node.textContent?.trim() === 'Register');
        const style = action ? getComputedStyle(action) : null;
        return {
          visibleInputs: [...(form?.querySelectorAll('input,select,textarea') || [])].filter((node) => node.getClientRects().length > 0).map((node) => node.name),
          detailsOpen: details?.open === true,
          detailFields: [...(details?.querySelectorAll('input,select,textarea') || [])].map((node) => node.name),
          identityVisible: (active?.querySelector('.setup-registration-identity')?.getClientRects().length || 0) > 0,
          action: style ? { background: style.backgroundColor, border: style.borderColor } : null,
        };
      })(),
      legacyPhone: !!document.getElementById('phone'),
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > innerWidth + 1,
    };
  });
  if (state.profile === 'setup' && state.title === 'Ronin Setup' && state.island === 'Ronin Setup') ok(`${label}: title, island, and fourth-workbench profile agree`);
  else bad(`${label}: identity mismatch ${JSON.stringify(state)}`);
  if (state.workspaces.length === 2 && state.workspaces[0]?.surface === 'setup.register' && state.workspaces[1]?.surface === 'setup.presets') ok(`${label}: Register opens in WS1 and Presets is pinned in WS2`);
  else bad(`${label}: initial seating mismatch ${JSON.stringify(state.workspaces)}`);
  if (state.columns[0] === 'selector') ok(`${label}: selector is the left column`);
  else bad(`${label}: selector is not left ${JSON.stringify(state.columns)}`);
  const expected = ['Register', ...providerRows.map((row) => row.label), 'Workspace folders', 'Ronin Services', 'gbrain', 'Templates'];
  if (JSON.stringify(state.selectors) === JSON.stringify(expected) && state.presets === 7) ok(`${label}: selector order and seven presets are complete`);
  else bad(`${label}: selector/preset mismatch ${JSON.stringify({ selectors: state.selectors, presets: state.presets })}`);
  const expectedProviderCards = providerRows.map((row) => ({ key: row.id, label: row.label }));
  if (JSON.stringify(state.providerCards) === JSON.stringify(expectedProviderCards)) ok(`${label}: ${providerRows.length} Runtime provider rows render exactly ${providerRows.length} individual cards`);
  else bad(`${label}: Runtime provider rows/cards mismatch ${JSON.stringify({ expectedProviderCards, actual: state.providerCards })}`);
  const stoneWidths = state.stoneBoxes.map((box) => Math.round(box.width));
  const equalStones = new Set(stoneWidths).size === 1;
  const squareStones = state.stoneBoxes.every((box) => Math.abs(box.width - box.height) <= 2);
  const staggered = state.stoneBoxes.length > 2 && new Set(state.stoneBoxes.map((box) => Math.round(box.top))).size > 1;
  if (equalStones && squareStones && staggered) ok(`${label}: seven preset stones are equal, square, and staggered`);
  else bad(`${label}: preset stone geometry mismatch ${JSON.stringify(state.stoneBoxes)}`);
  const exactCopy = state.stoneBoxes.map(({ label, copy }) => [label, copy]);
  const accessibleCopy = state.stoneBoxes.every((stone) => stone.glyphHidden === 'true' && stone.accessible.includes(stone.label) && stone.accessible.includes(stone.copy));
  const wrappedWithoutOverflow = state.stoneBoxes.every((stone) => stone.copyFits);
  if (JSON.stringify(exactCopy) === JSON.stringify(PRESET_COPY) && accessibleCopy && wrappedWithoutOverflow) ok(`${label}: seven exact approved one-liners are readable, contained, and accessible on resting stones`);
  else bad(`${label}: resting-stone content/a11y/overflow mismatch ${JSON.stringify({ exactCopy, accessibleCopy, wrappedWithoutOverflow })}`);
  if (!options.ready || (state.launch?.mark && state.launch.border !== state.launch.background)) ok(`${label}: Launch is gated or uses its mark and a neutral background with distinct outline`);
  else bad(`${label}: Launch treatment mismatch ${JSON.stringify(state.launch)}`);
  if (!state.feedback) ok(`${label}: Setup header has no Feedback control`);
  else bad(`${label}: Setup header still exposes Feedback`);
  const registerOK = JSON.stringify(state.register?.visibleInputs) === JSON.stringify(['email'])
    && state.register?.detailsOpen === false
    && JSON.stringify(state.register?.detailFields) === JSON.stringify(['purpose', 'kind', 'user_type', 'own_words'])
    && state.register?.identityVisible === false
    && state.register?.action?.background !== state.register?.action?.border;
  if (registerOK) ok(`${label}: Register is progressive, preserves all detail fields, hides pending identity, and uses a neutral outlined action`);
  else bad(`${label}: Register progressive disclosure mismatch ${JSON.stringify(state.register)}`);
  await page.locator('.setup-register-disclosure > summary').first().click();
  const openRegisterFields = await page.locator('.setup-register-form input:visible,.setup-register-form select:visible,.setup-register-form textarea:visible').evaluateAll((nodes) => nodes.map((node) => node.name));
  if (JSON.stringify(openRegisterFields) === JSON.stringify(['email', 'purpose', 'kind', 'user_type', 'own_words'])) ok(`${label}: opening Registration details reveals the exact preserved fields`);
  else bad(`${label}: opened Registration fields mismatch ${JSON.stringify(openRegisterFields)}`);
  if (!state.legacyPhone && !state.overflow) ok(`${label}: responsive workbench fits without the retired phone shell`);
  else bad(`${label}: responsive layout mismatch ${JSON.stringify({ legacyPhone: state.legacyPhone, overflow: state.overflow })}`);

  if (providerRows.length && !options.ready) {
    const stone = page.locator('.sp-slot').filter({ hasText: 'Bare Metal' }).first();
    await stone.click();
    const selector = page.locator('.wk-workbench-selector-cards');
    const launch = page.locator('.sp-detail button').filter({ hasText: /^Launch$/ });
    const selectorState = () => selector.evaluate((node) => ({ html: node.innerHTML, scrollTop: node.scrollTop }));
    const beforeBlocked = await selectorState();
    await launch.evaluate((node) => {
      node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const afterPointer = await selectorState();
    await launch.focus(); await page.keyboard.press('Enter');
    const afterKeyboard = await selectorState();
    const gateMessage = await page.locator('.sp-warning').textContent();
    if (JSON.stringify(beforeBlocked) === JSON.stringify(afterPointer) && JSON.stringify(beforeBlocked) === JSON.stringify(afterKeyboard)
      && gateMessage?.trim() === 'A model provider is required before launching a preset.') {
      ok(`${label}: blocked pointer and keyboard Launch show only the provider-required message and leave the selector byte-identical`);
    } else bad(`${label}: blocked Launch mutated selector ${JSON.stringify({ beforeBlocked, afterPointer, afterKeyboard, gateMessage })}`);
    const blockedDetail = await page.locator('.sp-detail').evaluate((detail) => {
      const visible = (node) => !!node && node.getClientRects().length > 0;
      const buttons = [...detail.querySelectorAll('button')];
      const launch = buttons.find((node) => node.textContent?.trim() === 'Launch');
      const customize = buttons.find((node) => node.textContent?.trim() === 'Customize');
      const gate = detail.querySelector('.sp-gate');
      const link = gate?.querySelector('button');
      const selectedDestination = detail.querySelector('.sp-destination');
      const restingDestinations = document.querySelectorAll('.sp-grid .sp-slot .sp-destination');
      return {
        message: visible(detail.querySelector('textarea')),
        specialized: visible(detail.querySelector('.sp-controls')),
        customize: visible(customize),
        launch: { visible: visible(launch), disabled: launch?.disabled === true, label: launch?.textContent?.trim(), mark: !!launch?.querySelector('.wk-launch-mark') },
        held: visible(detail.querySelector('.sp-held')) && detail.querySelector('.sp-held')?.textContent?.trim() === 'Held',
        disclosure: visible(gate?.querySelector('p')),
        link: visible(link),
        linkContentWidth: !!link && !!gate && link.getBoundingClientRect().width < gate.getBoundingClientRect().width,
        destination: visible(selectedDestination) ? selectedDestination.textContent?.trim() : '',
        restingDestinations: restingDestinations.length,
      };
    });
    const blockedOK = blockedDetail.message && blockedDetail.specialized && blockedDetail.customize
      && blockedDetail.launch.visible && blockedDetail.launch.disabled && blockedDetail.launch.label === 'Launch' && blockedDetail.launch.mark
      && blockedDetail.held && blockedDetail.disclosure && blockedDetail.link && blockedDetail.linkContentWidth
      && blockedDetail.destination === 'Ronin Lab' && blockedDetail.restingDestinations === 0;
    if (blockedOK) ok(`${label}: blocked detail retains controls, exact disabled Launch, adjacent Held/disclosure/link, and selected-only destination`);
    else bad(`${label}: blocked detail contract mismatch ${JSON.stringify(blockedDetail)}`);
  }

  const before = await page.evaluate(() => performance.timeOrigin);
  await page.locator('.ui-bar-place-toggle').click();
  await page.waitForSelector('[data-workspace-view="campaign"]:not([hidden])');
  await page.locator('.ui-bar-place-toggle').click();
  await page.waitForSelector('[data-workspace-view="setup"]:not([hidden])');
  const after = await page.evaluate(() => performance.timeOrigin);
  if (before === after) ok(`${label}: Setup/Settings toggle does not reboot the application`);
  else bad(`${label}: Setup/Settings toggle reloaded the document`);

  await page.locator('.ui-bar-place-toggle').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-workspace-view="campaign"]:not([hidden])');
  ok(`${label}: island toggle is keyboard operable`);

  await page.goto(`${URL_.replace(/#.*$/, '')}#/setup`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(ARTIFACTS, `${label.replaceAll(' ', '-')}.png`), fullPage: true });
  if (!errors.length && !failed.length) ok(`${label}: no console exceptions or failed requests`);
  else bad(`${label}: runtime errors ${JSON.stringify({ errors, failed })}`);
  await ctx.close();
}

async function customizePass(browser, source, activation = 'pointer') {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  const launches = [];
  ctx.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/(launch|team-rosters)(?:$|\?)/.test(request.url())) launches.push(request.url());
  });
  await page.route('**/api/setup/runtime', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ activated_count: 1, activated_band: 'one', providers: [{ id: 'anthropic', label: 'Claude', installed: true, activated: true, state: 'activated' }], roots: [], gbrain: { active: true }, services: { active: true } }) }));
  await page.goto(`${URL_.replace(/#.*$/, '')}#/${source}`, { waitUntil: 'networkidle' });
  if (source === 'cowork') {
    await page.locator('.wk-workbench-selector-cards .wk-card').filter({ hasText: 'Presets' }).first().click();
    await page.waitForSelector('[data-workbench-surface="setup.presets"] .sp-slot');
  } else await page.waitForSelector('[data-workspace-view="setup"]:not([hidden]) .sp-slot');
  const message = `${source} exact Customize message`;
  await page.locator('.sp-detail textarea').fill(message);
  const before = await page.evaluate(() => ({ url: location.href, state: sessionStorage.getItem('ronin.workspace.v2') }));
  const popupPromise = page.waitForEvent('popup');
  const customize = page.locator('.sp-detail button').filter({ hasText: /^Customize$/ });
  if (activation === 'keyboard') { await customize.focus(); await page.keyboard.press('Enter'); }
  else await customize.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('networkidle');
  await popup.waitForSelector('[data-workspace-view="launch"]:not([hidden])');
  const destination = await popup.evaluate(() => ({
    url: location.href,
    seed: JSON.parse(sessionStorage.getItem('ronin.workspace.v2') || '{}')?.views?.launch?.customize,
    surface: document.querySelector('[data-workspace-view="launch"]:not([hidden]) [data-workbench-surface]')?.getAttribute('data-workbench-surface'),
    selectedTemplate: document.querySelector('[data-workspace-view="launch"]:not([hidden]) .fs-tmpl[aria-pressed="true"] b')?.textContent?.trim(),
    message: document.querySelector('[data-workspace-view="launch"]:not([hidden]) textarea')?.value,
  }));
  const after = await page.evaluate(() => ({ url: location.href, state: sessionStorage.getItem('ronin.workspace.v2') }));
  const exact = before.url === after.url && before.state === after.state && ctx.pages().length === 2
    && /#\/launch$/.test(destination.url) && destination.surface === 'launch.team'
    && destination.selectedTemplate === 'Bare Metal' && destination.message === message
    && destination.seed == null && launches.length === 0;
  if (exact) ok(`${source} ${activation}: Customize opens one exact preloaded Team configuration tab, restores source byte-for-byte, clears seed, and launches nothing`);
  else bad(`${source} ${activation}: Customize new-tab contract mismatch ${JSON.stringify({ before, after, pages: ctx.pages().length, destination, launches })}`);
  if (source === 'setup' && activation === 'pointer') {
    const interactiveBoundary = await page.evaluate(() => {
      const cell = document.querySelector('[data-workspace-view="setup"]:not([hidden]) .wk-workbench-cell[data-workspace="workspace2"]');
      const cases = [
        ['button', {}], ['input', {}], ['select', {}], ['textarea', {}],
        ['a', { href: '#boundary' }], ['summary', {}], ['div', { contenteditable: 'true' }],
        ...['button', 'checkbox', 'combobox', 'link', 'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'slider', 'spinbutton', 'switch', 'tab', 'textbox']
          .map((role) => ['div', { role }]),
      ];
      return cases.map(([tag, attrs]) => {
        const target = document.createElement(tag);
        for (const [name, value] of Object.entries(attrs)) target.setAttribute(name, value);
        cell?.append(target);
        target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        const selected = JSON.parse(sessionStorage.getItem('ronin.workspace.v2') || '{}')?.views?.setup?.selected;
        target.remove();
        return { tag, attrs, selected };
      });
    });
    const escaped = interactiveBoundary.filter(({ selected }) => selected !== 'workspace1');
    if (!escaped.length) ok('setup: native, link, summary, contenteditable, and standard ARIA interactive descendants preserve WS1');
    else bad(`setup: interactive descendant boundary selected WS2 ${JSON.stringify(escaped)}`);
    await page.locator('[data-workspace-view="setup"]:not([hidden]) .wk-workbench-cell[data-workspace="workspace2"]').click({ position: { x: 2, y: 2 } });
    const groundSelected = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ronin.workspace.v2') || '{}')?.views?.setup?.selected);
    if (groundSelected === 'workspace2') ok('setup: bare WS2 ground still selects WS2');
    else bad(`setup: bare WS2 ground selection failed (${groundSelected})`);
  }
  await ctx.close();
}

async function presetContentPass(browser) {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.route('**/api/setup/runtime', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      activated_count: 1, activated_band: 'one',
      providers: [{ id: 'anthropic', label: 'Claude', installed: true, activated: true, state: 'activated' }],
      roots: [{ id: 'ronin_project_1', name: 'ronin_project_1', label: 'Ronin Project 1' }],
      gbrain: { installed: true, active: true }, services: { installed: true, active: true },
    }),
  }));
  await page.goto(`${URL_.replace(/#.*$/, '')}#/setup`, { waitUntil: 'networkidle' });
  const expectedGroups = [
    ['Choose the model for each session'], ['Which project'],
    ['Which project', 'Split the work · each feature agent gets its own worktree'], ['Launch as'],
    ['Tell each agent what you want'], ['When', 'Deliver to', 'Start active'],
    ['Which folder', 'Which document'],
  ];
  const results = [];
  for (let index = 0; index < PRESET_COPY.length; index += 1) {
    await page.locator('.sp-slot').nth(index).click();
    results.push(await page.locator('.sp-detail').evaluate((detail) => ({
      title: detail.querySelector('h3')?.textContent?.trim(),
      copy: detail.querySelector('.sp-description')?.textContent?.trim(),
      labels: [...detail.querySelectorAll('.sp-controls .sp-control-label,.sp-controls .sp-field')].map((node) => node.childNodes[0]?.textContent?.trim()).filter(Boolean),
      healthAsks: detail.querySelectorAll('.sp-row-ask input[aria-label^="Ask for "]').length,
      healthProviders: detail.querySelectorAll('.sp-row-ask select').length,
    })));
  }
  const copyOK = results.every((row, index) => row.title === PRESET_COPY[index][0] && row.copy === PRESET_COPY[index][1]);
  const groupsOK = results.every((row, index) => expectedGroups[index].every((label) => row.labels.includes(label)));
  const healthOK = results[4]?.healthAsks === 3 && results[4]?.healthProviders === 0;
  const glyphs = await page.locator('.sp-slot .sp-glyph').evaluateAll((nodes) => nodes.map((node) => ({
    text: node.textContent?.trim(), viewBox: node.querySelector('svg')?.getAttribute('viewBox'),
    stroke: node.querySelector('svg')?.getAttribute('stroke'), width: node.querySelector('svg')?.getAttribute('stroke-width'),
    cap: node.querySelector('svg')?.getAttribute('stroke-linecap'), rects: node.querySelectorAll('rect').length,
    path: node.querySelector('path')?.getAttribute('d') || '',
  })));
  const glyphOK = glyphs.length === 7 && glyphs.every((glyph, index) => index === 3
    ? glyph.text === '人'
    : glyph.viewBox === '0 0 32 32' && glyph.stroke === 'currentColor' && glyph.width === '2' && glyph.cap === 'square');
  if (copyOK && groupsOK && healthOK && glyphOK) ok('all seven selected details repeat exact copy and expose the approved component and glyph contracts');
  else bad(`preset selected-detail/component/glyph mismatch ${JSON.stringify({ results, glyphs, copyOK, groupsOK, healthOK, glyphOK })}`);
  await ctx.close();
}

const browser = await playwright.chromium.launch({ headless: true });
try {
  for (const count of [0, 1, 2]) await runtimeBand(browser, count);
  await setupPass(browser, { phone: false, theme: 'light', reducedMotion: 'no-preference', providerCount: 0 });
  await setupPass(browser, { phone: false, theme: 'light', reducedMotion: 'no-preference', providerCount: 2 });
  await setupPass(browser, { phone: false, theme: 'light', reducedMotion: 'no-preference', providerCount: 1, ready: true });
  await setupPass(browser, { phone: false, theme: 'dark', reducedMotion: 'reduce' });
  await setupPass(browser, { phone: true, theme: 'light', reducedMotion: 'no-preference' });
  await setupPass(browser, { phone: true, theme: 'dark', reducedMotion: 'reduce' });
  await presetContentPass(browser);
  await customizePass(browser, 'setup', 'pointer');
  await customizePass(browser, 'setup', 'keyboard');
  await customizePass(browser, 'cowork', 'pointer');
  await customizePass(browser, 'cowork', 'keyboard');
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`setup-ui: FAILED (${failures.length})`);
  process.exit(1);
}
console.log(`setup-ui: passed; screenshots in ${ARTIFACTS}`);
