import test from 'node:test';
import assert from 'node:assert/strict';

// The Register surface rendered in a fake DOM (the harness setup-push.test.js uses): hosted,
// unreadable and self-hosted readings of the office record, in one surface, by show() alone.
class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; this.disabled = false; this.value = ''; this.textContent = ''; this.className = ''; this.style = {}; const classes = new Set(); this.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => (on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c), contains: (c) => classes.has(c) }; }
  append(...nodes) { this.children.push(...nodes.filter(Boolean)); }
  prepend(...nodes) { this.children.unshift(...nodes.filter(Boolean)); }
  appendChild(node) { this.append(node); return node; }
  get childNodes() { return this.children; }
  after(node) { this.parent?.append(node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { this.removed = true; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  matches(selector) {
    const attr = /^\[([\w-]+)="([^"]*)"\]$/.exec(selector);
    if (attr) return this.attributes[attr[1]] === attr[2];
    if (selector.startsWith('.')) return String(this.className).split(/\s+/).includes(selector.slice(1));
    return this.tagName === selector.toUpperCase();
  }
  querySelector(selector) { return [...this.walk()].find((n) => n.matches(selector)) || null; }
  querySelectorAll() { return []; }
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
  click() { for (const fn of this.listeners.click || []) fn({ currentTarget: this }); }
  insertBefore(node, ref) { const i = this.children.indexOf(ref); if (i < 0) this.append(node); else this.children.splice(i, 0, node); return node; }
  removeChild(node) { this.children = this.children.filter((c) => c !== node); return node; }
  contains(node) { return node === this || [...this.walk()].includes(node); }
  closest(selector) { return this.matches(selector) ? this : (this.parent?.closest?.(selector) ?? null); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() {} blur() {}
  get firstChild() { return this.children[0] ?? null; }
  get firstElementChild() { return this.children[0] ?? null; }
  get isConnected() { return true; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeNode(tag), createDocumentFragment: () => new FakeNode('#fragment'), createElementNS: (_ns, tag) => new FakeNode(tag), createTextNode: (text) => Object.assign(new FakeNode('#text'), { textContent: text }), querySelector: () => null, getElementById: () => null, head: { append() {} }, body: new FakeNode('body') };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Linux' }, configurable: true });

let office = { hosting: 'self_hosted', host: 'box' };
const asked = [];
globalThis.fetch = async (url, options = {}) => {
  asked.push(`${options.method || 'GET'} ${url}`);
  const body = url.startsWith('/api/office') ? office
    : url.startsWith('/api/setup/registration') ? { status: 'optional', submitted_at: null }
    : url.startsWith('/api/setup/user-intro') ? { intro: '' } : {};
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
};
const texts = (node) => [node.textContent, ...[...node.walk()].map((n) => n.textContent)].join('\n');
const visibleForm = (node) => [...node.walk()].some((n) => n.tagName === 'FORM' && !n.hidden);

test('Register: put away on an office_park, said as a fault when unreadable, and back in full when the record reads self-hosted again', async () => {
  const { setupSurfaceDefinitions, SETUP_SURFACE_TYPES } = await import('../public/js/setup-surfaces.js');
  const definition = setupSurfaceDefinitions().find((d) => d.type === SETUP_SURFACE_TYPES.register);
  let refreshed = 0;
  const surface = definition.create({ tenant: {}, environment: {}, workspace: 'workspace2', workbench: { refreshSelector: () => { refreshed++; } } });

  // Self-hosted first: the form is on the surface.
  await surface.show();
  assert.equal(visibleForm(surface.el), true, 'self-hosted shows the registration form');
  assert.doesNotMatch(texts(surface.el), /Hosted office/);

  // Hosted: one sentence, no form, no Delete registration, and the summary says managed, not registered.
  office = { hosting: 'office_unit', record: { office_id: 'glen', office_park: 'oh-1', gateway_office: 'http://10.0.0.2:4912', provisioned_at: 'x' } };
  await surface.show();
  assert.match(texts(surface.el), /Hosted office: registration is managed when this office is provisioned/);
  assert.equal(visibleForm(surface.el), false, 'no form on an office_park');
  assert.doesNotMatch(texts(surface.el), /Delete registration|Registered\b/);
  assert.equal(definition.summary(), 'managed by provisioning');
  assert.ok(refreshed >= 1, 'the selector is told');

  // Unreadable: a fault, with its reason; still no form.
  office = { hosting: 'unreadable', error: 'office_id must be letters' };
  await surface.show();
  assert.match(texts(surface.el), /Office record unreadable: office_id must be letters/);
  assert.equal(visibleForm(surface.el), false);
  assert.equal(definition.summary(), 'office record unreadable');

  // Deleting office_record.json reverses it on the same surface: zone and form are back, the notice gone.
  office = { hosting: 'self_hosted', host: 'box' };
  await surface.show();
  assert.equal(visibleForm(surface.el), true, 'the form is restored without recreating the surface');
  assert.doesNotMatch(texts(surface.el), /Hosted office|Office record unreadable/);
  assert.equal(definition.summary(), 'optional');
  assert.ok(asked.filter((a) => a === 'GET /api/office').length >= 4, 'each show reads the office record');
});
