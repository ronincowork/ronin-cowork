import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

test('New Agent presents Kind, four session doors, combined instructions, and a final Payload', async () => {
  const form = await source('new-agent.js');
  assert.match(form, /const plan = \(\) => \{[\s\S]*\['kind', 'type', 'top'/);
  assert.match(form, /key: 'template'.*Apply Template/);
  assert.match(form, /templateTray\(offered\(\), draft\.template,[\s\S]*includeOwn: false/);
  assert.match(form, /Name & instructions/);
  assert.match(form, /Session type/);
  assert.match(form, /Name · required/);
  assert.match(form, /draft\.type === 'terminal'\) return \['type', 'top'\]/);
  assert.match(form, /stepPayload\.el\.hidden = draft\.type === 'terminal'/);
  assert.match(form, /stepPayload\.setNumber\(order\.length \+ 1\)/);
  assert.match(form, /key: 'payload'.*Payload/);
  assert.doesNotMatch(form, /const stepTemplate =/);
});

test('New Team makes templates optional and offers explicit Agent roles', async () => {
  const [form, agents] = await Promise.all([source('new-team-form.js'), source('team-agents.js')]);
  assert.match(form, /\['kind', 'template', 'top', 'lead', 'defaults', 'where', 'kit'\]/);
  assert.match(form, /Template · optional/);
  assert.match(form, /includeOwn: false/);
  assert.match(form, /Name & instructions/);
  assert.match(agents, /Add Lead Agent/);
  assert.match(agents, /Add Team Agent/);
  assert.doesNotMatch(agents, /Mark as team lead/);
});

test('collapsible steps expose one full-width disclosure row and Team defaults use it', async () => {
  const [steps, team, css] = await Promise.all([
    source('form-steps.js'), source('new-team-form.js'),
    readFile(new URL('../public/css/launch-forms.css', import.meta.url), 'utf8'),
  ]);
  assert.match(steps, /el\(onToggle \? 'button' : 'div', 'fs-step-head'\)/);
  assert.match(steps, /setAttribute\('aria-expanded'/);
  assert.match(css, /\.fs-togglable \{ grid-column: 1 \/ -1; width: 100%/);
  assert.match(team, /key: 'defaults'.*Agent defaults/);
  assert.match(team, /Settings inherited by Agents launched in this Team/);
  assert.doesNotMatch(team, /createBand/);
});

test('a new lead has an explicit coordinating mandate without a second launch shape', async () => {
  const agents = await source('team-agents.js');
  assert.match(agents, /lead \? 'plan' : 'open'/);
  assert.match(agents, /lead \? 'staff agents' : 'open'/);
  assert.match(agents, /lead \? \['the team'\] : \['open'\]/);
  assert.match(agents, /instructions: row\.assignment\.trim\(\)/);
  assert.match(agents, /team_lead: !!row\.lead/);
});
