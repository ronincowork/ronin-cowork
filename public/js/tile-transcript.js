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
  let reading = ''; // the reading's name on the route; '' lets the route choose its default
  let rendered = false; // whether this reading has ever shown a record — the header's 'empty'
  let probing = 0; // the live probe; hide() and a newer probe outdate an older one
  let stance = ''; // what the Agent is doing, as the roster row last said
  let oldest = null; // the lowest seq on screen — where scrolling up carries on from
  let latest = null; // the newest seq held: the tab's own place, and its dedupe key
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
   * THE ONE WAY A RECORD ENTERS THIS VIEW.
   *
   * Everything — the opening page, the records the socket delivers, the page fetched after a
   * reconnect — comes through here, and a record is appended only if its seq is past the
   * newest held. That is what makes two sources incapable of duplicating or reordering
   * anything, and it is why there is no second store to keep in step.
   */
  function append(records) {
    if (!Array.isArray(records) || !records.length) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    const fresh = records
      .filter((rec) => typeof rec?.seq !== 'number' || latest === null || rec.seq > latest)
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    if (!fresh.length) return;
    clearMessage();
    rendered = true;
    for (const rec of fresh) {
      el.append(entryFor(rec));
      if (typeof rec.seq === 'number') latest = latest === null ? rec.seq : Math.max(latest, rec.seq);
    }
    paintStance(); // records append above it; the end of the conversation stays the end
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  /**
   * ONE RECORD, ARRIVING FROM THE BACKWARD STREAM.
   *
   * They come newest first, so each one goes ABOVE the last — which leaves the conversation
   * in its own order, oldest at the top, and paints the last thing said immediately instead
   * of after the whole transcript has been read.
   */
  function prepend(rec) {
    clearMessage();
    rendered = true;
    const first = el.firstElementChild;
    const entry = entryFor(rec);
    if (first) el.insertBefore(entry, first);
    else el.append(entry);
    if (typeof rec.seq === 'number') oldest = oldest === null ? rec.seq : Math.min(oldest, rec.seq);
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
    const records = Array.isArray(result.data.records) ? result.data.records : [];
    const first = records[0];
    if (typeof first?.seq === 'number') oldest = first.seq;
    exhausted = result.data.more === false;
    append(records);
    if (!rendered) message(t('transcript.empty', 'No transcript output yet.'));
    report(result.data, rendered ? 1 : 0);
    el.scrollTop = el.scrollHeight; // the newest is what you opened for
  }

  /**
   * Fill the gap a dropped socket left: what came after the newest record held, once.
   * A tab that was never away has nothing to ask for.
   */
  async function catchUp(token) {
    if (!active || !session || token !== generation || latest === null) return;
    const result = await read(url(session, reading, { after: latest }), { cache: 'no-store' });
    if (!active || token !== generation || !result.ok) return;
    append(Array.isArray(result.data.records) ? result.data.records : []);
  }

  /** Scrolled to the top: the conversation above what is shown. */
  async function earlier(token) {
    if (!active || !session || exhausted || reaching || oldest === null) return;
    reaching = true;
    const anchorHeight = el.scrollHeight;
    const anchorTop = el.scrollTop;
    const result = await read(url(session, reading, { tail: SCREENFUL, before: oldest }), { cache: 'no-store' });
    reaching = false;
    if (!active || token !== generation || !result.ok) return;
    const records = Array.isArray(result.data.records) ? result.data.records : [];
    if (!records.length) { exhausted = true; return; }
    const first = records[0];
    if (typeof first?.seq === 'number') oldest = first.seq;
    exhausted = result.data.more === false;
    // Above what is already shown, and the reader stays where they were looking.
    for (const rec of [...records].reverse()) {
      const top = el.firstElementChild;
      const entry = entryFor(rec);
      if (top) el.insertBefore(entry, top); else el.append(entry);
    }
    rendered = true;
    el.scrollTop = anchorTop + (el.scrollHeight - anchorHeight);
  }

  /** A record the server sent because the Agent wrote it, already cut to this reading. */
  function delivered(msg) {
    if (!active || !session) return;
    if (msg.t === 'reconnected') { void catchUp(generation); return; }
    if (msg.session !== session) return; // another Agent's tab, or a stale registration
    append(Array.isArray(msg.records) ? msg.records : []);
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
    oldest = null;
    latest = null;
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
    oldest = null;
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
