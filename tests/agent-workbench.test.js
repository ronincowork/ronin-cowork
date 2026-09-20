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

test('Agent profile reuses Self, pure Documents, membership, Task Manager and generic surfaces', async () => {
  const [text, catalog] = await Promise.all([source('agent-view.js'), source('workbench-catalog.js')]);
  assert.match(text, /self: WORKBENCH_TYPES\.terminal/);
  assert.match(text, /registerWorkbenchCatalog\(\)/);
  assert.doesNotMatch(text, /profiles\.define|library\.register/, 'Agent owns no private profile or catalog');
  assert.match(catalog, /profiles\.define\(WORKBENCH_PROFILES\.agent, \[WORKBENCH_TYPES\.terminal, WORKBENCH_TYPES\.agentDocuments, WORKBENCH_TYPES\.agentTeams, WORKBENCH_TYPES\.agentTasks, WORKBENCH_TYPES\.document, FEEDBACK_TYPE\]\)/);
  assert.match(text, /sessions: \(\) => agent \? \[\{ key: agent, label: t\('agent\.self', 'Self'\) \}\] : \[\]/);
  assert.match(text, /terminal: \(id, detail\) =>/);
  assert.match(text, /createWarmTerminalPool/);
  assert.doesNotMatch(text, /createTabbedSurface/);
  assert.match(text, /createSurface\(\{ label: t\('workspace\.tab_docs', 'Documents'\)/);
  assert.match(text, /createTeamKanban/);
  assert.match(text, /setTeamMembership/);
  assert.doesNotMatch(text, /request\([^\n]*\/teams[^\n]*membership/);
});

test('Agent first-open and structured seats use the ordinary terminal surface token', async () => {
  const text = await source('agent-view.js');
  assert.match(text, /workspace1: \{ type: TYPES\.self, key: agent \}/);
  assert.match(text, /workspace2: \{ type: TYPES\.documents, key: agent \}/);
  assert.match(text, /context\.workbenchEntry\(defaults\)/);
  assert.match(text, /normalizeWorkbenchState\(state, bench\.declaration\)/);
});

test('Agent dismissal persists an intentional empty seat and does not reseed on refresh', async () => {
  const text = await source('agent-view.js');
  assert.match(text, /change\?\.dismissed[\s\S]*DISMISSED_WORKSPACE/);
});
