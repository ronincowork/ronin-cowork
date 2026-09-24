/* The journal view is independent of the terminal socket and old Output selector. */
import { request } from './request.js';
import { transcriptHandlers, watchTranscript } from './events.js';
import { t } from './lexicon.js';

/**
 * @param onState  told after every read what the route said about this Agent's transcript:
 *                 { available, empty, reason, readings, view } — the header's opaque state
 *                 and the T-levels come from here, never from a list kept in the tile.
 */
/**
 * @param watch  tells the server what this tab is showing; the server sends only that
 *               Agent's records, already cut to that reading. Injected for testing.
 */
export function makeTileTranscript({ read = request, watch = watchTranscript, onState = () => {} } = {}) {
  const el = document.createElement('div');
  el.className = 'tile-transcript';
  el.setAttribute('role', 'log');
  el.setAttribute('aria-label', t('transcript.title', 'Transcript'));
  let session = null;
  let active = false;
  let generation = 0;
  /*
   * THE WIRE READING IS THE SUBSCRIPTION KEY, and it is what a delivered frame must match.
   *
   * '' means "whatever the route calls default", and the server echoes '' back on the
   * frames it sends. The route separately reports the view it RESOLVED that to ('notes'),
   * which is what the header shows. Comparing a frame against the resolved name would
   * reject every frame of a default-reading tab; comparing against the wire key is exact
   * (new_lead's ruling). The two are kept apart deliberately.
   */
  let reading = ''; // the subscription key: '' until the person picks a reading
  let resolved = ''; // what the route called it — for display, never for matching
  let rendered = false; // whether this reading has ever shown a record — the header's 'empty'
  let probing = 0; // the live probe; hide() and a newer probe outdate an older one
  let stance = ''; // what the Agent is doing, as the roster row last said
  /*
   * ONE ORDERED SET, AND EVERY CURSOR DERIVED FROM IT.
   *
   * Four sources feed this view — the opening page, a page from scrolling up, a catch-up
   * after a reconnect, and the socket — and they race. A high-water mark mutated by arrival
   * order loses to every one of those races: a live seq 100 landing before the opening page
   * [71..100] returns would throw the whole page away, and a live 13 landing during a
   * catch-up would discard the 11 and 12 it was fetched for (found by new_lead, tmux_v2 and
   * mobile_transcript, each from a different angle).
   *
   * So the tab holds the seqs it has, records go in by seq wherever they belong, and
   * `oldest`/`newest` are read off the set rather than assigned by whoever arrived last.
   */
  const held = new Set(); // every seq rendered
  let frontier = null; // the newest seq known to EXIST — held, or merely reported by the route
  const oldestHeld = () => (held.size ? Math.min(...held) : null);
  const newestHeld = () => (held.size ? Math.max(...held) : null);
  let exhausted = false; // the backward walk reached the beginning of the conversation
  let reaching = false; // a scroll-up fetch is in flight; one at a time
  let stanceNode = null; // the indicator itself, held rather than looked up

  /**
   * THE END OF THE CONVERSATION, as it stands right now.
   *
   * Three bouncing dots on the Agent's side while it is working or replying, exactly where
   * its next line will appear; nothing at all when it is your turn, because an empty end is
   * how a conversation says it is waiting for you. `asking` is neither: the Agent cannot go
   * on until the person answers, and that is worth a sentence rather than a decoration.
   *
   * The value is the row's — the tile is told, and infers nothing (owner's rule). It lives
   * as the last child of the log so the view scrolls to it like any other line.
   */
  function paintStance() {
    const shows = active && (stance === 'working' || stance === 'replying' || stance === 'asking');
    if (!shows) {
      stanceNode?.remove();
      stanceNode = null;
      return;
    }
    if (!stanceNode) {
      stanceNode = document.createElement('div');
      stanceNode.className = 'tile-transcript-stance';
      stanceNode.setAttribute('aria-live', 'polite');
    }
    if (stanceNode.getAttribute?.('data-stance') !== stance) {
      stanceNode.setAttribute('data-stance', stance);
      stanceNode.replaceChildren();
      const words = stance === 'asking'
        ? t('transcript.stance_asking', 'Waiting for your answer')
        : t('transcript.stance_working', 'Working');
      if (stance === 'asking') stanceNode.textContent = words;
      else for (let i = 0; i < 3; i++) stanceNode.append(document.createElement('i'));
      stanceNode.setAttribute('aria-label', words);
    }
    // Always last: records append above it, so the end of the conversation stays the end.
    el.append(stanceNode);
  }

  function stop() {
    generation++;
    probing++;
  }

  function message(value) {
    el.replaceChildren();
    stanceNode = null;
    const line = document.createElement('p');
    line.className = 'tile-transcript-message';
    line.textContent = value;
    el.append(line);
    // An Agent can be at work with nothing said yet — 'Loading', or a reading with no
    // records in it. The message is the log's whole content, so the indicator is put back
    // after it rather than lost with the children it replaced.
    paintStance();
  }

  function entryFor(rec) {
    const entry = document.createElement('div');
    entry.className = 'tile-transcript-entry';
    // Who and what, for the stylesheet: a note reads quieter than speech, a tool call
    // quieter still. The text itself is exactly what the route sent.
    // Its own place in the conversation, so a record arriving late can be put where it goes.
    if (typeof rec.seq === 'number') entry.setAttribute('data-seq', String(rec.seq));
    entry.setAttribute('data-role', rec.role || '');
    entry.setAttribute('data-kind', rec.kind || '');
    entry.textContent = rec.text || '';
    return entry;
  }

  /** The log was showing a message ('Loading…', a reason); the first record replaces it. */
  function clearMessage() {
    if (el.firstElementChild?.classList.contains('tile-transcript-message')) {
      el.replaceChildren();
      stanceNode = null;
    }
  }

  /**
   * THE ONE WAY A RECORD ENTERS THIS VIEW — by its own seq, into its own place.
   *
   * Two sources feed this: the socket, and a fetch. They race, and a high-water mark cannot
   * merge them — if the socket's seq 100 lands before the opening page [71..100] returns,
   * a "newer than the newest held" rule throws the whole page away and the reader is left
   * with one line where their conversation was (new_lead, review).
   *
   * So each seq is remembered individually and a record that arrives late is INSERTED where
   * it belongs rather than appended. A record already held is ignored whichever door it came
   * through; a gap filled later closes in place; the order on screen is always seq order.
   */
  function insertInOrder(entry, seq) {
    const kids = el.children;
    if (typeof seq !== 'number') { el.append(entry); return; }
    // From the end: almost everything belongs there, and a record filling a gap walks only
    // as far as the gap. Children without a seq — the end-of-conversation indicator — are
    // stepped over, and paintStance puts it back at the end afterwards.
    let at = kids.length - 1;
    for (; at >= 0; at--) {
      const seen = Number(kids[at].getAttribute?.('data-seq'));
      if (Number.isFinite(seen) && seen < seq) break;
    }
    const next = kids[at + 1];
    if (next) el.insertBefore(entry, next);
    else el.append(entry);
  }

  function merge(records) {
    if (!Array.isArray(records) || !records.length) return 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    const taking = new Set(); // duplicates INSIDE one response are duplicates too
    const fresh = records
      .filter((rec) => {
        const seq = rec?.seq;
        if (typeof seq !== 'number') return true;
        if (held.has(seq) || taking.has(seq)) return false;
        taking.add(seq);
        return true;
      })
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    if (!fresh.length) return 0;
    clearMessage();
    rendered = true;
    for (const rec of fresh) {
      if (typeof rec.seq === 'number') {
        held.add(rec.seq);
        frontier = frontier === null ? rec.seq : Math.max(frontier, rec.seq);
      }
      insertInOrder(entryFor(rec), rec.seq);
    }
    paintStance(); // the end-of-conversation indicator stays the end
    if (atBottom) el.scrollTop = el.scrollHeight;
    return fresh.length;
  }
  const append = merge;

  /**
   * How far the conversation had got when the server last spoke, whether or not this reading
   * showed any of it. Without this an empty Chat has nothing to reconnect from, and anything
   * written while its socket was down is lost (new_lead, review).
   */
  function noteEnd(answer) {
    const end = Number(answer?.seq);
    if (!Number.isFinite(end) || end <= 0) return;
    frontier = frontier === null ? end - 1 : Math.max(frontier, end - 1);
  }

  function url(name, view, door = {}) {
    const query = Object.entries(door).filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
    if (view) query.unshift('view=' + encodeURIComponent(view));
    return '/api/sessions/' + encodeURIComponent(name) + '/transcript' + (query.length ? '?' + query.join('&') : '');
  }

  /*
   * HOW MUCH TO TAKE BEFORE LETTING GO.
   *
   * One number, everywhere. The first entry is on screen as soon as ONE record has been
   * read — measured at 467 ms against a 1.4 MB transcript on a throttled phone, where the
   * old whole-body read took 4.9 s — so this does not decide how fast the view opens. It
   * only bounds how much is built behind it, and a screenful is what a reader can look at
   * on either a phone or a desk. Scrolling up asks for more, which is the gesture they
   * would use anyway.
   */
  const SCREENFUL = 30;

  /** What the route said, in the shape the header reads. `shown` is what this read carried. */
  function report(data, shown) {
    const readings = Array.isArray(data.readings) ? data.readings : [];
    onState({
      available: data.available !== false,
      empty: data.available === false || shown === 0,
      reason: data.reason || '',
      readings,
      view: typeof data.view === 'string' ? data.view : '',
    });
  }

  /**
   * OPEN AT THE END: the last screenful of this reading, in one bounded request.
   *
   * Reading the whole conversation to show the end of it was the wait — 4.9 s to a first
   * entry on a 133 KB transcript over slow 3G. Live records do not come through here at all;
   * they arrive on the event socket because the CLI wrote them.
   */
  async function open(token) {
    if (!active || !session || token !== generation) return;
    const result = await read(url(session, reading, { tail: SCREENFUL }), { cache: 'no-store' });
    if (!active || token !== generation) return;
    if (!result.ok) {
      // An unreadable answer is a failure and says so. It is never an empty conversation.
      message(t('transcript.failed', 'Transcript could not be loaded. Retrying…'));
      return;
    }
    if (result.data.available === false) {
      message(result.data.reason || t('transcript.unavailable', 'Transcript unavailable for this Agent.'));
      report(result.data, 0);
      return;
    }
    // The end the route reports, kept whether or not this reading showed any of it: an
    // empty Chat still has a place to reconnect from, and without it anything written while
    // its socket was down would be lost (new_lead, review).
    noteEnd(result.data);
    if (typeof result.data.view === 'string') resolved = result.data.view;
    exhausted = result.data.more === false;
    merge(Array.isArray(result.data.records) ? result.data.records : []);
    if (!rendered) message(t('transcript.empty', 'No transcript output yet.'));
    report(result.data, rendered ? 1 : 0);
    el.scrollTop = el.scrollHeight; // the newest is what you opened for
  }

  /**
   * Fill the gap a dropped socket left: what came after the newest record held, once.
   * A tab that was never away has nothing to ask for.
   */
  async function catchUp(token) {
    // The frontier, not the newest record shown: a reading with nothing in it still knows
    // where the conversation had got to, and asks from there.
    if (!active || !session || token !== generation || frontier === null) return;
    const from = frontier;
    const result = await read(url(session, reading, { after: from }), { cache: 'no-store' });
    if (!active || token !== generation || !result.ok) return;
    noteEnd(result.data);
    // Whatever arrived live while this was in flight is already held; the rest fills in by
    // seq, wherever it belongs.
    merge(Array.isArray(result.data.records) ? result.data.records : []);
  }

  /** Scrolled to the top: the conversation above what is shown. */
  async function earlier(token) {
    const from = oldestHeld();
    if (!active || !session || exhausted || reaching || from === null) return;
    reaching = true;
    const anchorHeight = el.scrollHeight;
    const anchorTop = el.scrollTop;
    const result = await read(url(session, reading, { tail: SCREENFUL, before: from }), { cache: 'no-store' });
    reaching = false;
    if (!active || token !== generation || !result.ok) return;
    const records = Array.isArray(result.data.records) ? result.data.records : [];
    if (!records.length) { exhausted = true; return; }
    exhausted = result.data.more === false;
    // Through the same merge as everything else: they land above what is shown because
    // their seqs are lower, not because this function prepends them.
    merge(records);
    // The page grew above the reader; keep them where they were looking.
    el.scrollTop = anchorTop + (el.scrollHeight - anchorHeight);
  }

  /** A record the server sent because the Agent wrote it, already cut to this reading. */
  function delivered(msg) {
    if (!active || !session) return;
    if (msg.t === 'reconnected') { void catchUp(generation); return; }
    if (msg.session !== session) return; // another Agent's tab, or a stale registration
    // A frame already on the wire when the reader switched reading belongs to the reading it
    // was cut for. Showing Work's tool records inside Chat is exactly what the server-side
    // filter exists to prevent, so the last hop checks too (new_lead, review).
    if ((msg.reading || '') !== reading) return;
    merge(Array.isArray(msg.records) ? msg.records : []);
  }

  /**
   * One read, nothing rendered: enough for the header to know whether this Agent has a
   * transcript before anyone presses the button, and which readings the route offers.
   */
  async function probe(name) {
    if (!name) return;
    const token = ++probing;
    const result = await read(url(name, '', { tail: 1 }), { cache: 'no-store' });
    // A slow probe for the Agent this tile no longer shows must not speak for the new one.
    if (token !== probing || !result.ok || active) return;
    const records = Array.isArray(result.data.records) ? result.data.records : [];
    report(result.data, records.length);
  }

  /** The roster row's word on what this Agent is doing. Nothing is polled for it. */
  function setStance(next) {
    const value = typeof next === 'string' ? next : '';
    if (value === stance) return;
    stance = value;
    paintStance();
  }

  function show(name, view = '') {
    if (active && session === name && reading === view) return;
    stop();
    session = name;
    reading = view;
    active = true;
    held.clear();
    frontier = null;
    exhausted = false;
    rendered = false;
    message(t('transcript.loading', 'Loading transcript…'));
    // Tell the server what this tab is showing before asking for anything, so a record
    // written while the first page is in flight is delivered rather than missed.
    watch(name, view);
    void open(generation);
  }

  // Scrolled to the very top, with more conversation above: fetch it.
  el.addEventListener?.('scroll', () => {
    if (el.scrollTop <= 0) void earlier(generation);
  });

  /** Same Agent, another T-level: start the reading over from its first record. */
  function setReading(view) {
    if (!active || !session) return;
    const name = session;
    active = false;
    show(name, view);
  }

  function hide() {
    stop();
    watch('', ''); // nothing is being shown: the server stops sending
    active = false;
    reaching = false;
    session = null;
    held.clear();
    frontier = null;
    exhausted = false;
    el.replaceChildren();
  }

  // The view listens for its Agent's records for as long as it exists. `delivered` ignores
  // anything for another session, so a stale registration cannot write into the wrong tile.
  transcriptHandlers.add(delivered);

  return { el, show, hide, probe, setReading, setStance,
    /** For tests and teardown: stop listening. */
    dispose() { transcriptHandlers.delete(delivered); watch('', ''); } };
}
