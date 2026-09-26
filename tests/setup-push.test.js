import test from 'node:test';
import assert from 'node:assert/strict';

// Just enough DOM for the two setup surfaces: nodes that hold children, text, and handlers.
class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; this.disabled = false; this.value = ''; this.textContent = ''; this.className = ''; this.style = {}; const classes = new Set(); this.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => (on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c), contains: (c) => classes.has(c) }; }
  append(...nodes) { this.children.push(...nodes.filter(Boolean)); }
  prepend(...nodes) { this.children.unshift(...nodes.filter(Boolean)); }
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
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeNode(tag), createTextNode: (text) => Object.assign(new FakeNode('#text'), { textContent: text }), querySelector: () => null, head: { append() {} } };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Linux' }, configurable: true });

const asked = [];
let answer = () => ({});
globalThis.fetch = async (url, options = {}) => {
  asked.push(`${options.method || 'GET'} ${url}`);
  const body = answer(url, options);
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
};

const { store } = await import('../public/js/store.js');
const { createGithubWorkspaceSetup } = await import('../public/js/github-workspace-setup.js');
const { buildGbrain } = await import('../public/js/gbrain.js');
const settle = () => new Promise((resolve) => setImmediate(resolve));
const texts = (node) => [...node.walk()].map((n) => n.textContent).join('\n');

test('a GitHub login is finished by the pushed answer; nothing is asked while it runs', async () => {
  asked.length = 0;
  let github = { installed: true, authenticated: false, account: '', attachment: null };
  answer = (url) => {
    if (url.endsWith('/login')) github = { ...github, attachment: { type: 'session', key: 'setup_github' } };
    if (url.endsWith('/close')) github = { ...github, attachment: null };
    return { ...github };
  };
  let finished = 0;
  const surface = createGithubWorkspaceSetup({
    environment: { mountProviderSetupSession: () => ({ park() {}, destroy() {} }) },
    onAuthenticated: () => { finished++; },
  });
  const host = new FakeNode('div');
  surface.items[0].renderDetail(host);
  await settle();
  [...host.walk()].find((n) => n.tagName === 'BUTTON' && n.textContent === 'Connect GitHub').click();
  await settle();
  assert.deepEqual(asked, ['GET /api/setup/github', 'POST /api/setup/github/login']);

  store.receive({ t: 'github-setup', github: { installed: true, authenticated: false, account: '', attachment: { type: 'session', key: 'setup_github' } } });
  await settle();
  assert.equal(finished, 0, 'a push that has not moved to signed-in only repaints');
  assert.deepEqual(asked, ['GET /api/setup/github', 'POST /api/setup/github/login'], 'no request while the login runs');

  store.receive({ t: 'github-setup', github: { installed: true, authenticated: true, account: 'octo-cat', attachment: { type: 'session', key: 'setup_github' } } });
  await settle();
  assert.equal(finished, 1, 'the pushed sign-in finishes the flow');
  assert.deepEqual(asked.slice(2), ['POST /api/setup/github/close'], 'finishing closes the session, and asks nothing else');

  store.receive({ t: 'github-setup', github: { installed: true, authenticated: true, account: 'someone-else' } });
  await settle();
  assert.equal(finished, 1, 'with the session gone the surface no longer listens');
  surface.destroy();
  await settle();
});

test('gbrain paints the install from its own answer, then from pushes, and never polls', async () => {
  asked.length = 0;
  const running = (log) => ({ installed: false, install: { state: 'running', op: 'install', log } });
  answer = (url, options) => (options.method === 'POST' ? running(['weights']) : { installed: false, install: { state: 'idle', log: [] } });
  const root = new FakeNode('div');
  const room = buildGbrain(root, () => {}, {});
  room.enter();
  await settle();
  assert.match(texts(root), /Not installed/);
  [...root.walk()].find((n) => n.tagName === 'BUTTON' && n.dataset.action === 'load').click();
  await settle();
  assert.deepEqual(asked, ['GET /api/gbrain', 'POST /api/gbrain/install']);
  assert.match(texts(root), /Installing…/, 'the press paints its own answer');

  store.receive({ t: 'gbrain', snapshot: running(['weights', 'gbrain pinned']) });
  assert.match(texts(root), /gbrain pinned/, 'a pushed step paints');
  store.receive({ t: 'gbrain', snapshot: { installed: true, process: { state: 'running' }, search: { weights: 'running' }, integrationsKnown: true, integrations: [] } });
  assert.match(texts(root), /Installed · running/, 'the closing push paints the result');
  assert.deepEqual(asked, ['GET /api/gbrain', 'POST /api/gbrain/install'], 'nothing is asked while it runs');

  room.close();
  store.receive({ t: 'gbrain', snapshot: running(['after close']) });
  assert.doesNotMatch(texts(root), /after close/, 'closed: the push is not heard');
});

test('the Services surface follows a confirmation and an install by push, and never polls', async () => {
  const { createServicesSurface } = await import('../public/js/setup-surfaces.js');
  asked.length = 0;
  const reg = (extra = {}) => ({ status: 'pending', services_entitled: false, ...extra });
  const bare = { services: { installed: false, switched_on: false, restart_needed: false, parts: [], loaded: [] } };
  answer = (url, options) => {
    if (url.startsWith('/api/setup/registration')) return reg({ email_masked: 'p***@example.com' });
    if (url.startsWith('/api/installed')) return bare;
    if (url.startsWith('/api/services/activation')) return { stage: 'awaiting_email' };
    if (url === '/api/services/install' && options.method === 'POST') return { registration: reg({ services_entitled: true }), installed: bare, activation: { stage: 'installing' } };
    if (url.startsWith('/api/campaigns')) return [];
    return {};
  };
  const surface = createServicesSurface({ tenant: {}, environment: {}, workspace: 'workspace2' });
  await surface.show();
  assert.match(texts(surface.el), /Confirmation email sent to p\*\*\*@example.com/);
  const opened = asked.length;

  store.receive({ t: 'services-setup', services: { registration: reg({ services_entitled: true }), installed: bare, activation: { stage: 'verified' } } });
  assert.match(texts(surface.el), /Registered · Ready to install/, 'the confirmation lands by push');
  assert.equal(asked.length, opened, 'no request while waiting on the email');

  [...surface.el.walk()].find((n) => n.tagName === 'BUTTON' && n.dataset.step === 'install').click();
  await settle();
  assert.deepEqual(asked.slice(opened), ['POST /api/services/install'], 'the press asks once');
  assert.match(texts(surface.el), /Installing Services…/, 'and paints its own answer');

  surface.leave();
  store.receive({ t: 'services-setup', services: { registration: reg({ services_entitled: true }), installed: bare, activation: { stage: 'verified' } } });
  assert.match(texts(surface.el), /Installing Services…/, 'closed: the push is not heard');
});
