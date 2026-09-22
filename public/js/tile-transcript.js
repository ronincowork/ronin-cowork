/* The journal view is independent of the terminal socket and old Output selector. */
import { request } from './request.js';
import { t } from './lexicon.js';

export function makeTileTranscript() {
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

  function stop() {
    generation++;
    clearTimeout(timer);
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
      const label = document.createElement('strong');
      label.textContent = [rec.role, rec.kind === 'say' ? '' : rec.kind].filter(Boolean).join(' · ');
      const body = document.createElement('pre');
      body.textContent = rec.text || '';
      entry.append(label, body);
      el.append(entry);
    }
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  async function poll(token) {
    if (!active || !session || token !== generation) return;
    controller = new AbortController();
    const url = '/api/sessions/' + encodeURIComponent(session) + '/transcript?view=all&since=' + since + '&seq=' + seq;
    const result = await request(url, { cache: 'no-store', signal: controller.signal });
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
    } else {
      const records = Array.isArray(result.data.records) ? result.data.records : [];
      if (!records.length && since === 0) message(t('transcript.empty', 'No transcript output yet.'));
      else append(records);
      if (Number.isFinite(result.data.since)) since = result.data.since;
      if (Number.isFinite(result.data.seq)) seq = result.data.seq;
    }
    timer = setTimeout(() => void poll(token), 2000);
  }

  function show(name) {
    if (active && session === name) return;
    stop();
    session = name;
    active = true;
    since = 0;
    seq = 0;
    message(t('transcript.loading', 'Loading transcript…'));
    void poll(generation);
  }

  function hide() {
    stop();
    active = false;
    session = null;
    el.replaceChildren();
  }

  return { el, show, hide };
}
