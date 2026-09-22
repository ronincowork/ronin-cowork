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
  let reading = ''; // the T-level's name on the route; '' lets the route choose its default

  function stop() {
    generation++;
    cancel(timer);
    controller?.abort();
    controller = null;
  }

  function message(value) {
    el.replaceChildren();
    const line = document.createElement('p');
    line.className = 'tile-transcript-message';
    line.textContent = value;
    el.append(line);
  }

  function append(records) {
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    if (!Array.isArray(records) || !records.length) return;
    if (el.firstElementChild?.classList.contains('tile-transcript-message')) el.replaceChildren();
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
      if (!records.length && since === 0) message(t('transcript.empty', 'No transcript output yet.'));
      else append(records);
      // Empty means nothing has ever been shown on this reading, not a quiet poll.
      report(result.data, since === 0 && !records.length ? 0 : 1);
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
    const result = await read(url(name, '', 0, 0), { cache: 'no-store' });
    if (!result.ok || active) return;
    const records = Array.isArray(result.data.records) ? result.data.records : [];
    report(result.data, records.length);
  }

  function show(name, view = '') {
    if (active && session === name && reading === view) return;
    stop();
    session = name;
    reading = view;
    active = true;
    since = 0;
    seq = 0;
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

  return { el, show, hide, probe, setReading };
}
