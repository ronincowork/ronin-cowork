import { t } from './lexicon.js';
// A function, not a table: the lexicon loads after this module is evaluated.
/*
 * Two, because two can be produced.
 *
 * Detailed, Condensed, Cherry Pick and Agent Summary were projections of the tape, and
 * nothing writes a tape any more: no part sends the tile a `mode: 'tape'` record, so
 * choosing one showed an empty tile while Desk Settings promised it "arrives with Ronin
 * Services" — which was installed. The projections themselves are not deleted and never
 * will be; what goes is the OFFER of a view nothing feeds (owner, 2026-09-23).
 *
 * Agent Summary is the one with a future: Koshi writes it, and she is being moved off the
 * parked recorder onto the journal store. It comes back with her or not at all — see
 * RIREKI_CLEANLINESS.md, the Koshi redirect. The client half below is left standing for
 * that, inert while nothing can select it.
 */
function OUTPUTS() {
  return [
    ['locked', t('output.locked', 'Locked')],
    ['terminal_mirror', t('output.terminal_mirror', 'Terminal Mirror')],
  ];
}

/** Build the one per-tile control. Server capability is applied by Tile.syncOutput(). */
export function makeOutput(tile) {
  const el = document.createElement('select');
  el.className = 'output';
  el.setAttribute('aria-label', t('output.aria', 'Output'));
  el.title = t('output.title', 'Output shown in this tile');
  for (const [value, label] of OUTPUTS()) el.add(new Option(label, value));
  el.addEventListener('change', () => tile.setOutput(el.value));
  return { el };
}

export async function refreshKaki(tile, request, create, force = false) {
  if (!tile.session || tile.output !== 'agent_summary') return;
  const path = '/api/sessions/' + encodeURIComponent(tile.session) + '/kaki';
  let r = await request(path);
  if (r.ok) tile.tape.setSummaryPolicy(r.data.policy);
  if (r.ok && r.data.text && !force) { tile.tape.setSummary(r.data.text); return; }
  tile.tape.setSummary('', create ? t('tape.writing_summary', 'Writing a summary…') : t('tape.no_summary', 'No summary has been written yet.'));
  if (!create) return;
  r = await request(path, { method: 'POST', json: {} });
  if (!r.ok) { tile.tape.setSummary('', t('tape.summary_unavailable', 'Summary unavailable — {message}', { message: r.message })); return; }
  tile.tape.setSummary((r.data.chunks || []).map((c) => c.summary).join('\n\n'));
}

export async function setKakiPolicy(tile, request, policy) {
  if (!tile.session) return null;
  const r = await request('/api/sessions/' + encodeURIComponent(tile.session) + '/kaki/policy', {
    method: 'PUT', json: { policy },
  });
  if (r.ok) tile.tape.setSummaryPolicy(r.data.policy);
  return r;
}
