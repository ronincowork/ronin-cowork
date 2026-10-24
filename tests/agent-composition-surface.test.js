import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ui = await readFile(new URL('../public/js/agent-composition.js', import.meta.url), 'utf8');
const routes = await readFile(new URL('../src/routes/sessions-api.ts', import.meta.url), 'utf8');
const behaviours = await readFile(new URL('../src/behaviours.ts', import.meta.url), 'utf8');
const configuration = await readFile(new URL('../src/agent-configuration.ts', import.meta.url), 'utf8');
const tegami = await readFile(new URL('../src/tegami.ts', import.meta.url), 'utf8');
const members = await readFile(new URL('../public/js/team-members.js', import.meta.url), 'utf8');
const tilehead = await readFile(new URL('../public/js/tilehead.js', import.meta.url), 'utf8');
const formSteps = await readFile(new URL('../public/js/form-steps.js', import.meta.url), 'utf8');

test('Agent composition uses the shared selector and preserves many-valued Output', () => {
  assert.match(ui, /import \{ ask \} from '\.\/ask\.js'/);
  assert.doesNotMatch(ui, /document\.createElement\(['"]select/);
  assert.match(ui, /key: 'output'.*many: true/);
  assert.match(ui, /json: value\(\)/);
  assert.doesNotMatch(ui, /output\?\.\[0\]/);
});

// UPDATE (owner, 2026-10-24): one act on the Configuration body, disabled until something changed;
// pressed, it writes the configuration, rebuilds the brief and tells the Agent once. The brief is
// built from the facts and the reading alone: nothing launch-related is in its way.
test('Configuration is what the Agent is set to and what you can change: one list, one act (owner, 2026-10-24)', () => {
  assert.match(ui, /\/configuration`, \{ method: 'PUT', json: value\(\) \}/);
  assert.match(ui, /action\.el\.disabled = JSON\.stringify\(value\(\)\) === loaded/);
  assert.match(ui, /body\.replaceChildren\(notice\.el\)/, 'the answer sits directly under the act');
  assert.match(ui, /const list = readingRows\(\[\s*\.\.\.fixed\.map\(\(row\) => line\(row, el\('div', 'ac-line', why\(row\)\)\)\),\s*\.\.\.switches\.map/, 'one reading-row list of this Agent\'s behaviours: a plain reason or a switch');
  assert.match(ui, /switch: true, compact: true/, 'the switch is the kit\'s compact one: the track alone, its label spoken');
  assert.match(ui, /switch: true/, 'an optional behaviour carries the kit\'s on/off switch');
  assert.match(ui, /'ronin:read-document'/, 'the name reads its page through the one reader');
  assert.doesNotMatch(ui, /agent_composition\.(brief|always|because|chosen)'|shape: 'tall'|exposed: true|composition\/brief|composition\/mandate|composition\/behaviours|resend/i);
  assert.match(formSteps, /if \(label instanceof Node\) dt\.append\(label\)/, 'a reading-row key may be a Node, as its value may');
  assert.match(routes, /app\.put\('\/api\/sessions\/:name\/configuration'/);
  assert.doesNotMatch(routes, /composition\/brief|composition\/mandate|composition\/behaviours/);
  assert.match(configuration, /resolveReading\(form, await resolveFacts\(form, new Set\(\)\)\)/);
  assert.doesNotMatch(configuration, /resolveForm|launch_mode|cmd:/, 'a brief rebuild never resolves a launch');
  assert.equal((configuration.match(/enqueueMessage\(/g) || []).length, 1, 'one message: the new brief');
  assert.match(configuration, /Your configuration changed\. Here is your new brief/);
  assert.match(tegami, /export async function writeMandate\(name: string, current: Mandate\): Promise<Mandate>/, 'the mandate write carries no notice of its own');
  assert.match(members, /actions: \[composition\.action, rename, lead, eject, close\]/);
  assert.match(tilehead, /\{ closed: reader\.destroy, actions: \[reader\.action\] \}/);
  assert.match(behaviours, /scope === 'selected'/);
});
