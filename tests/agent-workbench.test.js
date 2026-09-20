import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WORKSPACE_DESTINATIONS } from '../public/js/workspace-contract.js';

const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

test('Agent is a first-class Workbench destination with its own state namespace', async () => {
  assert.ok(WORKSPACE_DESTINATIONS.includes('agent'));
  const [main, workspace] = await Promise.all([source('main.js'), source('workspace.js')]);
  assert.match(main, /workspace\.register\('agent', createAgentView\(\)\)/);
  assert.match(workspace, /views: \{[^\n]*agent: \{\}/);
});

test('Agent profile reuses the shared Self, Commons, membership, Task Manager and generic surfaces', async () => {
  const text = await source('agent-view.js');
  assert.match(text, /self: 'session\.terminal'/);
  assert.match(text, /profiles\.define\(PROFILE, \[TYPES\.self, TYPES\.commons, TYPES\.teams, TYPES\.tasks, TYPES\.document, FEEDBACK_TYPE\]\)/);
  assert.match(text, /sessions: \(\) => agent \? \[\{ key: agent, label: agent \}\] : \[\]/);
  assert.match(text, /terminal: \(id, detail\) =>/);
  assert.match(text, /createWarmTerminalPool/);
  assert.match(text, /createTabbedSurface/);
  assert.match(text, /createTeamKanban/);
  assert.match(text, /setTeamMembership/);
  assert.doesNotMatch(text, /request\([^\n]*\/teams[^\n]*membership/);
});

test('Agent first-open and structured seats use the ordinary terminal surface token', async () => {
  const text = await source('agent-view.js');
  assert.match(text, /workspace1: \{ type: TYPES\.self, key: agent \}/);
  assert.match(text, /workspace2: \{ type: TYPES\.commons, key: agent \}/);
  assert.match(text, /context\.workbenchEntry\(defaults\)/);
  assert.match(text, /normalizeWorkbenchState\(state, bench\.declaration\)/);
});

test('Agent dismissal persists an intentional empty seat and does not reseed on refresh', async () => {
  const text = await source('agent-view.js');
  assert.match(text, /change\?\.dismissed[\s\S]*DISMISSED_WORKSPACE/);
});
