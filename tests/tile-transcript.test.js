import test from 'node:test';
import assert from 'node:assert/strict';

class Node {
  constructor() {
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.scrollTop = 0;
    this.clientHeight = 100;
    this.attributes = {};
    this.classList = { toggle() {}, contains: (name) => this.className.split(/\s+/).includes(name) };
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  get firstElementChild() { return this.children[0] || null; }
  get scrollHeight() { return this.children.length * 50; }
}

globalThis.document = { createElement: () => new Node(), activeElement: null };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Linux' }, configurable: true });

const [{ makeTileTranscript }, { Tile }, { syncTileHead }, { S }] = await Promise.all([
  import('../public/js/tile-transcript.js'),
  import('../public/js/tile.js'),
  import('../public/js/tilehead.js'),
  import('../public/js/state.js'),
]);
const tick = () => new Promise((resolve) => setImmediate(resolve));
const record = (text) => ({ role: 'agent', kind: 'say', text });
const answer = (records, since, seq) => ({ ok: true, data: { available: true, records, since, seq } });
const contents = (el) => el.children.filter((n) => n.className === 'tile-transcript-entry')
  .map((n) => n.textContent);

test('header toggle appears only with loaded Rireki and changes its label', () => {
  const button = new Node();
  const tile = { transcriptBtn: button, headHelp: {}, session: 'agent', transcriptOn: false,
    transcriptAvailable: Tile.prototype.transcriptAvailable };
  S.services = [];
  syncTileHead(tile);
  assert.equal(button.hidden, true);
  S.services = ['rireki'];
  syncTileHead(tile);
  assert.equal(button.hidden, false);
  assert.equal(button.textContent, 'Transcript');
  tile.transcriptOn = true;
  syncTileHead(tile);
  assert.equal(button.textContent, 'Terminal');
  assert.equal(button.attributes['aria-pressed'], 'true');
});

test('journal view appends from the returned cursor and shows unavailable distinctly', async () => {
  const urls = [];
  const scheduled = [];
  const responses = [answer([record('first')], 25, 1), answer([record('second')], 51, 2),
    { ok: true, data: { available: false, reason: 'no exact binding', records: [] } }];
  const view = makeTileTranscript({
    read: async (url) => { urls.push(url); return responses.shift(); },
    schedule: (fn) => { scheduled.push(fn); return fn; }, cancel() {},
  });
  view.show('agent one');
  await tick();
  assert.deepEqual(contents(view.el), ['first']);
  scheduled.shift()();
  await tick();
  assert.match(urls[1], /agent%20one\/transcript\?view=all&since=25&seq=1$/);
  assert.deepEqual(contents(view.el), ['first', 'second']);
  scheduled.shift()();
  await tick();
  assert.equal(view.el.children[0].textContent, 'no exact binding');
  view.hide();
});

test('stale response from the previous session cannot enter the next transcript', async () => {
  let resolveOld;
  const old = new Promise((resolve) => { resolveOld = resolve; });
  const view = makeTileTranscript({
    read: (url) => url.includes('/old/') ? old : Promise.resolve(answer([record('new only')], 9, 1)),
    schedule: () => 1, cancel() {},
  });
  view.show('old');
  view.show('new');
  await tick();
  resolveOld(answer([record('old secret')], 10, 1));
  await tick();
  assert.deepEqual(contents(view.el), ['new only']);
  view.hide();
});

test('Transcript blocks every tile input path and Terminal restores them', async () => {
  let raw = 0;
  let focused = 0;
  const fake = {
    transcriptOn: true, session: 'agent', transcriptAvailable: () => true,
    el: { classList: { toggle() {} } }, body: { contains: () => false },
    transcriptView: { el: { scrollTop: 0, scrollHeight: 50 }, show() {}, hide() {} },
    wire: { sendInput: () => { raw++; return true; } },
    term: { focus: () => { focused++; } }, activate() {}, syncHeader() {}, doFit() {},
  };
  assert.equal(Tile.prototype.sendRaw.call(fake, 'x'), false);
  assert.equal((await Tile.prototype.sendMessage.call(fake, 'hello')).ok, false);
  Tile.prototype.focusTerminal.call(fake);
  Tile.prototype.jumpLatest.call(fake);
  assert.equal(raw, 0);
  assert.equal(focused, 0);
  assert.equal(fake.transcriptView.el.scrollTop, 50);
  Tile.prototype.toggleTranscript.call(fake);
  assert.equal(fake.transcriptOn, false);
  assert.equal(Tile.prototype.sendRaw.call(fake, 'x'), true);
  assert.equal(raw, 1);
  Tile.prototype.focusTerminal.call(fake);
  assert.equal(focused, 1);
});
