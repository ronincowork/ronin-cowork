// ask() — the one selector utility (public/js/ask.js · ronin-lab SELECTORS.md).
// Fake-DOM unit floor: the reading stone, the tray, the two shapes, the switch, the blank,
// dependents, the greyed stone with its reason, the filter past twelve, and the snake rule.
import test from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = []; this.listeners = {}; this.attributes = {}; this._text = ''; this.className = ''; }
  append(...nodes) { for (const node of nodes.flat().filter((node) => node != null && node !== '')) { if (node instanceof FakeNode) { node.parent?.children.splice(node.parent.children.indexOf(node), 1); node.parent = this; } this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  fire(name, event = {}) { for (const callback of this.listeners[name] || []) callback({ currentTarget: this, preventDefault() {}, ...event }); }
  click() { this.fire('click'); }
  focus() { this.focused = true; }
  remove() { this.removed = true; if (this.parent) { this.parent.children = this.parent.children.filter((node) => node !== this); this.parent = null; } }
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
  all(cls) { return [...this.walk()].filter((node) => node.className.split(' ').includes(cls)); }
  one(cls) { return this.all(cls)[0] || null; }
  get textContent() { return this._text + this.children.map((node) => (typeof node === 'string' ? node : node.tagName === 'WBR' ? '' : node.textContent)).join(''); }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
}
class FakeFragment extends FakeNode { constructor() { super('#fragment'); } }
globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tag) => new FakeNode(tag),
  createDocumentFragment: () => new FakeFragment(),
  querySelector: () => null,
  head: { append() {} },
  activeElement: null,
};

const { ask, snake } = await import('../public/js/ask.js');

const PROVIDERS = [
  { v: 'anthropic', l: 'Claude Code' },
  { v: 'openai', l: 'Codex' },
  { v: 'google', l: 'Gemini CLI', off: 'not on this machine' },
];
const MODELS = { anthropic: [{ v: 'opus', l: 'opus', word: 'frontier', sub: '$5 in · $25 out' }, { v: 'sonnet', l: 'sonnet', word: 'standard' }], openai: [{ v: 'gpt-5.6-sol', l: 'gpt-5.6-sol', word: 'frontier' }] };
const REACH = [{ v: 'open', l: 'Open', glyph: '○' }, { v: 'plan', l: 'Plan', glyph: '🗺' }, { v: 'execute', l: 'Execute', glyph: '⚙', sub: 'Does the work.' }];

const build = (extra = {}) => {
  const changes = [];
  const form = ask([
    { group: 'Model', fields: [
      { key: 'provider', label: 'Model provider', blank: 'Default', options: PROVIDERS },
      { key: 'model', label: 'Model', blank: 'Default', after: 'provider', options: (v) => MODELS[v.provider] || [] },
    ] },
    { group: 'Mandate', fields: [
      { key: 'reach', label: 'Reach', shape: 'square', options: REACH },
      { key: 'output', label: 'Output', shape: 'square', many: true, options: ['open', 'code', 'a plan', 'ideas'] },
    ] },
    { group: 'Team', fields: [{ key: 'lead', label: 'Team lead', switch: ['Yes', 'No'] }] },
  ], { value: { reach: 'plan', output: ['open'], ...extra }, onChange: (value, key) => changes.push([key, value]) });
  return { form, changes };
};
const stoneFor = (form, key) => form.el.all('ask-stone').find((node) => node.dataset.askKey === key);
const optNamed = (form, name) => form.el.all('ask-opt').find((node) => node.one('ask-name')?.textContent === name);

test('groups draw their fields as reading stones with the label over the answer', () => {
  const { form } = build();
  assert.equal(form.el.className, 'ask');
  const groups = form.el.all('ask-group');
  assert.deepEqual(groups.map((group) => group.one('ask-group-head').textContent), ['Model', 'Mandate', 'Team']);
  const provider = stoneFor(form, 'provider');
  assert.equal(provider.one('ask-label').textContent, 'Model provider');
  assert.equal(provider.one('ask-reading').textContent, 'Default');
  assert.match(provider.one('ask-reading').className, /ask-blank/);
  assert.equal(stoneFor(form, 'reach').one('ask-reading').textContent, 'Plan');
  assert.equal(provider.attributes['aria-expanded'], 'false');
  assert.equal(form.el.all('ask-tray').length, 0, 'nothing is open at rest');
});

test('a click opens one tray under the field\'s group; a one-of pick answers and closes; the blank is a stone', () => {
  const { form, changes } = build();
  stoneFor(form, 'provider').click();
  assert.equal(form.el.dataset.open, 'provider');
  const trays = form.el.all('ask-tray');
  assert.equal(trays.length, 1);
  assert.equal(form.el.children[1], trays[0], 'the tray sits right after the Model group');
  const names = trays[0].all('ask-opt').map((opt) => opt.one('ask-name').textContent);
  assert.deepEqual(names, ['Default', 'Claude Code', 'Codex', 'Gemini CLI']);
  assert.ok(trays[0].all('ask-opt').every((opt) => opt.className.includes('ask-rect')), 'names are rectangles');
  optNamed(form, 'Claude Code').click();
  assert.equal(form.value().provider, 'anthropic');
  assert.equal(form.el.all('ask-tray').length, 0, 'one-of closes on pick');
  assert.equal(stoneFor(form, 'provider').one('ask-reading').textContent, 'Claude Code');
  assert.deepEqual(changes.at(-1)[0], 'provider');
});

test('exposed mode draws option stones directly and preserves selection and keyboard focus', () => {
  const form = ask([{ group: 'Register', fields: [{ key: 'mode', label: 'Register as', options: [
    { v: 'email', l: 'With email' }, { v: 'anonymous', l: 'Anonymous' }, { v: 'no', l: 'No thank you' },
  ] }] }], { value: { mode: '' }, exposed: true });
  assert.equal(form.el.dataset.exposed, 'true');
  assert.equal(form.el.all('ask-stone').length, 0, 'there is no summary stone');
  assert.deepEqual(form.el.all('ask-opt').map((opt) => opt.one('ask-name').textContent), ['With email', 'Anonymous', 'No thank you']);
  optNamed(form, 'Anonymous').click();
  assert.equal(form.value().mode, 'anonymous');
  assert.equal(optNamed(form, 'Anonymous').attributes['aria-selected'], 'true');
  assert.equal(optNamed(form, 'Anonymous').focused, true, 'focus returns to the selected native button after repaint');
  assert.equal(form.el.all('ask-tray').length, 1, 'the choices remain exposed after selection');
  const selected = optNamed(form, 'Anonymous');
  form.el.fire('keydown', { key: 'Escape' });
  assert.equal(optNamed(form, 'Anonymous'), selected, 'Escape cannot collapse or replace an always-exposed selector');
});

test('an exposed choice does not steal focus from a conditional field revealed by its consumer', () => {
  const conditional = new FakeNode('input');
  const form = ask([{ group: 'Kind', fields: [{ key: 'kind', label: 'Kind', options: [
    { v: 'software', l: 'Build software' }, { v: 'other', l: 'Something else' },
  ] }] }], { exposed: true, onChange: (value) => { if (value.kind === 'other') { conditional.focus(); document.activeElement = conditional; } } });
  const other = optNamed(form, 'Something else');
  document.activeElement = other;
  other.click();
  assert.equal(document.activeElement, conditional);
  assert.equal(optNamed(form, 'Something else').attributes['aria-selected'], 'true');
});

test('a dependent field clears and re-asks its options when its parent changes', () => {
  const { form } = build({ provider: 'anthropic', model: 'sonnet' });
  assert.equal(stoneFor(form, 'model').one('ask-reading').textContent, 'sonnet', 'the reading is the answer alone; the short word lives on the rectangle');
  stoneFor(form, 'provider').click();
  optNamed(form, 'Codex').click();
  assert.equal(form.value().model, '', 'the child answer cleared');
  stoneFor(form, 'model').click();
  assert.deepEqual(form.el.one('ask-tray').all('ask-opt').map((opt) => opt.one('ask-name').textContent), ['Default', 'gpt-5.6-sol']);
});

test('an empty dependent tray says which field to answer first', () => {
  const { form } = build();
  stoneFor(form, 'model').click();
  assert.equal(form.el.one('ask-tray').one('ask-empty').textContent, 'Choose Model provider first.');
});

test('a many field keeps its tray open, ticks stones, and reads names or a count', () => {
  const { form } = build();
  stoneFor(form, 'output').click();
  optNamed(form, 'code').click();
  assert.equal(form.el.all('ask-tray').length, 1, 'many stays open');
  assert.deepEqual(form.value().output, ['open', 'code']);
  assert.equal(stoneFor(form, 'output').one('ask-reading').textContent, 'open, code');
  optNamed(form, 'a plan').click();
  assert.equal(stoneFor(form, 'output').one('ask-reading').textContent, '3 chosen');
  optNamed(form, 'open').click();
  assert.deepEqual(form.value().output, ['code', 'a plan']);
  assert.equal(optNamed(form, 'open').attributes['aria-selected'], 'false');
});

test('New Agent workspace interactions send the shown default, preserve an explicit empty answer, and survive Team changes', async () => {
  const { coworkWorkspacePayload, workspaceRepos } = await import('../public/js/new-agent.js');
  const options = [{ v: 'ronin_lab', l: 'Ronin Lab' }, { v: 'ronin_cowork', l: 'Ronin Cowork' }];
  const shown = workspaceRepos({ root: 'ronin_lab', teamRepos: ['ronin_cowork'] });
  const form = ask([{ fields: [{ key: 'repos', label: 'Workspaces', many: true, options }] }], { value: { repos: shown } });

  assert.deepEqual(coworkWorkspacePayload(form.value().repos), { repos: ['ronin_lab', 'ronin_cowork'] },
    'the untouched selection shown in the form, including Born in, is sent');
  stoneFor(form, 'repos').click();
  optNamed(form, 'Ronin Lab').click();
  optNamed(form, 'Ronin Cowork').click();
  assert.deepEqual(coworkWorkspacePayload(form.value().repos), { repos: [] }, 'explicit deselection is sent as []');
  assert.deepEqual(workspaceRepos({ root: 'ronin_lab', teamRepos: ['other'], current: form.value().repos, touched: true }), [],
    'a later Team change preserves the owner-edited selection');
});

test('a square stone carries a glyph and a ruled word; the caption carries the sentence', () => {
  const { form } = build();
  stoneFor(form, 'reach').click();
  const execute = optNamed(form, 'Execute');
  assert.match(execute.className, /ask-square/);
  assert.equal(execute.one('ask-glyph').textContent, '⚙');
  const tray = form.el.one('ask-tray');
  assert.equal(tray.one('ask-caption').textContent, '', 'a stone that is only its name says nothing in the caption');
  execute.fire('mouseenter');
  assert.equal(tray.one('ask-caption').textContent, 'Does the work.', 'the caption says the sentence alone, never the name');
  form.el.fire('keydown', { key: 'Escape' });
  stoneFor(form, 'output').click();
  assert.equal(form.el.one('ask-tray').one('ask-caption'), null, 'a tray of plain words has no caption at all');
});

test('a greyed stone stays in the tray with its reason, and a click on it says why instead of picking', () => {
  const { form } = build();
  stoneFor(form, 'provider').click();
  const gemini = optNamed(form, 'Gemini CLI');
  assert.equal(gemini.attributes['aria-disabled'], 'true');
  assert.equal(gemini.title, 'not on this machine');
  gemini.click();
  assert.equal(form.value().provider, '');
  assert.equal(form.el.one('ask-caption').textContent, 'not on this machine');
});

test('a switch is the reading stone with a track: it flips and opens nothing', () => {
  const { form, changes } = build();
  const lead = stoneFor(form, 'lead');
  assert.equal(lead.attributes.role, 'switch');
  assert.equal(lead.attributes['aria-checked'], 'false');
  assert.equal(lead.one('ask-reading').textContent, 'No');
  assert.ok(lead.one('ask-track'));
  lead.click();
  assert.equal(form.value().lead, true);
  assert.equal(stoneFor(form, 'lead').one('ask-reading').textContent, 'Yes');
  assert.equal(form.el.all('ask-tray').length, 0);
  assert.equal(changes.at(-1)[0], 'lead');
});

test('past twelve options the tray grows a filter line', () => {
  const form = ask([{ group: 'Team', fields: [{ key: 'team', label: 'Team', options: Array.from({ length: 13 }, (_, i) => ({ v: `t${i}`, l: `team_${i}` })) }] }]);
  stoneFor(form, 'team').click();
  const find = form.el.one('ask-filter');
  assert.ok(find, 'thirteen rows bring the filter');
  find.value = 'team_1';
  find.fire('input');
  assert.deepEqual(form.el.one('ask-tray').all('ask-opt').map((opt) => opt.one('ask-name').textContent), ['team_1', 'team_10', 'team_11', 'team_12']);
  const small = ask([{ fields: [{ key: 'reach', label: 'Reach', options: REACH }] }]);
  stoneFor(small, 'reach').click();
  assert.equal(small.el.one('ask-filter'), null, 'three rows bring none');
});

test('the snake rule breaks a name after its joints, never mid-word', () => {
  const frag = snake('gemini-2.5-flash-lite');
  const parts = frag.children.filter((node) => typeof node === 'string');
  assert.deepEqual(parts, ['gemini-', '2.', '5-', 'flash-', 'lite']);
  assert.equal(frag.children.filter((node) => node.tagName === 'WBR').length, 4);
  assert.deepEqual(snake('plain').children, ['plain']);
});

test('set() and options() repaint; Escape closes; a chosen option can draw its own row under the tray', () => {
  const form = ask([{ fields: [
    { key: 'root', label: 'Born in', options: [{ v: 'a', l: 'ronin_cowork' }, { v: 'b', l: 'ronin_services' }] },
    { key: 'repos', label: 'Additional workspaces', many: true, after: 'root', options: (v) => [{ v: 'a', l: 'ronin_cowork' }, { v: 'b', l: 'ronin_services' }].filter((r) => r.v !== v.root), row: (o) => { const input = new FakeNode('input'); input.placeholder = `branch for ${o.l}`; return input; } },
  ] }], { value: { root: 'a', repos: ['b'] } });
  assert.equal(form.el.all('ask-extra').length, 0, 'closed, a group is exactly its stones');
  stoneFor(form, 'repos').click();
  const extra = form.el.one('ask-tray').one('ask-extra');
  assert.equal(extra.one('ask-extra-name').textContent, 'ronin_services', 'open, a many question shows the lines of its chosen options in the tray');
  assert.equal(extra.children[1].placeholder, 'branch for ronin_services');
  form.el.fire('keydown', { key: 'Escape' });
  assert.equal(form.el.all('ask-tray').length, 0);
  assert.equal(form.el.all('ask-extra').length, 0, 'and closing takes the lines with it');
  form.set('root', 'b');
  assert.equal(stoneFor(form, 'root').one('ask-reading').textContent, 'ronin_services');
  form.options('root', [{ v: 'c', l: 'notes' }]);
  stoneFor(form, 'root').click();
  assert.deepEqual(form.el.one('ask-tray').all('ask-opt').map((opt) => opt.one('ask-name').textContent), ['notes']);
});

test('density is the caller\'s one word: loose by default, tight for the launch forms', () => {
  assert.equal(build().form.el.dataset.density, 'loose');
  const tight = ask([{ fields: [{ key: 'reach', label: 'Reach', options: REACH }] }], { density: 'tight' });
  assert.equal(tight.el.dataset.density, 'tight');
});

test('set() takes a patch object in one paint, and show() limits which questions are drawn', () => {
  const { form } = build();
  form.set({ provider: 'openai', model: 'gpt-5.6-sol', reach: 'execute', lead: true });
  assert.equal(stoneFor(form, 'provider').one('ask-reading').textContent, 'Codex');
  assert.equal(stoneFor(form, 'model').one('ask-reading').textContent, 'gpt-5.6-sol');
  assert.equal(stoneFor(form, 'lead').attributes['aria-checked'], 'true');
  stoneFor(form, 'reach').click();
  assert.equal(form.el.dataset.open, 'reach');
  form.show(['provider', 'model']);
  assert.deepEqual(form.el.all('ask-group').map((group) => group.one('ask-group-head').textContent), ['Model'], 'groups with nothing shown are not drawn');
  assert.equal(form.el.all('ask-stone').length, 2);
  assert.equal(form.el.dataset.open, '', 'a hidden open field closes');
  assert.equal(form.value().reach, 'execute', 'hidden answers are kept, not cleared');
  form.show(null);
  assert.equal(form.el.all('ask-stone').length, 5);
});

test('a second layer appears only on an explicit click in this open interaction; an option\'s own row is a full-width line in the same slot', () => {
  const changes = [];
  const teams = [{ v: 'jobber', l: 'jobber' }, { v: 'setup', l: 'setup' }];
  const form = ask([
    { group: 'Team', fields: [
      { key: 'team', label: 'Team', options: [
        { v: 'none', l: 'No team — a rōnin' },
        { v: 'current', l: 'Current team' },
        { v: 'new', l: 'New team', row: () => { const i = new FakeNode('input'); i.placeholder = 'team name'; return i; } },
      ], then: [{ when: 'current', key: 'teamName', label: 'Which team', options: () => teams }] },
      { key: 'lead', label: 'Team lead', switch: ['Yes', 'No'] },
    ] },
    { group: 'Model', fields: [{ key: 'provider', label: 'Model provider', options: PROVIDERS }] },
  ], { value: { team: 'current', teamName: 'jobber' }, onChange: (value, key) => changes.push([key, { ...value }]) });
  assert.deepEqual(Object.keys(form.value()).sort(), ['lead', 'provider', 'team', 'teamName'], 'the nested question is a field in the value');
  assert.equal(form.el.all('ask-stone').length, 3, 'but never a stone of its own');
  assert.equal(stoneFor(form, 'team').one('ask-reading').textContent, 'jobber', 'closed, the nested answer speaks for the parent');
  stoneFor(form, 'team').click();
  assert.equal(form.el.all('ask-layer').length, 0, 'opening shows layer one only, even with Current team saved');
  assert.equal(form.el.all('ask-opt').length, 3);
  optNamed(form, 'Current team').click();
  assert.equal(form.el.dataset.open, 'team', 'the explicit click keeps the tray open');
  const layer = form.el.one('ask-layer');
  assert.ok(layer, 'and reveals the second layer beneath');
  assert.equal(layer.one('ask-layer-head').textContent, 'Which team');
  assert.deepEqual(layer.all('ask-opt').map((o) => o.one('ask-name').textContent), ['jobber', 'setup']);
  layer.all('ask-opt')[1].click();
  assert.equal(form.el.all('ask-tray').length, 0, 'answering the second layer closes the tray');
  assert.deepEqual([form.value().team, form.value().teamName], ['current', 'setup']);
  assert.equal(stoneFor(form, 'team').one('ask-reading').textContent, 'setup');
  stoneFor(form, 'team').click();
  optNamed(form, 'New team').click();
  assert.equal(form.el.dataset.open, 'team', 'New team keeps the tray open');
  const line = form.el.one('ask-line');
  assert.ok(line, 'and draws its own line in the second-layer slot');
  assert.equal(line.one('ask-extra').children[1].placeholder, 'team name');
  assert.equal(form.el.all('ask-group')[0].one('ask-extra'), null, 'the group holds stones only — the line lives in the tray, so layer one never moves');
  assert.equal(form.value().teamName, '', 'the nested answer is cleared by another layer-one answer');
  form.el.fire('keydown', { key: 'Escape' });
  assert.equal(form.el.all('ask-tray').length, 0);
  assert.equal(form.el.all('ask-extra').length, 0, 'closed, the group is exactly its stones again');
  stoneFor(form, 'team').click();
  assert.equal(form.el.all('ask-line').length, 0, 'reopening with New team saved shows layer one only');
  optNamed(form, 'New team').click();
  assert.ok(form.el.one('ask-line'), 'the click brings the line back, in the slot beneath');
  optNamed(form, 'No team — a rōnin').click();
  assert.equal(form.el.all('ask-tray').length, 0, 'No team closes at once');
  assert.equal(form.el.all('ask-extra').length, 0, 'and leaves nothing under the group');
  form.show(['provider']);
  assert.equal(form.el.all('ask-stone').length, 1);
  form.show(['team', 'lead']);
  assert.equal(form.el.all('ask-stone').length, 2, 'the nested question follows its parent through show()');
});

test('trayHost: the open tray is placed at the end of the consumer\'s row, not inside the instance, and leaves when it closes', () => {
  const row = new FakeNode('div'); row.className = 'identity-row';
  const name = new FakeNode('div'); name.className = 'name'; row.append(name);
  const form = ask([{ group: 'Team', fields: [{ key: 'team', label: 'Team', options: [{ v: 'none', l: 'No team' }, { v: 'current', l: 'Current team' }], then: [{ when: 'current', key: 'teamName', label: 'Which team', options: [{ v: 'jobber', l: 'jobber' }] }] }] }], { value: { team: 'none' }, trayHost: row });
  row.append(form.el);
  stoneFor(form, 'team').click();
  assert.equal(form.el.all('ask-tray').length, 0, 'not inside the instance');
  assert.equal(row.children.at(-1).className, 'ask-tray', 'at the end of the row');
  assert.equal(row.children.at(-1).dataset.density, 'loose', 'a hosted tray carries the instance\'s density, since it sits outside it');
  row.children.at(-1).all('ask-opt').find((o) => o.one('ask-name').textContent === 'Current team').click();
  assert.equal(row.children.filter((n) => n.className === 'ask-tray').length, 1, 'one tray after a repaint, not two');
  assert.ok(row.children.at(-1).one('ask-layer'), 'the second layer rides in it');
  row.children.at(-1).fire('keydown', { key: 'Escape' });
  assert.equal(row.children.filter((n) => n.className === 'ask-tray').length, 0, 'Escape inside the hosted tray closes it');
  assert.deepEqual(row.children.map((n) => n.className), ['name', 'ask'], 'the row is back to its controls');
});

test('a required line refuses dismissal while blank or invalid, announces why, and lets go once typed or once another answer is chosen', () => {
  let name = '';
  const form = ask([{ group: 'Team', fields: [{ key: 'team', label: 'Team', options: [
    { v: 'none', l: 'No team' },
    { v: 'new', l: 'New team', required: true, row: () => { const i = new FakeNode('input'); i.value = name; i.addEventListener('input', () => { name = i.value; }); return i; }, invalid: () => (/[^a-z0-9_-]/.test(name) ? 'Lowercase letters, digits, _ and - only.' : '') },
  ] }] }], { value: { team: 'none' } });
  stoneFor(form, 'team').click();
  optNamed(form, 'New team').click();
  const input = form.el.one('ask-line').one('ask-extra').children[1];
  assert.equal(input.attributes['aria-required'], 'true');
  assert.equal(form.el.one('ask-line').one('ask-extra').dataset.required, 'true', 'a required line reserves its note\'s line, so a refusal moves nothing');
  form.el.fire('keydown', { key: 'Escape' });
  assert.equal(form.el.dataset.open, 'team', 'Escape with a blank required line keeps the tray open');
  assert.equal(input.attributes['aria-invalid'], 'true');
  assert.equal(form.el.one('ask-validation').textContent, 'Required');
  assert.equal(form.el.one('ask-line').dataset.invalid, 'true');
  assert.ok(input.focused, 'and focuses the control');
  stoneFor(form, 'team').click();
  assert.equal(form.el.dataset.open, 'team', 'the stone cannot close it either');
  assert.equal(form.close(), false, 'nor can close()');
  input.value = 'Bad Name'; input.fire('input');
  assert.equal(input.attributes['aria-invalid'], 'false', 'typing clears the mark');
  form.el.fire('keydown', { key: 'Escape' });
  assert.equal(form.el.dataset.open, 'team');
  assert.equal(form.el.one('ask-validation').textContent, 'Lowercase letters, digits, _ and - only.', 'the consumer\'s validator speaks');
  input.value = 'jobber-2'; input.fire('input');
  form.el.fire('keydown', { key: 'Escape' });
  assert.equal(form.el.all('ask-tray').length, 0, 'valid, it lets go');
  stoneFor(form, 'team').click();
  optNamed(form, 'New team').click();
  form.el.one('ask-line').one('ask-extra').children[1].value = ''; name = '';
  optNamed(form, 'No team').click();
  assert.equal(form.el.all('ask-tray').length, 0, 'another layer-one answer dismisses even with the line blank: the requirement belongs to the answer');
  assert.equal(form.value().team, 'none');
});

test('an explicit stone label survives when it matches its group head', () => {
  const form = ask([{ group: 'Where will you install Ronin?', fields: [{ key: 'where', label: 'Where will you install Ronin?', options: [{ v: 'here', l: 'This machine' }] }] }]);
  assert.equal(form.el.one('ask-group-head').textContent, 'Where will you install Ronin?');
  assert.equal(stoneFor(form, 'where').one('ask-label').textContent, 'Where will you install Ronin?');
});
