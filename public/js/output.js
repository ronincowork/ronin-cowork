/* The six session outputs. Cowork owns the selector; services own every unlocked source. */
export const OUTPUTS = [
  ['locked', 'Locked'],
  ['terminal_mirror', 'Terminal Mirror'],
  ['detailed', 'Detailed'],
  ['condensed', 'Condensed'],
  ['conversation', 'Conversation'],
  ['agent_summary', 'Agent Summary'],
];

/** Build the one per-tile control. Server capability is applied by Tile.syncOutput(). */
export function makeOutput(tile) {
  const el = document.createElement('select');
  el.className = 'output';
  el.setAttribute('aria-label', 'Output');
  el.title = 'Output shown in this tile';
  for (const [value, label] of OUTPUTS) el.add(new Option(label, value));
  el.addEventListener('change', () => tile.setOutput(el.value));
  return { el };
}

export async function refreshKaki(tile, request, create, force = false) {
  if (!tile.session || tile.output !== 'agent_summary') return;
  const path = '/api/sessions/' + encodeURIComponent(tile.session) + '/kaki';
  let r = await request(path);
  if (r.ok) tile.tape.setSummaryPolicy(r.data.policy);
  if (r.ok && r.data.text && !force) { tile.tape.setSummary(r.data.text); return; }
  tile.tape.setSummary('', create ? 'Writing a summary…' : 'No summary has been written yet.');
  if (!create) return;
  r = await request(path, { method: 'POST', json: {} });
  if (!r.ok) { tile.tape.setSummary('', 'Summary unavailable — ' + r.message); return; }
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
