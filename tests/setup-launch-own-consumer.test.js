import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');

test('Launch your own is exactly one shared Agent, Team, Template consumer', () => {
  const launchOwn = source.slice(source.indexOf('function createLaunchOwnSurface'), source.indexOf('export function setupSurfaceDefinitions'));
  assert.match(launchOwn, /createStoneWorkSurface\(/);
  assert.match(launchOwn, /stones\.mount\(out\.content\)/);
  assert.doesNotMatch(launchOwn, /setup-surface-body/);
  assert.deepEqual([...launchOwn.matchAll(/id: '(template|team|agent)'/g)].map((match) => match[1]), ['agent', 'team', 'template']);
  assert.doesNotMatch(launchOwn, /setup-launch-own-stones|setup-launch-stone|openTemplateLaunchForm|openLaunchForm/);
});

test('selected details mount the real forms and canonical Campaign Templates surface', () => {
  assert.match(source, /import \{ createEmbeddedNewTeamFormView \} from '\.\/new-team-form\.js'/);
  assert.match(source, /import \{ createEmbeddedNewAgentView \} from '\.\/new-agent\.js'/);
  assert.match(source, /createEmbeddedNewTeamFormView\(WorkspaceKit/);
  assert.match(source, /createEmbeddedNewAgentView\(WorkspaceKit/);
  assert.doesNotMatch(source, /createNew(?:AgentView|TeamFormView)\(WorkspaceKit/);
  assert.match(source, /item\.id === 'template'[\s\S]*createTemplatesSurface\(\)/);
  assert.doesNotMatch(source, /item\.id === 'template'[\s\S]*\[createNewAgentView/);
  assert.match(source, /for \(const view of views\) void view\.enter\(\{\}\)/);
  assert.match(source, /return \(\) => \{ for \(const view of views\) view\.el\.remove\(\); \}/);
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

test('Setup has no separate Templates selector while Campaign Templates stays canonical', async () => {
  const setupView = await readFile(new URL('../public/js/setup-view.js', import.meta.url), 'utf8');
  const order = setupView.slice(setupView.indexOf('const ORDER'), setupView.indexOf('const DEFAULT_ARRANGEMENT'));
  assert.doesNotMatch(order, /SETUP_SURFACE_TYPES\.templates/);
  assert.doesNotMatch(source, /campaignTemplatesDefinition\(\)/);
  assert.match(source, /import \{ CAMPAIGN_TEMPLATES_TYPE, createTemplatesSurface \}/);
});

test('Launch your own has no consumer geometry or obsolete card-grid CSS', () => {
  assert.doesNotMatch(css, /\.setup-launch-own(?:-surface)?\s+\.sws-(?:rail|grid|detail)/);
  assert.doesNotMatch(css, /\.setup-launch-own-stones|\.setup-launch-stone/);
});
