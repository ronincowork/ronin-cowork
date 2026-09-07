import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { providerPresentation, providerReadiness } = await import('../public/js/setup-provider-state.js');
const source = await readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
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

test('installed providers name their own sign-in from the runtime vendor and the honest auth boundary', () => {
  for (const [id, label, from] of [
    ['anthropic', 'Claude Code', 'Anthropic'],
    ['openai', 'Codex', 'OpenAI'],
    ['gemini', 'Gemini CLI', 'Google'],
  ]) {
    const detail = providerPresentation({ id, label, from, installed: true }).detail;
    assert.equal(detail, `${label} signs in to ${from} in a tile here. Done / Close records it.`);
  }
  const activated = providerPresentation({ id: 'openai', label: 'Codex', installed: true, activated: true, activated_at: '2026-09-07T11:02:00.000Z' });
  assert.equal(activated.detail, 'Recorded 2026-09-07. Sign-in stays with Codex; Ronin does not monitor it.');
  const open = providerPresentation({ id: 'openai', label: 'Codex', installed: true, login_open: true });
  assert.equal(open.detail, "Finish Codex's sign-in in the tile, then Done / Close. Close leaves it unactivated.");
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
  assert.equal(installed.detail, 'Future CLI opens its own sign-in in a tile here. Done / Close records it.');
  assert.doesNotMatch(source, /Add a model provider\./);
  assert.doesNotMatch(source, /credentials, an API key, a subscription, device login, or trust approval/);
  assert.doesNotMatch(source, /Each provider signs you in its own way/);
  assert.match(source, /\/done/);
  assert.match(source, /\/close/);
  assert.match(source, /mountProviderAttachment/);
});

test('provider readiness keeps opt-in separate from navigation and measured state', () => {
  const cases = [
    [{ id: 'grok', label: 'Grok CLI', installable: true }, false, ['off', 'not_installed', 'blocked', 'not_ready']],
    [{ id: 'hermes', label: 'Hermes' }, true, ['on', 'not_installed', 'blocked', 'not_ready']],
    [{ id: 'openai', label: 'Codex', installed: true }, true, ['on', 'installed', 'available', 'not_ready']],
    [{ id: 'openai', label: 'Codex', installed: true, login_open: true }, true, ['on', 'installed', 'open', 'not_ready']],
    [{ id: 'openai', label: 'Codex', installed: true, activated: true }, true, ['on', 'installed', 'recorded', 'ready']],
  ];
  for (const [provider, optedIn, statuses] of cases) {
    const steps = providerReadiness(provider, optedIn);
    assert.deepEqual(steps.map((step) => step.label), ['Use with Ronin', 'Install', 'Authenticate', 'Ready']);
    assert.deepEqual(steps.map((step) => step.status), statuses);
  }
});

test('each readiness row carries only its own short line', () => {
  const grok = providerReadiness({ id: 'grok', label: 'Grok CLI', installable: true, install: 'npm install -g @xai-official/grok' });
  assert.equal(grok[1].command, 'npm install -g @xai-official/grok');
  assert.equal(grok[1].detail, 'Installs globally with npm.');
  assert.equal(grok[2].detail, '');
  const codex = providerReadiness({ id: 'openai', label: 'Codex', from: 'OpenAI', installed: true, path: '/usr/local/bin/codex' });
  assert.equal(codex[1].detail, '/usr/local/bin/codex');
  assert.equal(codex[1].command, '');
  assert.match(codex[2].detail, /signs in to OpenAI/);
  const ready = providerReadiness({ id: 'openai', label: 'Codex', installed: true, activated: true, activated_at: '2026-09-07T11:02:00.000Z' });
  assert.equal(ready[2].detail, 'Recorded 2026-09-07. Sign-in stays with Codex; Ronin does not monitor it.');
  assert.equal(ready[3].detail, 'Codex is activated for Launch.');
  for (const steps of [grok, codex, ready]) for (const step of steps) assert.ok((step.detail || '').split('. ').length <= 2, `${step.key}: ${step.detail}`);
});

test('the surface renders the four rows from providerReadiness with real opt-in and matching controls', () => {
  assert.match(source, /const steps = providerReadiness\(provider, optedIn\)/);
  assert.match(source, /const \[use, install, auth, ready\] = steps/);
  assert.match(source, /checkbox\.type = 'checkbox'/);
  assert.match(source, /\/api\/setup\/preferences[\s\S]*providers: \[\.\.\.selected\]/);
  assert.match(source, /setup-provider-step/);
  assert.match(source, /setup-provider-command/);
  assert.match(source, /stones\.mount\(out\.content/);
  assert.doesNotMatch(source, /setup-surface-body setup-provider-list/);
  assert.doesNotMatch(source, /step_complete|Complete/);
  assert.doesNotMatch(source, /notify\(|flash/i);
});

test('every step carries done and exactly one current step, the first unmet one', () => {
  const cases = [
    [{ id: 'grok', label: 'Grok CLI', installable: true }, false, 'use'],
    [{ id: 'grok', label: 'Grok CLI', installable: true }, true, 'installed'],
    [{ id: 'hermes', label: 'Hermes' }, true, 'installed'],
    [{ id: 'codex', label: 'Codex', installed: true }, true, 'authenticated'],
    [{ id: 'codex', label: 'Codex', installed: true, login_open: true }, true, 'authenticated'],
    [{ id: 'codex', label: 'Codex', installed: true, activated: true }, true, null],
  ];
  for (const [provider, optedIn, current] of cases) {
    const steps = providerReadiness(provider, optedIn);
    assert.deepEqual(steps.filter((step) => step.current).map((step) => step.key), current ? [current] : []);
    for (const step of steps) assert.equal(typeof step.done, 'boolean');
    const firstUnmet = steps.find((step) => !step.done);
    assert.equal(firstUnmet?.key ?? null, current);
  }
  assert.equal(providerReadiness({ id: 'codex', installed: true }, false)[0].detail, 'Turn on to install and sign in here.');
  assert.equal(providerReadiness({ id: 'codex', installed: true }, true)[0].detail, '');
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
});
