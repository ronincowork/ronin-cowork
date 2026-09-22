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
    this.classList = {
      toggle: (name, force) => {
        const has = this.className.split(/\s+/).filter(Boolean);
        const want = force ?? !has.includes(name);
        this.className = (want ? [...new Set([...has, name])] : has.filter((n) => n !== name)).join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
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
  // Without transcriptLabel on the fake, the row falls back to the old two-state words.
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
  // No reading named: the route chooses its default and echoes it; the URL carries no view.
  assert.match(urls[1], /agent%20one\/transcript\?since=25&seq=1$/);
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

const READINGS = [{ name: 'chat', label: 'Chat' }, { name: 'notes', label: 'Notes' }, { name: 'work', label: 'Work' }, { name: 'all', label: 'All' }];
const withReadings = (records, view) => ({ ok: true, data: { available: true, records, since: 1, seq: 1, view, readings: READINGS } });

test('the button cycles Terminal → Chat → Notes → Work → All → Terminal over the readings the route published', async () => {
  const shown = [];
  const tile = {
    session: 'agent', transcriptOn: false, transcriptLevel: -1, transcriptReadings: [], transcriptState: null,
    transcriptAvailable: () => true, el: { classList: { toggle() {} } }, body: { contains: () => false },
    transcriptView: { show: (name, view) => shown.push(['show', view]), setReading: (view) => shown.push(['set', view]), hide: () => shown.push(['hide']) },
    syncHeader() {}, doFit() {},
  };
  const toggle = () => Tile.prototype.toggleTranscript.call(tile);
  const label = () => Tile.prototype.transcriptLabel.call(tile);
  // Before the route has answered, the first press enters on the route's default, then
  // moves to the first reading the moment the list arrives: the way in is always Chat.
  toggle();
  assert.equal(tile.transcriptOn, true);
  assert.deepEqual(shown, [['show', '']]);
  assert.equal(label(), 'Transcript', 'on, but the route has not named the reading yet');
  Tile.prototype.onTranscriptState.call(tile, { available: true, empty: false, reason: '', readings: READINGS, view: 'notes' });
  assert.equal(label(), 'Chat');
  assert.deepEqual(shown.at(-1), ['set', 'chat']);
  toggle(); assert.equal(label(), 'Notes');
  toggle(); assert.equal(label(), 'Work');
  toggle(); assert.equal(label(), 'All');
  toggle();
  assert.equal(tile.transcriptOn, false);
  assert.equal(label(), 'Terminal', 'the button names where you are, not where a press goes');
  assert.deepEqual(shown.slice(1), [['set', 'chat'], ['set', 'notes'], ['set', 'work'], ['set', 'all'], ['hide']]);
  // With the readings known (a probe answered), the way in is Chat.
  toggle();
  assert.equal(label(), 'Chat');
  assert.deepEqual(shown.at(-1), ['show', 'chat']);
});

test('opaque when the route says unavailable or empty, live when records exist — never by CLI', () => {
  const button = new Node();
  const tile = { transcriptBtn: button, headHelp: {}, session: 'agent', transcriptOn: false, transcriptState: null,
    transcriptReadings: [], transcriptLevel: -1,
    transcriptAvailable: Tile.prototype.transcriptAvailable, transcriptQuiet: Tile.prototype.transcriptQuiet, transcriptLabel: Tile.prototype.transcriptLabel };
  S.services = ['rireki'];
  syncTileHead(tile);
  assert.equal(button.attributes['aria-disabled'], 'false', 'unknown yet is not opaque');
  tile.transcriptState = { available: false, empty: true, reason: 'This Agent’s CLI keeps no readable conversation journal — terminal output only.', readings: [], view: '' };
  syncTileHead(tile);
  assert.equal(button.classList.contains('off'), true, 'quiet to the eye');
  assert.equal(button.attributes['aria-disabled'], 'false', 'operable to assistive tech: the press opens the reason');
  assert.equal(button.title, tile.transcriptState.reason);
  tile.transcriptState = { available: true, empty: true, reason: '', readings: READINGS, view: 'notes' };
  syncTileHead(tile);
  assert.equal(button.classList.contains('off'), true, 'available but nothing written yet is opaque too');
  assert.equal(button.attributes['aria-disabled'], 'false');
  tile.transcriptState = { available: true, empty: false, reason: '', readings: READINGS, view: 'notes' };
  syncTileHead(tile);
  assert.equal(button.classList.contains('off'), false);
  assert.equal(button.attributes['aria-disabled'], 'false');
  assert.equal(button.textContent, 'Terminal');
  tile.transcriptOn = true; tile.transcriptLevel = 0; tile.transcriptReadings = READINGS;
  syncTileHead(tile);
  assert.equal(button.textContent, 'Chat');
  assert.equal(button.attributes['aria-disabled'], 'false', 'while open the button is the way onward, never opaque');
});

test('a probe tells the header what the route offers without rendering anything', async () => {
  const states = [];
  const view = makeTileTranscript({ read: async () => withReadings([record('x')], 'notes'), schedule: () => 1, cancel() {}, onState: (s) => states.push(s) });
  await view.probe('agent');
  assert.equal(view.el.children.length, 0);
  assert.deepEqual(states, [{ available: true, empty: false, reason: '', readings: READINGS, view: 'notes' }]);
  // A reading named on show is carried in the URL, and switching reading restarts from the first record.
  const urls = [];
  const view2 = makeTileTranscript({ read: async (url) => { urls.push(url); return withReadings([record('y')], 'chat'); }, schedule: () => 1, cancel() {} });
  view2.show('agent', 'chat');
  await tick();
  view2.setReading('work');
  await tick();
  assert.match(urls[0], /transcript\?view=chat&since=0&seq=0$/);
  assert.match(urls[1], /transcript\?view=work&since=0&seq=0$/);
  view2.hide();
});

test('an opaque transcript button is still pressable, so the reason can be read in full', async () => {
  const { pressable, headerRow } = await import('../public/js/tilehead.js');
  const row = headerRow('transcriptBtn');
  const tile = { session: 'agent', transcriptOn: false,
    transcriptState: { available: false, empty: true, reason: 'no journal here', readings: [], view: '' },
    transcriptAvailable: () => true, transcriptQuiet: Tile.prototype.transcriptQuiet };
  assert.equal(Tile.prototype.transcriptQuiet.call(tile), 'no journal here', 'the row is quiet');
  assert.equal(pressable(row, tile), true, 'and still opens');
  tile.session = null;
  assert.equal(pressable(row, tile), true, 'no Agent in the tile: the press still lands, and toggleTranscript declines without one');
  const plain = { key: 'other', needs: 'session', quiet: 'none' };
  assert.equal(pressable(plain, tile), false, 'an ordinary quiet control does nothing');
  // The real row through the header pass: quiet class and title, yet announced operable.
  const button = new Node();
  const quietTile = { transcriptBtn: button, headHelp: {}, session: 'agent', transcriptOn: false, transcriptLevel: -1, transcriptReadings: [],
    transcriptState: tile.transcriptState, transcriptAvailable: () => true, transcriptQuiet: Tile.prototype.transcriptQuiet, transcriptLabel: Tile.prototype.transcriptLabel };
  S.services = ['rireki'];
  syncTileHead(quietTile);
  assert.equal(button.classList.contains('off'), true);
  assert.equal(button.title, 'no journal here');
  assert.equal(button.attributes['aria-disabled'], 'false');
});

test('a slow probe for the previous Agent cannot speak for the next one', async () => {
  const states = [];
  let resolveOld;
  const old = new Promise((resolve) => { resolveOld = resolve; });
  const view = makeTileTranscript({
    read: (url) => url.includes('/old/') ? old : Promise.resolve(withReadings([], 'notes')),
    schedule: () => 1, cancel() {}, onState: (s) => states.push(s.reason || (s.empty ? 'empty' : 'has records')),
  });
  void view.probe('old');
  view.hide(); // connect(B) hides first, which outdates every probe in flight
  await view.probe('new');
  resolveOld({ ok: true, data: { available: false, reason: 'old agent gone', records: [] } });
  await tick();
  assert.deepEqual(states, ['empty']);
});

test('empty means this reading never showed a record, not that the last poll was quiet', async () => {
  const states = [];
  const scheduled = [];
  const responses = [withReadings([], 'chat'), withReadings([], 'chat'), withReadings([record('finally')], 'chat'), withReadings([], 'chat')];
  const view = makeTileTranscript({ read: async () => responses.shift(), schedule: (fn) => { scheduled.push(fn); return fn; }, cancel() {},
    onState: (s) => states.push(s.empty) });
  view.show('agent', 'chat');
  await tick(); scheduled.shift()(); await tick(); scheduled.shift()(); await tick(); scheduled.shift()(); await tick();
  assert.deepEqual(states, [true, true, false, false]);
  // Switching reading starts the question over.
  responses.push(withReadings([], 'work'));
  view.setReading('work');
  await tick();
  assert.equal(states.at(-1), true);
  view.hide();
});
