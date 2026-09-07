import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');

test('Launch your own is exactly one shared Template, Team, Agent consumer', () => {
  const launchOwn = source.slice(source.indexOf('function createLaunchOwnSurface'), source.indexOf('export function setupSurfaceDefinitions'));
  assert.match(launchOwn, /createStoneWorkSurface\(/);
  assert.match(launchOwn, /stones\.mount\(body\)/);
  assert.deepEqual([...launchOwn.matchAll(/id: '(template|team|agent)'/g)].map((match) => match[1]), ['template', 'team', 'agent']);
  assert.doesNotMatch(launchOwn, /setup-launch-own-stones|setup-launch-stone|openTemplateLaunchForm|openLaunchForm/);
});

test('selected details mount only the existing real form factories', () => {
  assert.match(source, /import \{ createNewTeamFormView \} from '\.\/new-team-form\.js'/);
  assert.match(source, /import \{ createNewAgentView \} from '\.\/new-agent\.js'/);
  assert.match(source, /item\.id === 'template'[\s\S]*createNewAgentView\(WorkspaceKit, \{\}\), createNewTeamFormView\(WorkspaceKit, \{\}\)/);
  assert.match(source, /for \(const view of views\) void view\.enter\(\{\}\)/);
  assert.match(source, /return \(\) => \{ for \(const view of views\) view\.el\.remove\(\); \}/);
});

test('Launch your own has no consumer geometry or obsolete card-grid CSS', () => {
  assert.doesNotMatch(css, /\.setup-launch-own(?:-surface)?\s+\.sws-(?:rail|grid|detail)/);
  assert.doesNotMatch(css, /\.setup-launch-own-stones|\.setup-launch-stone/);
});
