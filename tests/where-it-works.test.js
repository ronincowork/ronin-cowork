import test from 'node:test';
import assert from 'node:assert/strict';

/* The picker builds a real <select>, so the fake has to keep the one rule the code
 * depends on: assigning a value that is not among the options leaves it empty. That is
 * what `buildRoots` reads back to decide whether the stored root survived. */
class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.listeners = {}; this.textContent = '';
    this.className = ''; this.checked = false; this.disabled = false; this.readOnly = false; this.value = '';
    this.classList = { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false };
  }
  append(...nodes) { this.children.push(...nodes.flat()); }
  replaceChildren(...nodes) { this.children = [...nodes.flat()]; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  *walk() { for (const child of this.children) { yield child; yield* child.walk(); } }
}

class FakeSelect extends FakeEl {
  constructor() { super('select'); this.options = []; this._value = ''; }
  add(option) { this.options.push(option); }
  replaceChildren() { this.options = []; this.children = []; }
  get value() { return this._value; }
  // `this.options` is still undefined while the base constructor assigns value.
  set value(next) { this._value = (this.options || []).some((o) => o.value === String(next)) ? String(next) : ''; }
}

const withFakeDom = async (run) => {
  const before = { document: globalThis.document, Option: globalThis.Option };
  globalThis.document = { createElement: (tag) => (tag === 'select' ? new FakeSelect() : new FakeEl(tag)) };
  globalThis.Option = class { constructor(label, value) { this.label = String(label); this.value = String(value); } };
  try { return await run(); } finally { globalThis.document = before.document; globalThis.Option = before.Option; }
};

const load = () => import(`../public/js/where-it-works.js?t=${Date.now()}${Math.random()}`);

test('roots handed to the constructor are the Born in choices on the first paint', async () => {
  await withFakeDom(async () => {
    const { createWhereItWorks } = await load();
    // team-configuration.js already holds the list when it builds the control, and
    // never calls setRoots — so a seed ignored here leaves the field with no choices.
    const where = createWhereItWorks({
      roots: [{ name: 'alpha' }, { name: 'beta' }, { name: 'notes', repo: false }],
      root: 'beta',
      rootDefaultLabel: 'Default',
    });
    assert.deepEqual(where.rootSelect.options.map((o) => o.value), ['', 'alpha', 'beta', 'notes']);
    assert.equal(where.root, 'beta'); // the stored root survives because its option exists
  });
});

test('a stored root outside the known list is still offered rather than silently dropped', async () => {
  await withFakeDom(async () => {
    const { createWhereItWorks } = await load();
    const where = createWhereItWorks({ roots: [{ name: 'alpha' }], root: 'retired', rootDefaultLabel: 'Default' });
    assert.deepEqual(where.rootSelect.options.map((o) => o.value), ['', 'alpha', 'retired']);
    assert.equal(where.root, 'retired');
  });
});

test('a caller still fetching passes no roots and fills them in later', async () => {
  await withFakeDom(async () => {
    const { createWhereItWorks } = await load();
    // new-agent.js / new-team-form.js build the control first and paintRoots after the
    // /api/project-roots answer lands; seeding must not have broken that path.
    const where = createWhereItWorks({ rootDefaultLabel: '— default —' });
    assert.deepEqual(where.rootSelect.options.map((o) => o.value), ['']);
    where.setRoots([{ name: 'alpha' }, { name: 'beta' }]);
    assert.deepEqual(where.rootSelect.options.map((o) => o.value), ['', 'alpha', 'beta']);
  });
});
