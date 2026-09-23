/* The journal view is independent of the terminal socket and old Output selector. */
import { request } from './request.js';
import { t } from './lexicon.js';

/**
 * @param onState  told after every read what the route said about this Agent's transcript:
 *                 { available, empty, reason, readings, view } — the header's opaque state
 *                 and the T-levels come from here, never from a list kept in the tile.
 */
export function makeTileTranscript({ read = request, schedule = setTimeout, cancel = clearTimeout, onState = () => {} } = {}) {
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

  function append(records) {
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (!Array.isArray(records) || !records.length) return;
    if (el.firstElementChild?.classList.contains('tile-transcript-message')) { el.replaceChildren(); stanceNode = null; }
    rendered = true;
    for (const rec of records) {
      const entry = document.createElement('div');
      entry.className = 'tile-transcript-entry';
      // Who and what, for the stylesheet: a note reads quieter than speech, a tool call
      // quieter still. The text itself is exactly what the route sent.
      entry.setAttribute('data-role', rec.role || '');
      entry.setAttribute('data-kind', rec.kind || '');
      entry.textContent = rec.text || '';
      el.append(entry);
    }
    paintStance(); // records append above it; the end of the conversation stays the end
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  function url(name, view, from, at) {
    return '/api/sessions/' + encodeURIComponent(name) + '/transcript?'
      + (view ? 'view=' + encodeURIComponent(view) + '&' : '') + 'since=' + from + '&seq=' + at;
  }

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

  async function poll(token) {
    if (!active || !session || token !== generation) return;
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
    rendered = false;
    message(t('transcript.loading', 'Loading transcript…'));
    void poll(generation);
  }

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
    session = null;
    el.replaceChildren();
  }

  return { el, show, hide, probe, setReading, setStance };
}
