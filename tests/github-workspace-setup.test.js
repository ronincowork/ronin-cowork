import test from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; this.removed = false; this.value = ''; }
  append(...nodes) { this.children.push(...nodes.filter(Boolean)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  querySelectorAll(selector) { return [...this.walk()].filter((node) => selector === '[data-sws-id]' && node.dataset.swsId); }
  querySelector(selector) { return [...this.walk()].find((node) => selector === '.sws-state' && node.className === 'sws-state') || null; }
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
  click() { for (const callback of this.listeners.click || []) callback({ currentTarget: this }); }
}

globalThis.Node = FakeNode;
globalThis.document = {
  createElement: (tag) => new FakeNode(tag),
  createTextNode: (text) => Object.assign(new FakeNode('#text'), { textContent: text }),
  querySelector: () => null,
  head: { append() {} },
};
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval: () => {} };
Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Linux' }, configurable: true });

const { createGithubWorkspaceSetup } = await import('../public/js/github-workspace-setup.js');
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('connected GitHub offers one server-owned removal action and keeps clone separate', async () => {
  const calls = [];
  let github = { installed: true, authenticated: true, account: 'octo-cat', attachment: null };
  let finishes = 0;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/login')) github = { ...github, attachment: { type: 'session', key: 'setup_github' } };
    if (url.endsWith('/close')) github = { ...github, attachment: null };
    if (url.endsWith('/logout')) github = { installed: true, authenticated: false, account: '', attachment: null };
    return { ok: true, status: 200, json: async () => ({ ...github }) };
  };
  const surface = createGithubWorkspaceSetup({
    environment: { mountProviderSetupSession: () => ({ park() {}, destroy() {} }) },
    onAuthenticated: () => { finishes++; },
  });
  const host = new FakeNode('div');
  surface.items[0].renderDetail(host);
  await settle();
  const button = (label) => [...host.walk()].find((n) => n.tagName === 'BUTTON' && n.textContent === label);
  assert.equal(button('Connect GitHub').hidden, true);
  assert.equal(button('Remove authentication').hidden, false);
  assert.equal(surface.items[0].state, 'Connected · octo-cat');
  button('Remove authentication').click(); await settle();
  const logout = calls.find((c) => c.url.endsWith('/logout'));
  assert.equal(logout.options.body, undefined, 'the server discovers the active account; the browser cannot name another one');
  assert.equal(button('Remove authentication').hidden, true);
  assert.ok(button('Connect GitHub'));
  assert.equal(surface.items[1].disabled, true);
  assert.equal(finishes, 0, 'removal is not authentication completion');
  surface.destroy(); await settle();
});

test('missing GitHub CLI offers one Install button and mounts its visible provider session', async () => {
  const calls = [];
  let mounts = 0;
  let github = { installed: false, authenticated: false, account: '', installing: false, attachment: null };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/install')) github = {
      ...github, installing: true,
      attachment: { type: 'session', key: 'install_github', team: 'provider_setup', temporary: true },
    };
    return { ok: true, status: 200, json: async () => ({ ...github }) };
  };
  const surface = createGithubWorkspaceSetup({
    environment: { mountProviderSetupSession: ({ session }) => { assert.equal(session, 'install_github'); mounts++; return { park() {}, destroy() {} }; } },
  });
  const host = new FakeNode('div');
  surface.items[0].renderDetail(host); await settle();
  const button = (label) => [...host.walk()].find((node) => node.tagName === 'BUTTON' && node.textContent === label);
  assert.equal(button('Install').hidden, false);
  assert.equal(button('Connect GitHub').hidden, true);
  button('Install').click(); await settle();
  assert.ok(calls.some((call) => call.url.endsWith('/install') && call.options.method === 'POST'));
  assert.equal(mounts, 1);
  surface.destroy(); await settle();
});

test('an unreadable GitHub result is distinct from signed out and keeps cloning blocked', async () => {
  globalThis.fetch = async () => ({
    ok: true, status: 200, json: async () => ({
      installed: true, authenticated: false, account: '', state: 'unreadable',
      problem: 'Ronin could not ask GitHub CLI to verify authentication.', attachment: null,
    }),
  });
  const surface = createGithubWorkspaceSetup();
  const host = new FakeNode('div');
  surface.items[0].renderDetail(host); await settle();
  const text = [...host.walk()].map((node) => node.textContent).filter(Boolean);
  assert.ok(text.includes('Ronin could not ask GitHub CLI to verify authentication.'));
  assert.ok(text.includes('Could not verify'));
  assert.equal(surface.items[1].disabled, true);
  surface.destroy(); await settle();
});
