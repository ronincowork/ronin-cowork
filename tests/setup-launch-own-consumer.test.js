import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');

test('Launch your own hides Presets in Settings and retains them in Setup', () => {
  const launchOwn = source.slice(source.indexOf('function createLaunchOwnSurface'), source.indexOf('export function setupSurfaceDefinitions'));
  assert.match(launchOwn, /createPhalanx\(/);
  assert.match(launchOwn, /stones\.mount\(out\.content\)/);
  assert.doesNotMatch(launchOwn, /setup-surface-body/);
  assert.match(launchOwn, /context\.tenant\?\.kind === 'setup'/);
  assert.match(launchOwn, /\.\.\.\(setup \? \[\{ id: 'preset'/);
  assert.doesNotMatch(launchOwn, /setup-launch-own-stones|setup-launch-stone|openTemplateLaunchForm|openLaunchForm/);
});

test('selected details mount the real forms and Setup Presets surface', () => {
  assert.match(source, /import \{ createEmbeddedNewTeamFormView \} from '\.\/new-team-form\.js'/);
  assert.match(source, /import \{ createEmbeddedNewAgentView \} from '\.\/new-agent\.js'/);
  assert.match(source, /createEmbeddedNewTeamFormView\(WorkspaceKit/);
  assert.match(source, /createEmbeddedNewAgentView\(WorkspaceKit/);
  assert.doesNotMatch(source, /createNew(?:AgentView|TeamFormView)\(WorkspaceKit/);
  assert.match(source, /item\.id === 'preset'[\s\S]*context\.workbench\?\.place\(PRESETS_TYPE/);
});

test('Agent and Team details use form-only adapters without consumer geometry overrides', async () => {
  const [agent, team, launchCss] = await Promise.all([
    readFile(new URL('../public/js/new-agent.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/new-team-form.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/css/launch-forms.css', import.meta.url), 'utf8'),
  ]);
  for (const form of [agent, team]) {
    assert.match(form, /header: !embedded/);
    assert.match(form, /el: embedded \? surface\.content : surface\.el/);
    assert.match(form, /launch-form-embed-actions/);
  }
  assert.doesNotMatch(launchCss, /setup-launch-own[^}]*\.sws-(?:rail|grid|detail)/);
});

test('Setup has no separate Presets selector', async () => {
  const setupView = await readFile(new URL('../public/js/setup-view.js', import.meta.url), 'utf8');
  const order = setupView.slice(setupView.indexOf('const ORDER'), setupView.indexOf('const ARRANGEMENT'));
  assert.doesNotMatch(order, /SETUP_SURFACE_TYPES\.presets/);
  assert.doesNotMatch(source, /campaignTemplatesDefinition\(\)|createTemplatesSurface\(\)/);
  assert.match(source, /PRESETS_TYPE/);
});

test('Launch your own has no consumer geometry or obsolete card-grid CSS', () => {
  assert.doesNotMatch(css, /\.setup-launch-own(?:-surface)?\s+\.sws-(?:rail|grid|detail)/);
  assert.doesNotMatch(css, /\.setup-launch-own-stones|\.setup-launch-stone/);
});
