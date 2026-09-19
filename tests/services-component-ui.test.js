import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const setup = await readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
const installed = await readFile(new URL('../src/routes/installed-api.ts', import.meta.url), 'utf8');
const launch = await readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8');
const parts = await readFile(new URL('../src/parts.ts', import.meta.url), 'utf8');
const { serviceCapabilityWord } = await import('../public/js/services-setup-state.js');

test('Services owns all seven owner-facing capabilities and exact captions', () => {
  for (const [id, label, caption] of [
    ['task_manager', 'Task manager', 'Adds a shared project board and quick summaries of active work.'],
    ['terminal_transcript', 'Terminal transcript', 'Records terminal activity for transcript views and downstream summaries.'],
    ['voice_hotwords', 'Voice & Hotwords', 'Adds voice tools and corrections for words dictation commonly mishears.'],
    ['usage_stats', 'Usage stats', 'Keeps local usage counts without storing transcript content.'],
    ['machine_status', 'Machine status', 'Shows memory, swap and load for this box in the header.'],
    ['project_coordinator', 'Project coordinator', 'Watches active projects and prompts Agents to keep status and summaries current.'],
    ['local_weights', 'Local weights', 'Provides locally stored model weights for features that need them.'],
  ]) {
    assert.match(setup, new RegExp(`id: '${id}', label: '${label.replace('&', '\\&')}'.*needs: '${caption.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}'`));
  }
  assert.match(setup, /ask\(\[\{ group:/);
  assert.match(setup, /switch: \['On', 'Off'\]/);
  assert.doesNotMatch(setup, /michi|kanban|rireki|koe|counting|koshi|koshi_weights/);
  assert.match(parts, /task_manager: \['michi', 'kanban'\]/);
  assert.match(parts, /sole capability-to-part expansion/);
  assert.doesNotMatch(parts, /public\/js|setup-surfaces/);
});

test('Services maturity matches what owners can use now', () => {
  assert.match(setup, /id: 'voice_hotwords',[^}]+status: 'comingSoon'/);
  assert.match(setup, /id: 'project_coordinator',[^}]+status: 'beta'/);
});

test('installed truth distinguishes desired, running, parked, and restart state', () => {
  assert.match(installed, /desired: Record<string, boolean>/);
  assert.match(installed, /listServiceFailures\(\)/);
  assert.match(installed, /capabilities = \{ desired, running: runtime\.running, disagrees, parked: runtime\.parked \}/);
  assert.doesNotMatch(installed, /servicePartSelected|SERVICE_CAPABILITY_PARTS/);
});

test('either partial Task manager runtime direction says Restart without exposing parts', () => {
  assert.equal(serviceCapabilityWord({ wanted: false, running: false, disagrees: true, parked: false }), 'Restart');
  assert.equal(serviceCapabilityWord({ wanted: true, running: false, disagrees: true, parked: false }), 'Restart');
});

test('new Agent transcript recording follows both the master and explicit capability choice', () => {
  assert.match(launch, /config\.services\.parts\.terminal_transcript === true/);
  assert.match(launch, /contribution\.enabled\) && transcriptOn/);
});

test('restart disagreement alone does not schedule surface polling', async () => {
  const { servicesSetupModel } = await import('../public/js/services-setup-state.js');
  const model = servicesSetupModel({ ok: true, data: { services_entitled: true } }, { ok: true, data: { services: { installed: true, switched_on: true, restart_needed: true } } });
  assert.equal(model.polling, false);
  assert.equal(model.steps.at(-1).act, 'restart');
});
