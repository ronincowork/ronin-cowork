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

const [{ makeTileTranscript }, { Tile }, { syncTileHead }, { S }, { transcriptHandlers }] = await Promise.all([
  import('../public/js/tile-transcript.js'),
  import('../public/js/tile.js'),
  import('../public/js/tilehead.js'),
  import('../public/js/state.js'),
  import('../public/js/events.js'),
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
  assert.equal(button.textContent, 'Term');
  assert.equal(button.attributes['aria-pressed'], 'true');
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
  const view = makeTileTranscript({ read: async () => withReadings([record('x')], 'notes'), watch() {}, onState: (s) => states.push(s) });
  await view.probe('agent');
  assert.equal(view.el.children.length, 0);
  assert.deepEqual(states, [{ available: true, empty: false, reason: '', readings: READINGS, view: 'notes' }]);
  // A reading named on show is carried in the URL the OPEN asks for, and switching reading
  // restarts the view on the new reading's own stream.
  const urls = [];
  const view2 = makeTileTranscript({
    read: async (url) => { urls.push(url); return withReadings([record('y')], 'chat'); },
    watch() {} });
  view2.show('agent', 'chat');
  await tick();
  view2.setReading('work');
  await tick();
  assert.match(urls[0], /transcript\?view=chat&tail=\d+$/, 'an empty tab asks for the last X of its reading');
  assert.match(urls[1], /transcript\?view=work&tail=\d+$/, 'and switching reading asks again for the new one');
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





test('opening tells the server what this tab shows, and asks for the last screenful', async () => {
  const said = [];
  const urls = [];
  const view = makeTileTranscript({
    read: async (url) => { urls.push(url); return withReadings([record('newest')], 'chat'); },
    watch: (session, reading) => said.push([session, reading]),
  });
  view.show('agent', 'chat');
  await tick();
  // Registered BEFORE the fetch, so a record written while the page is in flight is
  // delivered rather than missed.
  assert.deepEqual(said, [['agent', 'chat']]);
  assert.match(urls[0], /\/api\/sessions\/agent\/transcript\?view=chat&tail=\d+$/);
  assert.deepEqual(contents(view.el), ['newest']);
  view.hide();
  assert.deepEqual(said.at(-1), ['', ''], 'and hiding stops delivery rather than leaving it on');
});

test('a record the server sends is appended; one it already holds is ignored', async () => {
  // The single append authority: socket and fetch both pass through it, keyed on seq.
  const view = makeTileTranscript({
    read: async () => ({ ok: true, data: { available: true, view: 'chat', readings: READINGS, more: false,
      records: [{ seq: 4, role: 'agent', kind: 'say', text: 'held already' }] } }),
    watch() {},
  });
  view.show('agent', 'chat');
  await tick();
  assert.deepEqual(contents(view.el), ['held already']);

  const deliver = (records) => [...transcriptHandlers].forEach((fn) => fn({ t: 'transcript', session: 'agent', reading: 'chat', records }));
  deliver([{ seq: 5, role: 'agent', kind: 'say', text: 'said next' }]);
  assert.deepEqual(contents(view.el), ['held already', 'said next']);

  // The same record again — a reconnect fetch overlapping the socket — must not double.
  deliver([{ seq: 5, role: 'agent', kind: 'say', text: 'said next' }]);
  deliver([{ seq: 4, role: 'agent', kind: 'say', text: 'held already' }]);
  assert.deepEqual(contents(view.el), ['held already', 'said next'], 'a seq already held is not appended again');

  // And another Agent's records never enter this tile.
  [...transcriptHandlers].forEach((fn) => fn({ t: 'transcript', session: 'somebody-else', reading: 'chat',
    records: [{ seq: 99, role: 'agent', kind: 'say', text: 'not for this tile' }] }));
  assert.deepEqual(contents(view.el), ['held already', 'said next']);
  view.dispose();
});

test('a reconnect asks for what it missed, from the newest record it holds', async () => {
  const urls = [];
  const view = makeTileTranscript({
    read: async (url) => {
      urls.push(url);
      return { ok: true, data: { available: true, view: 'chat', readings: READINGS, more: false,
        records: url.includes('after=') ? [{ seq: 8, role: 'agent', kind: 'say', text: 'missed this' }]
          : [{ seq: 7, role: 'agent', kind: 'say', text: 'before the drop' }] } };
    },
    watch() {},
  });
  view.show('agent', 'chat');
  await tick();
  assert.deepEqual(contents(view.el), ['before the drop']);

  [...transcriptHandlers].forEach((fn) => fn({ t: 'reconnected' }));
  await tick();
  assert.match(urls[1], /after=7$/, 'it asks from the newest seq it holds, not from the beginning');
  assert.deepEqual(contents(view.el), ['before the drop', 'missed this']);
  view.dispose();
});

/**
 * THE RACES. Four sources feed this view and they arrive in any order; a high-water mark
 * mutated by whoever arrived last loses to every one of these (new_lead, tmux_v2 and
 * mobile_transcript each found one).
 */
const deliver = (msg) => [...transcriptHandlers].forEach((fn) => fn(msg));
const seqsOn = (view) => [...view.el.children]
  .filter((n) => n.className === 'tile-transcript-entry')
  .map((n) => Number(n.attributes['data-seq']));

test('a live record arriving before the opening page does not cost the history', async () => {
  let release;
  const page = new Promise((resolve) => { release = resolve; });
  const view = makeTileTranscript({ read: () => page, watch() {} });
  view.show('agent', 'chat');
  await tick();

  // The socket is quicker than the fetch: seq 100 lands while [71..100] is in flight.
  deliver({ t: 'transcript', session: 'agent', reading: 'chat', records: [{ seq: 100, role: 'agent', kind: 'say', text: 's100' }] });
  assert.deepEqual(seqsOn(view), [100]);

  release({ ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 101, more: true,
    records: Array.from({ length: 30 }, (_, i) => ({ seq: 71 + i, role: 'agent', kind: 'say', text: `s${71 + i}` })) } });
  await tick();

  assert.deepEqual(seqsOn(view), Array.from({ length: 30 }, (_, i) => 71 + i),
    'the whole page is there, in order, and seq 100 appears once');
  view.dispose();
});

test('a live record arriving during a catch-up does not strand the records it was fetched for', async () => {
  let release;
  const gap = new Promise((resolve) => { release = resolve; });
  let call = 0;
  const view = makeTileTranscript({
    read: () => (call++ === 0
      ? Promise.resolve({ ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 11, more: false,
          records: [{ seq: 10, role: 'agent', kind: 'say', text: 's10' }] } })
      : gap),
    watch() {},
  });
  view.show('agent', 'chat');
  await tick();
  assert.deepEqual(seqsOn(view), [10]);

  deliver({ t: 'reconnected' });          // asks after=10
  await tick();
  deliver({ t: 'transcript', session: 'agent', reading: 'chat', records: [{ seq: 13, role: 'agent', kind: 'say', text: 's13' }] });
  assert.deepEqual(seqsOn(view), [10, 13], 'the live one lands while the gap is still in flight');

  release({ ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 14, more: false,
    records: [11, 12, 13].map((seq) => ({ seq, role: 'agent', kind: 'say', text: `s${seq}` })) } });
  await tick();
  assert.deepEqual(seqsOn(view), [10, 11, 12, 13], 'the missed records fill their gap, and 13 is not doubled');
  view.dispose();
});

test('an empty reading still knows where to resume from', async () => {
  const asked = [];
  const view = makeTileTranscript({
    read: async (url) => {
      asked.push(url);
      return url.includes('after=')
        ? { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 43,
            records: [{ seq: 42, role: 'agent', kind: 'say', text: 'said while away' }] } }
        // Nothing this reading admits, but the conversation is at seq 42.
        : { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 42, more: false, records: [] } };
    },
    watch() {},
  });
  view.show('agent', 'chat');
  await tick();
  assert.deepEqual(seqsOn(view), [], 'nothing to show yet');

  deliver({ t: 'reconnected' });
  await tick();
  assert.match(asked[1], /after=41$/, 'it resumes from the end the route reported, not from nothing');
  assert.deepEqual(seqsOn(view), [42], 'and what was written while it was away is recovered');
  view.dispose();
});

test('a frame cut for the reading you just left is not shown in the one you are in', async () => {
  const view = makeTileTranscript({
    read: async () => ({ ok: true, data: { available: true, view: 'work', readings: READINGS, seq: 1, more: false, records: [] } }),
    watch() {},
  });
  view.show('agent', 'work');
  await tick();
  view.setReading('chat');
  await tick();

  // Already on the wire when the reader switched: it belongs to Work.
  deliver({ t: 'transcript', session: 'agent', reading: 'work',
    records: [{ seq: 5, role: 'agent', kind: 'act', text: 'Bash ls' }] });
  assert.deepEqual(seqsOn(view), [], 'a tool record cut for Work never appears in Chat');

  deliver({ t: 'transcript', session: 'agent', reading: 'chat',
    records: [{ seq: 6, role: 'agent', kind: 'say', text: 'for chat' }] });
  assert.deepEqual(seqsOn(view), [6]);
  view.dispose();
});

test('a default-reading tab still accepts what the server sends it', async () => {
  // '' is the subscription key and the server echoes '', while the route reports 'notes'.
  // Comparing against the resolved name would reject every frame this tab is sent.
  const view = makeTileTranscript({
    read: async () => ({ ok: true, data: { available: true, view: 'notes', readings: READINGS, seq: 1, more: false, records: [] } }),
    watch() {},
  });
  view.show('agent', '');
  await tick();
  deliver({ t: 'transcript', session: 'agent', reading: '', records: [{ seq: 2, role: 'agent', kind: 'say', text: 'default reading' }] });
  assert.deepEqual(seqsOn(view), [2]);
  view.dispose();
});

test('the same seq twice inside one response is one record', async () => {
  const view = makeTileTranscript({
    read: async () => ({ ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 4, more: false,
      records: [{ seq: 3, role: 'agent', kind: 'say', text: 'once' }, { seq: 3, role: 'agent', kind: 'say', text: 'once' }] } }),
    watch() {},
  });
  view.show('agent', 'chat');
  await tick();
  assert.deepEqual(seqsOn(view), [3], 'a duplicate inside a batch is still a duplicate');
  view.dispose();
});

test('scrolling to the top asks for the page above, and it lands above', async () => {
  const asked = [];
  const view = makeTileTranscript({
    read: async (url) => {
      asked.push(url);
      const before = /before=(\d+)/.exec(url);
      const from = before ? Number(before[1]) - 30 : 40;
      return { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 70, more: from > 10,
        records: Array.from({ length: 30 }, (_, i) => ({ seq: from + i, role: 'agent', kind: 'say', text: `s${from + i}` })) } };
    },
    watch() {},
  });
  view.show('agent', 'chat');
  await tick();
  assert.deepEqual(seqsOn(view), Array.from({ length: 30 }, (_, i) => 40 + i));

  view.el.scrollTop = 0;
  view.el.dispatchEvent({ type: 'scroll' });
  await tick();
  assert.match(asked[1], /before=40/, 'it asks for what is above the oldest it holds');
  assert.deepEqual(seqsOn(view), Array.from({ length: 60 }, (_, i) => 10 + i),
    'the older page lands above, in order, with no overlap');
  view.dispose();
});

test('a gap wider than one page is filled all the way, not just its newest page', async () => {
  // A tab suspended long enough to miss more than the route's page size used to keep only
  // the newest page of its gap and never learn the rest was missing.
  const MISSED = 1201;
  const doors = [];
  const view = makeTileTranscript({
    read: async (url) => {
      const after = Number(/after=(\d+)/.exec(url)?.[1] ?? NaN);
      const before = Number(/before=(\d+)/.exec(url)?.[1] ?? NaN);
      if (!Number.isFinite(after)) {
        // the opening page: it holds seq 10 and nothing else
        return { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 11, more: false,
          records: [{ seq: 10, role: 'agent', kind: 'say', text: 's10' }] } };
      }
      doors.push([after, Number.isFinite(before) ? before : null]);
      const newest = Number.isFinite(before) ? before - 1 : 10 + MISSED;
      const count = Math.min(500, newest - after);
      const from = newest - count + 1;
      return { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 10 + MISSED + 1,
        more: from > after + 1,
        records: Array.from({ length: count }, (_, i) => ({ seq: from + i, role: 'agent', kind: 'say', text: `s${from + i}` })) } };
    },
    watch() {},
  });
  view.show('agent', 'chat');
  await tick();
  assert.deepEqual(seqsOn(view), [10]);

  deliver({ t: 'reconnected' });
  for (let i = 0; i < 10; i++) await tick();

  const shown = seqsOn(view);
  assert.equal(shown.length, MISSED + 1, `every missed record landed: ${shown.length} of ${MISSED + 1}`);
  assert.deepEqual(shown, [...shown].sort((a, b) => a - b), 'in seq order');
  assert.equal(new Set(shown).size, shown.length, 'each exactly once');
  assert.equal(shown[0], 10);
  assert.equal(shown.at(-1), 10 + MISSED);

  // The lower bound never moved; only `before` stepped backwards.
  assert.ok(doors.length >= 3, `the walk took more than one page: ${doors.length}`);
  assert.deepEqual([...new Set(doors.map(([after]) => after))], [10], 'after stays the snapshotted lower bound');
  const befores = doors.map(([, b]) => b);
  assert.equal(befores[0], null, 'the first page asks with no upper door');
  for (let i = 2; i < befores.length; i++) assert.ok(befores[i] < befores[i - 1], 'before steps backward');
  view.dispose();
});

test('a conversation with nothing in it yet still has a place to resume from', async () => {
  // "Nothing held" is a position, not the absence of one. Treating seq 0 as no checkpoint is
  // how the very first thing an Agent ever says could be lost, if it said it while the
  // socket was down.
  const asked = [];
  const view = makeTileTranscript({
    read: async (url) => {
      asked.push(url);
      return url.includes('after=')
        ? { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 1,
            records: [{ seq: 0, role: 'agent', kind: 'say', text: 'the first thing it said' }] } }
        : { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 0, more: false, records: [] } };
    },
    watch() {},
  });
  view.show('agent', 'chat');
  await tick();
  assert.deepEqual(seqsOn(view), [], 'a genuinely empty conversation');

  deliver({ t: 'reconnected' });
  for (let i = 0; i < 4; i++) await tick();
  assert.equal(asked.filter((u) => u.includes('after=')).length, 1, 'exactly one request');
  assert.match(asked[1], /after=-1$/, 'from before the first record, because it holds none');
  assert.deepEqual(seqsOn(view), [0], 'and seq 0 lands, once');
  view.dispose();
});

test('the gap walk is governed by progress, not by a page count', async () => {
  // A fixed cap is a wider silent gap: above it the tab stops with records missing while
  // saying it fetched all of them. Two things are proved here — a walk far longer than any
  // plausible cap completes, and a route that says "more" without moving does not spin it.
  let pages = 0;
  const long = makeTileTranscript({
    read: async (url) => {
      if (!url.includes('after=')) {
        return { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 1, more: false,
          records: [{ seq: 0, role: 'agent', kind: 'say', text: 's0' }] } };
      }
      pages++;
      const before = Number(/before=(\d+)/.exec(url)?.[1] ?? NaN);
      const newest = Number.isFinite(before) ? before - 1 : 1000;
      return { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 1001, more: newest > 1,
        records: [{ seq: newest, role: 'agent', kind: 'say', text: `s${newest}` }] } };
    },
    watch() {},
  });
  long.show('agent', 'chat');
  await tick();
  deliver({ t: 'reconnected' });
  for (let i = 0; i < 1100; i++) await tick();
  assert.ok(pages > 500, `the walk ran past any fixed cap: ${pages} pages`);
  assert.equal(seqsOn(long).length, 1001, 'and every record landed');
  long.dispose();

  // A route insisting there is more without ever reaching further back.
  let asked = 0;
  const stuck = makeTileTranscript({
    read: async (url) => {
      if (url.includes('after=')) asked++;
      return { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 6, more: true,
        records: [{ seq: 5, role: 'agent', kind: 'say', text: 's5' }] } };
    },
    watch() {},
  });
  stuck.show('agent', 'chat');
  await tick();
  deliver({ t: 'reconnected' });
  for (let i = 0; i < 50; i++) await tick();
  assert.ok(asked <= 3, `it stopped instead of spinning: ${asked} requests`);
  stuck.dispose();
});

test('a walk that fails halfway still owes the whole gap, and the next one pays it', async () => {
  // The loss this prevents: page 1 renders the newest 500, so the newest SEEN jumps to the
  // end of the gap. Resuming from that would skip everything the walk never reached —
  // silently, and for good.
  const MISSED = 1201;
  const doors = [];
  let failOn = 0; // fail the Nth gap request, by count: timing is not a test control
  const view = makeTileTranscript({
    read: async (url) => {
      if (!url.includes('after=')) {
        return { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 11, more: false,
          records: [{ seq: 10, role: 'agent', kind: 'say', text: 's10' }] } };
      }
      const after = Number(/after=(-?\d+)/.exec(url)[1]);
      const before = Number(/before=(\d+)/.exec(url)?.[1] ?? NaN);
      doors.push([after, Number.isFinite(before) ? before : null]);
      if (doors.length === failOn) return { ok: false, kind: 'network', retryable: true };
      const newest = Number.isFinite(before) ? before - 1 : 10 + MISSED;
      const count = Math.min(500, newest - after);
      const from = newest - count + 1;
      return { ok: true, data: { available: true, view: 'chat', readings: READINGS, seq: 10 + MISSED + 1,
        more: from > after + 1,
        records: Array.from({ length: count }, (_, i) => ({ seq: from + i, role: 'agent', kind: 'say', text: `s${from + i}` })) } };
    },
    watch() {},
  });
  view.show('agent', 'chat');
  await tick();
  assert.deepEqual(seqsOn(view), [10]);

  // First recovery: page one lands, page two fails.
  failOn = 2;
  deliver({ t: 'reconnected' });
  for (let i = 0; i < 8; i++) await tick();
  const partial = seqsOn(view).length;
  assert.ok(partial > 1 && partial <= MISSED, `part of the gap is on screen: ${partial}`);
  assert.equal(doors.length, 2, 'it stopped when the page failed');

  // Second recovery: it must start again from where the gap began, not from what it showed.
  failOn = 0;
  deliver({ t: 'reconnected' });
  for (let i = 0; i < 20; i++) await tick();

  assert.deepEqual([...new Set(doors.map(([after]) => after))], [10],
    'every request in both walks keeps the original lower bound');
  const shown = seqsOn(view);
  assert.equal(shown.length, MISSED + 1, `the whole gap is recovered: ${shown.length} of ${MISSED + 1}`);
  assert.deepEqual(shown, [...shown].sort((a, b) => a - b), 'in order');
  assert.equal(new Set(shown).size, shown.length, 'each exactly once, though pages were re-fetched');
  view.dispose();
});
