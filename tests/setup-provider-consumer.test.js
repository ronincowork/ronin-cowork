import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { providerPresentation, providerReadiness } = await import('../public/js/setup-provider-state.js');
const source = await readFile(new URL('../public/js/provider-surface.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');

test('provider stone states are the short SETUP_WORKBENCH words and keep lifecycle truth', () => {
  const cases = [
    [{ id: 'anthropic', installed: true, activated: true }, 'Activated', 'none'],
    [{ id: 'anthropic', installed: true, login_open: true }, 'Sign-in open', 'login_open'],
    [{ id: 'anthropic', installed: true }, 'Needs sign-in', 'sign_in'],
    [{ id: 'grok', installable: true }, 'Not installed', 'install'],
    [{ id: 'hermes' }, 'Manual install', 'manual'],
  ];
  for (const [provider, inventoryState, action] of cases) {
    const presentation = providerPresentation(provider);
    assert.equal(presentation.inventoryState, inventoryState);
    assert.equal(presentation.action, action);
    assert.ok(inventoryState.length <= 14);
  }
});

test('installed providers say what Authenticate does; signed-in providers say what Ronin measured', () => {
  for (const [id, label] of [['claude', 'Claude Code'], ['codex', 'Codex'], ['gemini', 'Gemini CLI']]) {
    const detail = providerPresentation({ id, label, installed: true }).detail;
    assert.equal(detail, `Opens ${label} in a tile here. Follow its sign-in, then press Done.`);
  }
  const measured = providerPresentation({ id: 'claude', label: 'Claude Code', from: 'Anthropic', installed: true, activated: true, signed_in: true, activated_at: null });
  assert.equal(measured.inventoryState, 'Activated');
  // Off: the owner's word, and the sentence that keeps the sign-in from looking lost.
  const off = providerPresentation({ id: 'codex', label: 'Codex', installed: true, signed_in: true, activated: false, off: true });
  assert.equal(off.inventoryState, 'Off');
  assert.equal(off.detail, 'Turned off — Ronin is not using Codex. Your sign-in is kept.');
  assert.equal(off.action, 'off');
  const offSteps = providerReadiness({ id: 'codex', label: 'Codex', installed: true, signed_in: true, activated: false, off: true });
  assert.deepEqual(offSteps.map((step) => [step.key, step.status, step.done, step.current, step.action]), [
    ['installed', 'installed', true, false, 'none'],
    ['authenticated', 'recorded', true, false, 'none'],
    ['ready', 'off', false, true, 'turn_on'],
  ], 'off: the sign-in still reads as recorded and owns no control; Ready is the one current step and Turn on its control');
  assert.equal(measured.detail, 'Anthropic credentials are on this machine.');
  const recorded = providerPresentation({ id: 'codex', label: 'Codex', installed: true, activated: true, signed_in: false, activated_at: '2026-09-07T11:02:00.000Z' });
  assert.equal(recorded.detail, 'Sign-in recorded 2026-09-07. Codex asks again itself if it ever needs to.');
  const open = providerPresentation({ id: 'codex', label: 'Codex', installed: true, login_open: true });
  assert.equal(open.detail, 'Finish signing in to Codex in the tile, then press Done. Close keeps things as they were.');
  assert.doesNotMatch(open.detail + recorded.detail + measured.detail, /Done \/ Close records/);
});

test('Grok states the global npm install and carries the exact command separately', () => {
  const result = providerPresentation({ id: 'grok', label: 'Grok CLI', installable: true, install: 'npm install -g @xai-official/grok' });
  assert.equal(result.action, 'install');
  assert.equal(result.detail, 'Installs globally with npm.');
  assert.equal(result.command, 'npm install -g @xai-official/grok');
});

test('Hermes has one explicit manual route instead of a prose dead end', () => {
  const result = providerPresentation({ id: 'hermes', label: 'Hermes', blocked: 'Install Hermes manually.' });
  assert.equal(result.action, 'manual');
  assert.equal(result.detail, 'Install Hermes manually.');
  assert.equal(result.manual.label, 'Install guide');
  assert.match(result.manual.url, /NousResearch\/hermes-agent/);
});

test('future providers retain an honest fallback without generic credential copy', () => {
  const installed = providerPresentation({ id: 'future', label: 'Future CLI', installed: true });
  assert.equal(installed.action, 'sign_in');
  assert.equal(installed.detail, 'Opens Future CLI in a tile here. Follow its sign-in, then press Done.');
  assert.doesNotMatch(source, /Add a model provider\./);
  assert.doesNotMatch(source, /credentials, an API key, a subscription, device login, or trust approval/);
  assert.doesNotMatch(source, /Each provider signs you in its own way/);
  assert.match(source, /\/done/);
  assert.match(source, /\/close/);
  assert.match(source, /mountProviderAttachment/);
});

test('provider readiness is three measured steps: Install, Authenticate, Ready', () => {
  const cases = [
    [{ id: 'grok', label: 'Grok CLI', installable: true }, ['not_installed', 'blocked', 'not_ready']],
    [{ id: 'hermes', label: 'Hermes' }, ['not_installed', 'blocked', 'not_ready']],
    [{ id: 'codex', label: 'Codex', installed: true }, ['installed', 'available', 'not_ready']],
    [{ id: 'codex', label: 'Codex', installed: true, login_open: true }, ['installed', 'open', 'not_ready']],
    [{ id: 'codex', label: 'Codex', installed: true, activated: true, signed_in: true }, ['installed', 'recorded', 'ready']],
    [{ id: 'codex', label: 'Codex', installed: true, activated: true, activated_at: '2026-09-07T11:02:00.000Z' }, ['installed', 'recorded', 'ready']],
  ];
  for (const [provider, statuses] of cases) {
    const steps = providerReadiness(provider);
    assert.deepEqual(steps.map((step) => step.label), ['Install', 'Authenticate', 'Ready']);
    assert.deepEqual(steps.map((step) => step.status), statuses);
  }
});

test('each readiness step carries only its own short line and never the install path', () => {
  const grok = providerReadiness({ id: 'grok', label: 'Grok CLI', installable: true, install: 'npm install -g @xai-official/grok' });
  assert.equal(grok[0].command, 'npm install -g @xai-official/grok');
  assert.equal(grok[0].detail, 'Installs globally with npm.');
  assert.equal(grok[1].detail, '');
  assert.equal(grok[2].detail, 'After sign-in.');
  const codex = providerReadiness({ id: 'codex', label: 'Codex', from: 'OpenAI', installed: true, path: '/usr/local/bin/codex' });
  assert.equal(codex[0].detail, '', 'an installed provider shows no path');
  assert.equal(codex[0].command, '');
  assert.match(codex[1].detail, /Opens Codex in a tile here/);
  const ready = providerReadiness({ id: 'codex', label: 'Codex', installed: true, activated: true, signed_in: true });
  assert.equal(ready[1].detail, 'Codex credentials are on this machine.');
  assert.equal(ready[2].detail, '');
  for (const steps of [grok, codex, ready]) for (const step of steps) assert.ok((step.detail || '').split('. ').length <= 2, `${step.key}: ${step.detail}`);
});

test('the surface renders the three steps from providerReadiness with real controls and visible errors', () => {
  const providerSurface = source.slice(source.indexOf('function createProviderSurface'));
  assert.match(providerSurface, /const steps = providerReadiness\(provider\)/);
  assert.match(providerSurface, /const \[install, auth, ready\] = steps/);
  assert.doesNotMatch(providerSurface, /Use with Ronin|checkbox|api\/setup\/preferences/);
  assert.match(source, /setup-provider-step/);
  assert.match(source, /setup-provider-command/);
  assert.match(source, /setup-provider-problem/);
  assert.doesNotMatch(source, /step_complete|Complete/);
  assert.doesNotMatch(source, /notify\(|flash/i);
});

test('every step carries done and exactly one current step, the first unmet one', () => {
  const cases = [
    [{ id: 'grok', label: 'Grok CLI', installable: true }, 'installed'],
    [{ id: 'hermes', label: 'Hermes' }, 'installed'],
    [{ id: 'codex', label: 'Codex', installed: true }, 'authenticated'],
    [{ id: 'codex', label: 'Codex', installed: true, login_open: true }, 'authenticated'],
    [{ id: 'codex', label: 'Codex', installed: true, activated: true }, null],
  ];
  for (const [provider, current] of cases) {
    const steps = providerReadiness(provider);
    assert.deepEqual(steps.filter((step) => step.current).map((step) => step.key), current ? [current] : []);
    for (const step of steps) assert.equal(typeof step.done, 'boolean');
    assert.equal(steps.find((step) => !step.done)?.key ?? null, current);
  }
});

test('provider steps adapt to the shared stone surface width with one control size', () => {
  assert.doesNotMatch(css, /setup-provider-action-control \{[^}]*repeat\(2, 10rem\)/);
  assert.match(css, /\.setup-provider-action \{[^}]*flex: 0 0 10rem/);
  assert.match(css, /@container setup-stone-work-surface \(min-width: [^)]+\) \{\s*\.setup-provider-step \{[^}]*grid-template-columns: auto minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(css, /@media \(max-width: 700px\) \{\s*\.setup-provider-step/);
  assert.match(css, /\.setup-provider-head h2 \{[^}]*font-size: var\(--text-9\)/);
  assert.match(css, /\.setup-provider-label \{[^}]*font-size: var\(--text-7\)/);
  assert.match(css, /\.setup-provider-note \{[^}]*font-size: var\(--text-5\)/);
  assert.match(css, /\.setup-provider-control > \.setup-provider-action:disabled \{[^}]*background: transparent/);
  assert.match(css, /\.setup-provider-terminal \{[^}]*min-height: max\(30rem, 78vh\)/);
  assert.match(css, /\.setup-provider-terminal \.tile > \.tile-head \{ display: none; \}/);
});
