/* The journal view is independent of the terminal socket and old Output selector. */
import { request, requestLines } from './request.js';
import { t } from './lexicon.js';

/**
 * @param onState  told after every read what the route said about this Agent's transcript:
 *                 { available, empty, reason, readings, view } — the header's opaque state
 *                 and the T-levels come from here, never from a list kept in the tile.
 */
export function makeTileTranscript({ read = request, readLines = requestLines, schedule = setTimeout,
  cancel = clearTimeout, onState = () => {} } = {}) {
  const el = document.createElement('div');
  el.className = 'tile-transcript';
  el.setAttribute('role', 'log');
  el.setAttribute('aria-label', t('transcript.title', 'Transcript'));
  let session = null;
  let active = false;
  let generation = 0;
  let timer = null;
  let controller = null;
  let since = 0;
  let seq = 0;
  let reading = ''; // the reading's name on the route; '' lets the route choose its default
  let rendered = false; // whether this reading has ever shown a record — the header's 'empty'
  let probing = 0; // the live probe; hide() and a newer probe outdate an older one
  let stance = ''; // what the Agent is doing, as the roster row last said
  let oldest = null; // the lowest seq on screen — where scrolling up carries on from
  let exhausted = false; // the backward walk reached the beginning of the conversation
  let opening = false; // a backward stream is running; the forward poll waits for its cursor
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
    cancel(timer);
    controller?.abort();
    controller = null;
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

  function append(records) {
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (!Array.isArray(records) || !records.length) return;
    clearMessage();
    rendered = true;
    for (const rec of records) el.append(entryFor(rec));
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

  function url(name, view, from, at) {
    return '/api/sessions/' + encodeURIComponent(name) + '/transcript?'
      + (view ? 'view=' + encodeURIComponent(view) + '&' : '') + 'since=' + from + '&seq=' + at;
  }

  /** The backward stream: newest first, optionally from where the last one stopped. */
  function streamUrl(name, view, before) {
    return '/api/sessions/' + encodeURIComponent(name) + '/transcript?stream'
      + (view ? '&view=' + encodeURIComponent(view) : '')
      + (before === null || before === undefined ? '' : '&before=' + before);
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
   * OPEN AT THE END. The records arrive newest first and each is put above the last, so the
   * final thing said is on screen after one line has been read instead of after all of them.
   * The header comes first and carries where the live poll starts, so the two directions
   * meet without overlapping.
   */
  async function open(token) {
    if (!active || !session || token !== generation) return;
    opening = true;
    controller = new AbortController();
    let taken = 0;
    let header = null;
    const result = await readLines(streamUrl(session, reading, null), (value) => {
      if (!active || token !== generation) return;
      if (header === null) { header = value; return; }
      prepend(value);
      if (++taken >= SCREENFUL) controller?.abort(); // a screenful is enough to look at
    }, { cache: 'no-store', signal: controller.signal });
    if (!active || token !== generation) return;
    controller = null;
    opening = false;
    if (header) {
      exhausted = taken < SCREENFUL;
      if (Number.isFinite(header.since)) since = header.since;
      if (Number.isFinite(header.seq)) seq = header.seq;
      report(header, rendered ? 1 : 0);
      if (!rendered) message(t('transcript.empty', 'No transcript output yet.'));
      el.scrollTop = el.scrollHeight; // the newest is what you were opening for
    } else if (result.ok === false && result.kind !== 'abort') {
      // Aborting is this view's own doing and is not a failure of anything.
      message(t('transcript.failed', 'Transcript could not be loaded. Retrying…'));
    }
    timer = schedule(() => void poll(token), 2000);
  }

  /** Scrolled to the top: the conversation above what is shown, from the same stream. */
  async function earlier(token) {
    if (!active || !session || exhausted || opening || oldest === null) return;
    opening = true;
    const before = oldest;
    const anchorHeight = el.scrollHeight;
    const anchorTop = el.scrollTop;
    let taken = 0;
    let header = null;
    // The SHARED controller, not one of its own: hiding the view or switching reading has
    // to end this walk too. With a private controller the callbacks went stale and the
    // network read carried on to the beginning of the conversation for nobody, because
    // `taken` stopped advancing and nothing else could stop it (found in review).
    controller = new AbortController();
    const reach = controller;
    await readLines(streamUrl(session, reading, before), (value) => {
      if (!active || token !== generation) return;
      if (header === null) { header = value; return; }
      prepend(value);
      if (++taken >= SCREENFUL) reach.abort();
    }, { cache: 'no-store', signal: reach.signal });
    if (controller === reach) controller = null;
    if (!active || token !== generation) return;
    opening = false;
    if (taken < SCREENFUL) exhausted = true;
    // Keep the reader where they were looking: the page grew above them.
    el.scrollTop = anchorTop + (el.scrollHeight - anchorHeight);
  }

  async function poll(token) {
    if (!active || !session || token !== generation) return;
    // A stream owns the controller while it runs, and taking it would orphan that walk: a
    // later hide would abort this poll instead of the history read, which would then carry
    // on to the beginning of the conversation for nobody (found in review). The poll waits
    // its turn rather than stamping on it.
    if (opening) {
      timer = schedule(() => void poll(token), 2000);
      return;
    }
    controller = new AbortController();
    const result = await read(url(session, reading, since, seq), { cache: 'no-store', signal: controller.signal });
    if (!active || token !== generation) return;
    controller = null;
    if (!result.ok) {
      since = 0;
      seq = 0;
      message(t('transcript.failed', 'Transcript could not be loaded. Retrying…'));
    } else if (result.data.available === false) {
      since = 0;
      seq = 0;
      message(result.data.reason || t('transcript.unavailable', 'Transcript unavailable for this Agent.'));
      report(result.data, 0);
    } else {
      const records = Array.isArray(result.data.records) ? result.data.records : [];
      if (!records.length && !rendered) message(t('transcript.empty', 'No transcript output yet.'));
      else append(records);
      for (const rec of records) if (typeof rec.seq === 'number' && oldest === null) oldest = rec.seq;
      // Empty means this reading has never shown a record — not that this poll was quiet.
      report(result.data, rendered ? 1 : 0);
      if (Number.isFinite(result.data.since)) since = result.data.since;
      if (Number.isFinite(result.data.seq)) seq = result.data.seq;
    }
    timer = schedule(() => void poll(token), 2000);
  }

  /**
   * One read, nothing rendered: enough for the header to know whether this Agent has a
   * transcript before anyone presses the button, and which readings the route offers.
   */
  async function probe(name) {
    if (!name) return;
    const token = ++probing;
    const result = await read(url(name, '', 0, 0), { cache: 'no-store' });
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
    since = 0;
    seq = 0;
    oldest = null;
    exhausted = false;
    rendered = false;
    message(t('transcript.loading', 'Loading transcript…'));
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
    active = false;
    opening = false;
    session = null;
    oldest = null;
    exhausted = false;
    el.replaceChildren();
  }

  return { el, show, hide, probe, setReading, setStance };
}
