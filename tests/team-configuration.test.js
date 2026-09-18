// Team Configuration — the commons tab that asks a team's record through ERABI
// (public/js/team-configuration.js · ronin-lab SELECTORS.md). Fake-DOM floor: every
// question is a stone with the right reading, the Team's facts sit above the New Agent
// defaults, behaviours are not asked, and Save sends the record the server expects.
import test from 'node:test';
import assert from 'node:assert/strict';

class FakeList { constructor() { this.set = new Set(); } add(...c) { c.forEach((x) => this.set.add(x)); } remove(...c) { c.forEach((x) => this.set.delete(x)); } contains(c) { return this.set.has(c); } toggle(c, on) { if (on ?? !this.set.has(c)) this.set.add(c); else this.set.delete(c); } }
class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = []; this.listeners = {}; this.attributes = {}; this._text = ''; this.className = ''; this.classList = new FakeList(); this.value = ''; }
  append(...nodes) { for (const node of nodes.flat().filter((node) => node != null && node !== '')) { if (node instanceof FakeNode) { node.parent?.children.splice(node.parent.children.indexOf(node), 1); node.parent = this; } this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  removeEventListener() {}
  async fire(name, event = {}) { for (const callback of this.listeners[name] || []) await callback({ currentTarget: this, target: this, preventDefault() {}, ...event }); }
  click() { return this.fire('click'); }
  focus() { this.focused = true; }
  contains(node) { return node === this || [...this.walk()].includes(node); }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((node) => node !== this); this.parent = null; } }
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
  all(cls) { return [...this.walk()].filter((node) => `${node.className} ${[...node.classList.set].join(' ')}`.split(' ').includes(cls)); }
  one(cls) { return this.all(cls)[0] || null; }
  get textContent() { return this._text + this.children.map((node) => (typeof node === 'string' ? node : node.tagName === 'WBR' ? '' : node.textContent)).join(''); }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
}
globalThis.Node = FakeNode;
globalThis.HTMLElement = FakeNode; // the kit's createField accepts a control by instanceof
globalThis.document = { createElement: (tag) => new FakeNode(tag), createDocumentFragment: () => new FakeNode('#fragment'), querySelector: () => null, head: { append() {} }, addEventListener() {}, removeEventListener() {} };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, location: { hash: '' } };

const catalog = { origin: 'stock', providers: [
  { provider: 'anthropic', cli: 'claude', native: 'claude', label: 'Anthropic', models: [{ model: 'opus', tier: 'frontier', cmd: 'claude --model opus' }] },
  { provider: 'openai', cli: 'codex', native: 'codex', label: 'OpenAI', models: [{ model: 'gpt-5.6-sol', tier: 'frontier', cmd: 'codex --model gpt-5.6-sol' }] },
] };
const machine = { measured_at: '2026-09-13T00:00:00.000Z', providers: [
  { id: 'codex', label: 'Codex', from: 'OpenAI', installed: true, signed_in: true, activated: true, version: 'test', model_list: { client_version: 'test', fetched_at: '2026-09-13', models: [{ slug: 'gpt-5.6-sol', visibility: 'list' }] } },
  { id: 'claude', label: 'Claude Code', from: 'Anthropic', installed: false, signed_in: false, activated: false, version: 'test', model_list: { client_version: 'test', fetched_at: '2026-09-13', models: [{ slug: 'opus', visibility: 'list' }] } },
] };
const ways = [{ name: 'mandates', label: 'Mandates', blurb: '' }, { name: 'buildout', label: 'Buildout', blurb: 'Write the plan beside the work.' }];
const roots = { roots: [
  { name: 'ronin_cowork', title: 'Ronin Cowork', repo_profile: { worktrees: 'enabled' } },
  { name: 'ronin_services', title: 'Ronin Services', repo_profile: { worktrees: 'disabled' } },
] };
const seedWith = (available) => ({ behaviours: [{ name: 'ronin_host', label: 'Ronin Host' }, { name: 'trello', label: 'Trello' }], available });

const puts = [];
const serve = (seed) => {
  globalThis.fetch = async (url, init = {}) => {
    const body = url.startsWith('/api/launch-seed') ? seed
      : url.startsWith('/api/ways') ? ways
        : url.startsWith('/api/provider-catalog') ? catalog
          : url.startsWith('/api/setup/runtime') ? machine
            : url.startsWith('/api/project-roots/detail') ? roots
              : url.startsWith('/api/team-rosters/') && init.method === 'PUT' ? (puts.push(JSON.parse(init.body)), { roster: JSON.parse(init.body) })
                : null;
    return { ok: body !== null, status: body ? 200 : 404, headers: { get: () => 'application/json' }, json: async () => body ?? { error: 'no' }, text: async () => JSON.stringify(body) };
  };
};

const roster = {
  durable: true, name: 'jobber', title: 'Jobber', kind: 'coding', objective: 'Polish.',
  project_root: 'ronin_cowork', repos: ['ronin_services'], branches: { ronin_services: 'dev' },
  behaviours: { selected: ['mandates', 'buildout'], required: ['mandates'] },
  agent_defaults: { provider: 'openai', model: 'gpt-5.6-sol', reach: 'plan', recruit: 'propose agents', output: 'open', launch_mode: 'live_dangerously', permissions: 'retired', note: 'carried' },
};

const { renderTeamConfiguration } = await import('../public/js/team-configuration.js');

const painted = async (host) => {
  for (let i = 0; i < 50 && !host.one('tw-config-form'); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  const form = host.one('tw-config-form');
  assert.ok(form, 'the form painted');
  return form;
};
const stone = (form, key) => form.all('ask-stone').find((node) => node.dataset.askKey === key) || null;
const readingOf = (form, key) => stone(form, key)?.one('ask-reading')?.textContent ?? null;

test('every question is an ERABI stone whose reading is the saved answer', async () => {
  serve(seedWith(['ronin_host']));
  const host = new FakeNode('div');
  renderTeamConfiguration(host, roster);
  const form = await painted(host);
  assert.deepEqual(form.all('ask-stone').map((node) => node.dataset.askKey), [
    'kind', 'root', 'repos', 'provider', 'model', 'reach', 'recruit', 'output', 'launch_mode',
  ], 'the stones in the tab’s order: Kind on the head line, then the New Agent defaults; no behaviour or Control stone');
  assert.equal(readingOf(form, 'root'), 'Ronin Cowork', 'Born in reads the Workspace Folder’s title');
  assert.equal(readingOf(form, 'repos'), 'Ronin Services');
  assert.equal(readingOf(form, 'kind'), 'Coding');
  assert.equal(readingOf(form, 'provider'), 'OpenAI');
  assert.equal(readingOf(form, 'model'), 'gpt-5.6-sol');
  assert.equal(readingOf(form, 'reach'), 'Plan');
  assert.equal(readingOf(form, 'launch_mode'), 'Dangerously');
});

test('the tab is the launch forms’ format: step 1 Team (ID · Title · Kind, then Purpose), step 2 New Agent defaults', async () => {
  serve(seedWith(['ronin_host']));
  const host = new FakeNode('div');
  renderTeamConfiguration(host, roster);
  const form = await painted(host);
  assert.deepEqual(form.all('fs-step').map((step) => step.one('fs-step-head').textContent), ['1Team', '2New Agent defaults'], 'two numbered steps, as New Agent and New Team draw theirs');
  const identity = form.one('tw-config-identity');
  assert.ok(identity, 'the identity line exists');
  const labels = identity.all('wk-field-label').map((node) => node.textContent);
  assert.deepEqual(labels, ['Team ID', 'Title'], 'the kit’s labelled fields, the same furniture as the forms');
  assert.equal(identity.all('wk-field-control')[0].value, 'jobber');
  assert.equal(identity.all('wk-field-control')[0].disabled, true, 'the Team ID box is greyed out, not editable');
  assert.equal(identity.all('wk-field-control')[1].value, 'Jobber');
  assert.ok(identity.all('ask-stone').some((node) => node.dataset.askKey === 'kind'), 'Kind is a stone on the identity line');
  assert.equal(form.all('ask').every((node) => node.dataset.density === 'tight'), true, 'the forms’ tight density');
  const purpose = form.all('wk-field').find((node) => node.one('wk-field-label')?.textContent === 'Purpose');
  assert.equal(purpose.one('wk-field-control').tagName, 'TEXTAREA');
  assert.equal(purpose.one('wk-field-control').value, 'Polish.');
  const defaults = form.all('fs-step')[1];
  assert.match(defaults.one('fs-step-help').textContent, /each new Agent on this Team starts from/);
  assert.deepEqual(defaults.all('ask-group-head').map((node) => node.textContent), ['Where it works', 'Model', 'Mandate', 'Launch mode'], 'everything under Purpose is a New Agent default');
  assert.equal(form.all('wk-field-label').some((node) => /References/.test(node.textContent)), false, 'no references — that field left the shape');
  for (const node of form.walk()) {
    assert.notEqual(node.tagName, 'SELECT', 'no native select');
    assert.notEqual(node.type, 'checkbox', 'no checkbox');
  }
});

test('behaviours are not asked here, whatever the seed offers', async () => {
  serve(seedWith(['ronin_host']));
  const host = new FakeNode('div');
  renderTeamConfiguration(host, roster);
  const form = await painted(host);
  assert.equal(form.all('ask-group-head').some((node) => /Behaviours/.test(node.textContent)), false);
  assert.equal(stone(form, 'ronin_host'), null);
  assert.equal(stone(form, 'mandates'), null);
});

test('Save leaves behaviours untouched and carries agent defaults without permissions', async () => {
  serve(seedWith(['ronin_host']));
  puts.length = 0;
  const host = new FakeNode('div');
  let savedRoster = null;
  renderTeamConfiguration(host, roster, { onSaved: (saved) => { savedRoster = saved; } });
  const form = await painted(host);
  await form.fire('submit');
  for (let i = 0; i < 50 && !puts.length; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(puts.length, 1, 'one PUT');
  const body = puts[0];
  assert.equal(body.title, 'Jobber');
  assert.equal(body.kind, 'coding');
  assert.equal(body.project_root, 'ronin_cowork');
  assert.deepEqual(body.repos, ['ronin_services']);
  assert.deepEqual(body.branches, { ronin_services: 'dev' }, 'a checkout keeps its branch');
  assert.equal('references' in body, false, 'references is not sent');
  assert.equal('behaviours' in body, false, 'behaviours are not sent, so the store carries them');
  assert.equal(body.agent_defaults.note, 'carried', 'a key the tab does not draw is carried');
  assert.equal('permissions' in body.agent_defaults, false, 'the retired key is not rewritten');
  assert.equal(body.agent_defaults.model, 'gpt-5.6-sol');
  assert.deepEqual(body.agent_defaults.output, ['open']);
  assert.ok(savedRoster, 'onSaved received the server’s roster');
  assert.equal(form.one('tw-config-status').textContent, 'Saved');
});
