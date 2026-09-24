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
    this.listeners = {};
    this.classList = {
      toggle: (name, force) => {
        const has = this.className.split(/\s+/).filter(Boolean);
        const want = force ?? !has.includes(name);
        this.className = (want ? [...new Set([...has, name])] : has.filter((n) => n !== name)).join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(event) { (this.listeners[event.type] || []).forEach((fn) => fn(event)); return true; }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  remove() { this.parent?.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  append(...nodes) {
    for (const n of nodes) {
      const at = this.children.indexOf(n);
      if (at >= 0) this.children.splice(at, 1); // append MOVES a node it already holds
      n.parent = this;
      this.children.push(n);
    }
  }
  replaceChildren(...nodes) { this.children.forEach((n) => { if (!nodes.includes(n)) n.parent = null; }); this.children = nodes; }
  insertBefore(node, mark) {
    const at = this.children.indexOf(mark);
    node.parent = this;
    this.children.splice(at < 0 ? this.children.length : at, 0, node);
    return node;
  }
  get firstElementChild() { return this.children[0] || null; }
  get scrollHeight() { return this.children.length * 50; }
}

// getElementById answers for the phone document only when a test says it is on one: the
// tile asks that question to decide how far its cycle goes.
globalThis.document = { createElement: () => new Node(), activeElement: null,
  getElementById: (id) => (id === 'phone' && globalThis.__onPhone ? new Node() : null) };
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
/**
 * The opening stream, as the view sees it: a header line, then records newest first.
 * `show()` opens on this now, and the 2 s poll follows it — so a test about the POLL hands
 * back a header and no records, and a test about the OPEN hands back both.
 */
const streamOf = (records = [], since = 0, seq = 0) => async (_url, onLine) => {
  onLine({ available: true, since, seq, readings: [], view: '' });
  for (const rec of records) onLine(rec);
  return { ok: true, status: 200, data: {} };
};
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
  assert.equal(button.textContent, 'Term');
  assert.equal(button.attributes['aria-pressed'], 'true');
});

test('journal view appends from the returned cursor and shows unavailable distinctly', async () => {
  const urls = [];
  const scheduled = [];
  const responses = [answer([record('first')], 25, 1), answer([record('second')], 51, 2),
    { ok: true, data: { available: false, reason: 'no exact binding', records: [] } }];
  const view = makeTileTranscript({
    read: async (url) => { urls.push(url); return responses.shift(); },
    readLines: streamOf(),
    schedule: (fn) => { scheduled.push(fn); return fn; }, cancel() {},
  });
  view.show('agent one');
  await tick();
  scheduled.shift()();
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
  const pending = [];
  let resolveOld;
  const old = new Promise((resolve) => { resolveOld = resolve; });
  const view = makeTileTranscript({
    read: (url) => url.includes('/old/') ? old : Promise.resolve(answer([record('new only')], 9, 1)),
    readLines: streamOf(),
    schedule: (fn) => { pending.push(fn); return 1; }, cancel() {},
  });
  view.show('old');
  view.show('new');
  await tick();
  pending.splice(0).forEach((fn) => void fn()); // the polls the two opens scheduled
  await tick();
  resolveOld(answer([record('old secret')], 10, 1));
  await tick();
  assert.deepEqual(contents(view.el), ['new only']);
  view.hide();
});

test('a reading keeps the way to answer: the composer sends, the hidden terminal is not focused', async () => {
  let raw = 0;
  let focused = 0;
  let composer = null;
  const fake = {
    transcriptOn: true, session: 'agent', transcriptAvailable: () => true, transcriptCycle: Tile.prototype.transcriptCycle, tapeMode: false,
    el: { classList: { toggle() {} } }, body: { contains: () => false },
    transcriptView: { el: { scrollTop: 0, scrollHeight: 50 }, show() {}, hide() {} },
    wire: { sendInput: () => { raw++; return true; } },
    term: { focus: () => { focused++; } }, activate() {}, syncHeader() {}, doFit() {},
    setComposer: (on) => { composer = on; },
  };
  // Owner, 2026-09-23: reading a record is not a reason to lose the entry box. Both
  // deliberate send paths — the box and the keys row that rides it — reach the live Agent.
  assert.equal(Tile.prototype.sendRaw.call(fake, 'x'), true);
  assert.equal(raw, 1);
  // The terminal is behind the reading, so there is nothing on screen to focus, and ⤓
  // belongs to the reading the eye is actually on.
  Tile.prototype.focusTerminal.call(fake);
  Tile.prototype.jumpLatest.call(fake);
  assert.equal(focused, 0);
  assert.equal(fake.transcriptView.el.scrollTop, 50);
  // Leaving the reading on a desktop tile takes the composer away with it.
  Tile.prototype.toggleTranscript.call(fake);
  assert.equal(fake.transcriptOn, false);
  assert.equal(composer, false, 'the composer follows the reading out');
  Tile.prototype.focusTerminal.call(fake);
  assert.equal(focused, 1);
});

test('the composer comes with the reading and goes with it', () => {
  const asked = [];
  const fake = {
    transcriptOn: false, transcriptLevel: -1, transcriptReadings: [{ name: 'chat', label: 'Chat' }],
    session: 'agent', transcriptAvailable: () => true, transcriptCycle: Tile.prototype.transcriptCycle, tapeMode: false,
    el: { classList: { toggle() {} } }, body: { contains: () => false },
    transcriptView: { show() {}, setReading() {}, hide() {} },
    setComposer: (on) => asked.push(on), syncHeader() {}, doFit() {},
  };
  Tile.prototype.toggleTranscript.call(fake);
  assert.deepEqual(asked, [true], 'opening a reading builds the entry box even on a desktop tile');
  Tile.prototype.toggleTranscript.call(fake);
  assert.deepEqual(asked, [true, false]);
});

// The off-state's name, in one place: these assertions are about WHERE the button says
// you are, not about the word chosen for it.
const TERM = 'Term';
const READINGS = [{ name: 'chat', label: 'Chat' }, { name: 'notes', label: 'Notes' }, { name: 'work', label: 'Work' }, { name: 'all', label: 'All' }];
const withReadings = (records, view) => ({ ok: true, data: { available: true, records, since: 1, seq: 1, view, readings: READINGS } });

test('the button cycles Term → Chat → Notes → Work → All → Term over the readings the route published', async () => {
  const shown = [];
  const tile = {
    session: 'agent', transcriptOn: false, transcriptLevel: -1, transcriptReadings: [], transcriptState: null,
    transcriptAvailable: () => true, transcriptCycle: Tile.prototype.transcriptCycle, el: { classList: { toggle() {} } }, body: { contains: () => false },
    transcriptView: { show: (name, view) => shown.push(['show', view]), setReading: (view) => shown.push(['set', view]), hide: () => shown.push(['hide']) },
    setComposer() {}, syncHeader() {}, doFit() {},
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
  assert.equal(label(), TERM, 'the button names where you are, not where a press goes');
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
    transcriptAvailable: Tile.prototype.transcriptAvailable, transcriptCycle: Tile.prototype.transcriptCycle, transcriptQuiet: Tile.prototype.transcriptQuiet, transcriptLabel: Tile.prototype.transcriptLabel };
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
  assert.equal(button.textContent, TERM);
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
  // A reading named on show is carried in the URL the OPEN asks for, and switching reading
  // restarts the view on the new reading's own stream.
  const urls = [];
  const view2 = makeTileTranscript({
    read: async () => withReadings([record('y')], 'chat'),
    readLines: async (url, onLine) => { urls.push(url); onLine({ available: true, since: 0, seq: 0, readings: [], view: '' }); return { ok: true }; },
    schedule: () => 1, cancel() {} });
  view2.show('agent', 'chat');
  await tick();
  view2.setReading('work');
  await tick();
  assert.match(urls[0], /transcript\?stream&view=chat$/);
  assert.match(urls[1], /transcript\?stream&view=work$/);
  view2.hide();
});

test('an opaque transcript button is still pressable, so the reason can be read in full', async () => {
  const { pressable, headerRow } = await import('../public/js/tilehead.js');
  const row = headerRow('transcriptBtn');
  const tile = { session: 'agent', transcriptOn: false,
    transcriptState: { available: false, empty: true, reason: 'no journal here', readings: [], view: '' },
    transcriptAvailable: () => true, transcriptCycle: Tile.prototype.transcriptCycle, transcriptQuiet: Tile.prototype.transcriptQuiet };
  assert.equal(Tile.prototype.transcriptQuiet.call(tile), 'no journal here', 'the row is quiet');
  assert.equal(pressable(row, tile), true, 'and still opens');
  tile.session = null;
  assert.equal(pressable(row, tile), true, 'no Agent in the tile: the press still lands, and toggleTranscript declines without one');
  const plain = { key: 'other', needs: 'session', quiet: 'none' };
  assert.equal(pressable(plain, tile), false, 'an ordinary quiet control does nothing');
  // The real row through the header pass: quiet class and title, yet announced operable.
  const button = new Node();
  const quietTile = { transcriptBtn: button, headHelp: {}, session: 'agent', transcriptOn: false, transcriptLevel: -1, transcriptReadings: [],
    transcriptState: tile.transcriptState, transcriptAvailable: () => true, transcriptCycle: Tile.prototype.transcriptCycle, transcriptQuiet: Tile.prototype.transcriptQuiet, transcriptLabel: Tile.prototype.transcriptLabel };
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
  const view = makeTileTranscript({ read: async () => responses.shift(), readLines: streamOf(),
    schedule: (fn) => { scheduled.push(fn); return fn; }, cancel() {},
    onState: (s) => states.push(s.empty) });
  view.show('agent', 'chat');
  await tick(); scheduled.shift()(); await tick(); scheduled.shift()(); await tick(); scheduled.shift()(); await tick();
  // The open reports first (nothing shown yet), then each poll.
  assert.deepEqual(states, [true, true, true, false]);
  // Switching reading starts the question over.
  responses.push(withReadings([], 'work'));
  view.setReading('work');
  await tick();
  assert.equal(states.at(-1), true);
  view.hide();
});

test('on a phone the cycle is two states: Term and the conversation, from the route\'s own list', () => {
  const shown = [];
  const tile = {
    session: 'agent', transcriptOn: false, transcriptLevel: -1, transcriptReadings: READINGS, transcriptState: null,
    transcriptAvailable: () => true, transcriptCycle: Tile.prototype.transcriptCycle, tapeMode: false,
    el: { classList: { toggle() {} } }, body: { contains: () => false },
    transcriptView: { show: (name, view) => shown.push(['show', view]), setReading: (view) => shown.push(['set', view]), hide: () => shown.push(['hide']) },
    setComposer() {}, syncHeader() {}, doFit() {},
  };
  const toggle = () => Tile.prototype.toggleTranscript.call(tile);
  const label = () => Tile.prototype.transcriptLabel.call(tile);
  globalThis.__onPhone = true;
  try {
    // Owner, 2026-09-23: Term or Chat on a phone. Notes, Work and All are a desk thing.
    toggle();
    assert.equal(label(), 'Chat');
    toggle();
    assert.equal(tile.transcriptOn, false, 'the second press comes straight back to Term');
    assert.equal(label(), TERM);
    assert.deepEqual(shown, [['show', 'chat'], ['hide']], 'it never walks to Notes');
    // The same tile on a desk keeps every reading the route published.
    globalThis.__onPhone = false;
    toggle(); toggle();
    assert.equal(label(), 'Notes');
  } finally { globalThis.__onPhone = false; }
});

test('the end of the conversation says what the Agent is doing, from the row and nothing else', async () => {
  const view = makeTileTranscript({
    read: async () => ({ ok: true, data: { available: true, records: [record('a line')], since: 1, seq: 1, view: 'chat', readings: READINGS } }),
    schedule: () => 0, cancel() {},
  });
  const indicator = () => view.el.children.find((n) => n.className === 'tile-transcript-stance');
  view.show('agent', 'chat');
  await tick();

  // Nothing said yet: nothing shown. The tile never guesses.
  assert.equal(indicator(), undefined);

  // At work, and writing: three dots, on the Agent's side, at the end.
  view.setStance('working');
  assert.equal(indicator()?.children.length, 3, 'three dots');
  assert.equal(view.el.children.at(-1), indicator(), 'and they are the end of the conversation');
  view.setStance('replying');
  assert.equal(indicator()?.children.length, 3);

  // Your turn: the end of the conversation is empty, which is how it says so.
  view.setStance('awaiting_you');
  assert.equal(indicator(), undefined);

  // Stopped at a question: words, not dots — the person has to do something.
  view.setStance('asking');
  assert.equal(indicator()?.children.length, 0, 'no dots');
  assert.equal(indicator()?.textContent, 'Waiting for your answer');

  // Nothing known: nothing shown, rather than a guess.
  view.setStance('unknown');
  assert.equal(indicator(), undefined);
  view.setStance('working');
  view.hide();
  assert.equal(indicator(), undefined, 'and it goes with the reading');
});

test('on a tablet the cycle is Term, Chat and Work — Notes and All stay on the desk', () => {
  const shown = [];
  const tile = {
    session: 'agent', transcriptOn: false, transcriptLevel: -1, transcriptReadings: READINGS, transcriptState: null,
    transcriptAvailable: () => true, transcriptCycle: Tile.prototype.transcriptCycle, tapeMode: false,
    el: { classList: { toggle() {} } }, body: { contains: () => false },
    transcriptView: { show: (name, view) => shown.push(['show', view]), setReading: (view) => shown.push(['set', view]), hide: () => shown.push(['hide']) },
    setComposer() {}, syncHeader() {}, doFit() {},
  };
  const toggle = () => Tile.prototype.toggleTranscript.call(tile);
  const label = () => Tile.prototype.transcriptLabel.call(tile);
  const coarse = globalThis.window.matchMedia;
  globalThis.window.matchMedia = (q) => ({ matches: /coarse/.test(q) });
  try {
    // Owner, 2026-09-23: on the iPad only Terminal, Chat and Work are on offer.
    toggle();
    assert.equal(label(), 'Chat');
    toggle();
    assert.equal(label(), 'Work', 'Notes is skipped, not merely unlabelled');
    toggle();
    assert.equal(tile.transcriptOn, false, 'past Work it comes back to the terminal');
    assert.equal(label(), TERM);
    assert.deepEqual(shown, [['show', 'chat'], ['set', 'work'], ['hide']], 'it never walks to Notes or All');
  } finally {
    globalThis.window.matchMedia = coarse;
  }
});

test('the view opens on the end of the conversation, painting each record as it arrives', async () => {
  // The stream hands back newest first; the view puts each above the last, so the reader
  // sees the final thing said immediately and the order stays the conversation's own.
  const painted = [];
  let deliver;
  const view = makeTileTranscript({
    read: async () => answer([], 9, 9),
    readLines: async (_url, onLine) => {
      onLine({ available: true, since: 9, seq: 9, readings: READINGS, view: 'chat' });
      deliver = onLine;
      for (const seq of [4, 3, 2]) { onLine({ seq, role: 'agent', kind: 'say', text: `line ${seq}` }); painted.push(contents(view.el).join('|')); }
      return { ok: true, status: 200, data: {} };
    },
    schedule: () => 1, cancel() {},
  });
  view.show('agent', 'chat');
  await tick();
  assert.equal(painted[0], 'line 4', 'the newest is on screen after ONE record, not after all of them');
  assert.deepEqual(contents(view.el), ['line 2', 'line 3', 'line 4'], 'and they end up in the order they were said');
  assert.ok(deliver, 'the view read the stream rather than waiting for a whole body');
  view.hide();
});

test('the view takes a screenful and lets go, rather than reading a whole conversation', async () => {
  let sent = 0;
  const view = makeTileTranscript({
    read: async () => answer([], 1, 1),
    readLines: async (_url, onLine, opts) => {
      onLine({ available: true, since: 1, seq: 1, readings: READINGS, view: 'chat' });
      for (let seq = 500; seq > 0 && !opts.signal?.aborted; seq--) { onLine({ seq, role: 'agent', kind: 'say', text: `s${seq}` }); sent++; }
      return { ok: true, status: 200, data: {} };
    },
    schedule: () => 1, cancel() {},
  });
  view.show('agent', 'chat');
  await tick();
  // One number, phone and desk alike: the open is fast because the FIRST record paints,
  // not because of how many follow it. This only bounds what is built behind that.
  assert.equal(sent, 30);
  view.hide();
});

test('the history walk dies with the view, rather than reading on for nobody', async () => {
  // earlier() used to hold a controller of its own, so hiding or switching reading left the
  // callbacks stale while the network walk carried on to the beginning of the conversation.
  let aborted = false;
  let stillReading = true;
  const view = makeTileTranscript({
    read: async () => answer([], 1, 1),
    readLines: async (url, onLine, opts) => {
      onLine({ available: true, since: 1, seq: 1, readings: READINGS, view: 'chat' });
      if (!url.includes('before=')) {
        // A full screenful, so the view knows there is more above it to ask for.
        for (let seq = 30; seq > 0; seq--) onLine({ seq, role: 'agent', kind: 'say', text: `s${seq}` });
        return { ok: true };
      }
      // The history stream: it keeps going until somebody stops it.
      opts.signal?.addEventListener?.('abort', () => { aborted = true; stillReading = false; });
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { ok: aborted ? false : true, kind: aborted ? 'abort' : undefined };
    },
    schedule: () => 1, cancel() {},
  });
  view.show('agent', 'chat');
  await tick();
  view.el.scrollTop = 0;
  view.el.dispatchEvent?.({ type: 'scroll' });
  void view.earlier?.();
  view.hide();
  await tick();
  assert.equal(stillReading, false, 'hiding the view ended the walk it had started');
});

test('a poll cannot take the controller from a stream that is still reading', async () => {
  // The race: earlier() is awaiting, the 2 s poll fires, and it used to assign itself a new
  // controller — so a later hide aborted the poll and left the history walk running.
  let reads = 0;
  let historyAborted = false;
  let releaseHistory;
  const scheduled = [];
  const view = makeTileTranscript({
    read: async () => { reads++; return answer([], 1, 1); },
    readLines: async (url, onLine, opts) => {
      onLine({ available: true, since: 1, seq: 1, readings: READINGS, view: 'chat' });
      if (!url.includes('before=')) {
        for (let seq = 30; seq > 0; seq--) onLine({ seq, role: 'agent', kind: 'say', text: `s${seq}` });
        return { ok: true };
      }
      opts.signal?.addEventListener?.('abort', () => { historyAborted = true; });
      await new Promise((resolve) => { releaseHistory = resolve; });
      return { ok: false, kind: 'abort' };
    },
    schedule: (fn) => { scheduled.push(fn); return scheduled.length; }, cancel() {},
  });
  view.show('agent', 'chat');
  await tick();

  // Scrolled to the top: the history stream starts and stays pending.
  view.el.scrollTop = 0;
  view.el.dispatchEvent({ type: 'scroll' });
  await tick();
  const before = reads;

  // The poll the open scheduled fires while that walk is still going.
  scheduled.shift()();
  await tick();
  assert.equal(reads, before, 'the poll waited its turn instead of starting alongside');

  view.hide();
  await tick();
  assert.equal(historyAborted, true, 'and hiding aborted the walk that was actually running');
  releaseHistory?.();
});
