import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adapter = await readFile(new URL('../public/js/agent-composition.js', import.meta.url), 'utf8');
const form = await readFile(new URL('../public/js/new-agent.js', import.meta.url), 'utf8');
const routes = await readFile(new URL('../src/routes/sessions-api.ts', import.meta.url), 'utf8');
const configuration = await readFile(new URL('../src/agent-configuration.ts', import.meta.url), 'utf8');
const tilehead = await readFile(new URL('../public/js/tilehead.js', import.meta.url), 'utf8');
const launchRoute = await readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8');

test('Configuration is the New Agent form in existing-Agent mode', () => {
  assert.match(adapter, /createNewAgentView\(WorkspaceKit, \{ configure: agent, embedded: true \}\)/);
  assert.doesNotMatch(adapter, /ask\(|createStep\(|createField/);
  assert.match(form, /configure \? t\('agent_composition\.send', 'Send'\) : t\('forms\.launch', 'Launch'\)/);
  assert.match(form, /box\.disabled = !!configure/);
  assert.match(form, /TYPES\(\)\.filter\(\(row\) => !configure \|\| row\.key === draft\.type\)/);
  for (const field of ['provider', 'model', 'root', 'launchMode']) assert.match(form, new RegExp(`key: '${field}'[^\\n]*fixed: !!configure`));
  assert.match(form, /key: 'agentId'[\s\S]*fixed: true/);
  assert.match(form, /questions\.show\(\['provider', 'model', 'role', 'reach', 'recruit', 'output', 'root', 'launchMode'\]\)/);
  assert.match(form, /row\.requires\?\.includes\('role:epic_lead'\)[\s\S]*draft\.role === 'epic_lead'/);
  assert.match(form, /row\.requires\?\.includes\('role:coordinator'\)[\s\S]*draft\.role === 'coordinator'/);
  assert.match(form, /row\.requires\?\.includes\('lead'\)[\s\S]*draft\.role === 'lead'/);
  assert.match(form, /request\(`\/api\/sessions\/\$\{encodeURIComponent\(configure\)\}\/composition`/);
  assert.match(form, /request\(`\/api\/sessions\/\$\{encodeURIComponent\(configure\)\}\/configuration`, \{ method: 'PUT', json: configurationValue\(\) \}\)/);
  assert.match(form, /if \(embedded && !configure\)/, 'Configuration puts no action in its body');
  assert.match(tilehead, /overTile\(tile, t\('me\.configuration', 'Configuration'\)[\s\S]*actions: \[reader\.action\]/, 'Send belongs to the Configuration overlay head');
  for (const field of ['session_type', 'provider', 'model', 'objective', 'title', 'role', 'team', 'mandate', 'behaviours']) assert.match(form, new RegExp(field));
  assert.doesNotMatch(form, /hiddenBehaviours/);
});

test('Send rebuilds one brief and sends one message', () => {
  assert.match(routes, /app\.put\('\/api\/sessions\/:name\/configuration'/);
  assert.equal((configuration.match(/enqueueMessage\(/g) || []).length, 1);
  assert.match(configuration, /resolveReading\(form, await resolveFacts\(form, new Set\(\)\)\)/);
  assert.match(configuration, /writeCurrentRole\(name, next\.role\)[\s\S]*configurationReading\(name\)/, 'Send stores the role before rebuilding its conditional reading');
  assert.match(launchRoute, /compileBirthBriefAt\([\s\S]*writeCurrentRoleAt\(birthDir,[^\n]+\)/, 'birth stores the role fact after the birth brief creates its record directory');
  for (const writer of ['writeObjective', 'setSessionTitle', 'setTags', 'setLeads', 'writeMandate', 'writeCurrentBehaviours', 'writeCurrentRole']) assert.match(configuration, new RegExp(writer));
});
