import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { providerPresentation, providerReadiness } = await import('../public/js/setup-provider-state.js');

test('provider inventory states are short, readable, and preserve lifecycle truth', () => {
  const cases = [
    [{ id: 'anthropic', installed: true, activated: true }, 'Setup complete', 'none'],
    [{ id: 'anthropic', installed: true, login_open: true }, 'Sign-in open', 'login_open'],
    [{ id: 'anthropic', installed: true }, 'Sign-in unknown', 'sign_in'],
    [{ id: 'grok', installable: true }, 'Install available', 'install'],
    [{ id: 'hermes' }, 'Manual install', 'manual'],
  ];
  for (const [provider, inventoryState, action] of cases) {
    const presentation = providerPresentation(provider);
    assert.equal(presentation.inventoryState, inventoryState);
    assert.equal(presentation.action, action);
    assert.ok(inventoryState.length <= 17);
  }
});

test('known installed providers explain their own native sign-in and honest auth boundary', () => {
  for (const [id, label, account] of [
    ['anthropic', 'Claude Code', 'Anthropic'],
    ['openai', 'Codex', 'OpenAI'],
    ['gemini', 'Gemini CLI', 'Google'],
  ]) {
    const detail = providerPresentation({ id, label, installed: true }).detail;
    assert.match(detail, new RegExp(`${label} handles ${account} account sign-in`));
    assert.match(detail, /Ronin has not recorded setup completion yet/);
  }
  const activated = providerPresentation({ id: 'openai', label: 'Codex', installed: true, activated: true, activated_at: '2026-09-07' });
  assert.match(activated.detail, /recorded Codex setup completion on 2026-09-07/);
  assert.match(activated.detail, /controls current authentication and may ask you to sign in again/);
});

test('Grok states global npm install impact in one line', () => {
  const result = providerPresentation({ id: 'grok', label: 'Grok CLI', installable: true, install: 'npm install -g @xai-official/grok' });
  assert.equal(result.action, 'install');
  assert.equal(result.detail, 'Installs Grok CLI globally with npm: npm install -g @xai-official/grok');
});

test('Hermes has one explicit manual route instead of a prose dead end', () => {
  const result = providerPresentation({ id: 'hermes', label: 'Hermes', blocked: 'Install Hermes manually.' });
  assert.equal(result.action, 'manual');
  assert.equal(result.manual.label, 'Open Hermes install guide');
  assert.match(result.manual.url, /NousResearch\/hermes-agent/);
});

test('future providers retain an honest fallback without generic credential copy', async () => {
  const installed = providerPresentation({ id: 'future', label: 'Future CLI', installed: true });
  assert.equal(installed.action, 'sign_in');
  assert.match(installed.detail, /Future CLI handles account sign-in in its native setup/);
  const source = await readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Add a model provider\./);
  assert.doesNotMatch(source, /credentials, an API key, a subscription, device login, or trust approval/);
  assert.doesNotMatch(source, /Each provider signs you in its own way/);
  assert.match(source, /\/done/);
  assert.match(source, /\/close/);
  assert.match(source, /mountProviderAttachment/);
});

test('every selected provider follows the same four-step readiness path', () => {
  const cases = [
    [{ id: 'grok', label: 'Grok CLI', installable: true }, ['complete', 'current', 'pending', 'pending'], 'install'],
    [{ id: 'hermes', label: 'Hermes' }, ['complete', 'current', 'pending', 'pending'], 'manual'],
    [{ id: 'openai', label: 'Codex', installed: true }, ['complete', 'complete', 'current', 'pending'], 'sign_in'],
    [{ id: 'openai', label: 'Codex', installed: true, login_open: true }, ['complete', 'complete', 'current', 'pending'], 'login_open'],
    [{ id: 'openai', label: 'Codex', installed: true, activated: true }, ['complete', 'complete', 'complete', 'complete'], null],
  ];
  for (const [provider, statuses, nextAction] of cases) {
    const steps = providerReadiness(provider);
    assert.deepEqual(steps.map((step) => step.label), ['Use with Ronin', 'Installed', 'Authenticated', 'Ready']);
    assert.deepEqual(steps.map((step) => step.status), statuses);
    assert.deepEqual(steps.filter((step) => step.action !== 'none').map((step) => step.action), nextAction ? [nextAction] : []);
  }
});

test('provider instructions stay under the relevant readiness step', () => {
  const grok = providerReadiness({ id: 'grok', label: 'Grok CLI', installable: true, install: 'npm install -g @xai-official/grok' });
  assert.match(grok[1].detail, /globally with npm/);
  assert.equal(grok[2].detail, '');
  const codex = providerReadiness({ id: 'openai', label: 'Codex', installed: true });
  assert.match(codex[2].detail, /OpenAI account sign-in/);
  assert.doesNotMatch(codex[1].detail, /sign-in/);
  const ready = providerReadiness({ id: 'openai', label: 'Codex', installed: true, activated: true });
  assert.match(ready[2].detail, /not monitored/);
  assert.match(ready[3].detail, /activated for Launch/);
});
