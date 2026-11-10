/* part of the ronin-cowork client — see js/README.md */
/**
 * THE INTEGRATIONS PANEL (KAN-339) — every integration in the index in one frame, each the
 * same way whether Ronin has a bridge for it or not: connected or not, the Workspaces using
 * it, where its token lives, which keys are set and which are missing, and its bridge. A
 * record with a panel of its own (Jira's) shows that panel inside the frame, as it works on
 * its own; any other gets Connect, which writes its `.env`, and Disconnect, which removes it.
 * The token goes out on Connect and is never read back: only key names come back.
 * Over /api/integrations (src/routes/integrations-api.ts).
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { el } from './form-steps.js';
import { createPhalanx } from './phalanx.js';

const BRIDGE = {
  running: () => t('integrations.bridge_running', 'running'),
  parked: () => t('integrations.bridge_parked', 'on this machine, not running (Services › Ronin Services)'),
  other: () => t('integrations.bridge_other', 'not a Services part running here'),
};

/** What is set and what is missing, across the index, in one line. */
export function integrationsLine(rows) {
  if (!rows.length) return t('integrations.none_in_index', 'The integrations index is empty.');
  const on = rows.filter((row) => row.connected);
  if (!on.length) return t('integrations.nothing_connected', 'Nothing is connected yet. {n} integrations in the index; each needs its token before Agents can use it.', { n: rows.length });
  const missing = on.filter((row) => row.missing.length).map((row) => `${row.label} (${row.missing.join(', ')})`);
  return [
    t('integrations.connected_n', '{n} of {all} connected: {names}.', { n: on.length, all: rows.length, names: on.map((row) => row.label).join(', ') }),
    missing.length ? t('integrations.keys_missing', 'Keys missing: {list}.', { list: missing.join('; ') }) : '',
  ].filter(Boolean).join(' ');
}

/** `campaign()` is the selected Campaign; `panels[name](host)` builds a record's own panel ({el, enter}). */
export function createIntegrationsPanel(campaign, { panels = {}, embedded = false } = {}) {
  const { createSurface, createAction, createActionBar, createNotice } = WorkspaceKit.primitives;
  const refresh = createAction({ label: t('integrations.refresh', 'Refresh'), size: 'compact', action: () => void load() });
  const surface = embedded ? null : createSurface({ label: t('integrations.title', 'Integrations'), className: 'setup-surface integrations-surface', actions: [refresh] });
  const host = embedded ? el('section', 'integrations-embedded') : surface.content;
  if (embedded) host.append(el('h3', 'integrations-heading', t('integrations.title', 'Integrations')));
  const line = el('p', 'setup-lede integrations-line');
  line.setAttribute('role', 'status');
  const notice = createNotice();
  let rows = [];
  let busy = false;

  const id = () => campaign()?.id || '';
  const stateWord = (row) => (row.connected ? t('integrations.connected', 'Connected') : t('integrations.not_connected', 'Not connected'));
  const itemFor = (row) => ({ id: row.name, label: row.label, state: stateWord(row), attrs: { 'data-connected': String(row.connected) } });

  const fact = (dl, label, value) => { const item = el('div', 'setup-gbrain-answer'); item.append(el('dt', '', label), el('dd', '', value)); dl.append(item); };

  function facts(row) {
    const dl = el('dl', 'setup-gbrain-answers integrations-facts');
    fact(dl, t('integrations.what', 'What it is'), row.blurb || '—');
    if (row.for) fact(dl, t('integrations.for', 'For'), row.for);
    fact(dl, t('integrations.tools', 'Tools'), row.tools || t('integrations.tools_own', 'its own CLI and API'));
    fact(dl, t('integrations.bridge', 'Bridge'), row.bridge ? `${row.bridge} · ${BRIDGE[row.bridge_state]?.() ?? ''}` : t('integrations.no_bridge', 'none: Agents use its own tools'));
    fact(dl, t('integrations.token', 'Token'), `${row.token_file} · ${row.connected ? t('integrations.file_there', 'there') : t('integrations.file_not_there', 'not there yet')}`);
    if (row.keys.length || row.set.length) {
      fact(dl, t('integrations.keys_set', 'Keys set'), row.set.join(', ') || t('integrations.none', 'none'));
      fact(dl, t('integrations.keys_missing_label', 'Keys missing'), row.missing.join(', ') || t('integrations.none', 'none'));
    }
    fact(dl, t('integrations.workspaces', 'Workspaces using it'), row.workspaces.join(', ') || t('integrations.no_workspaces', 'none yet: add it on a Workspace'));
    return dl;
  }

  /** Connect: one field per key the record names (a key of your own when it names none). */
  function connectForm(row) {
    const form = el('form', 'integrations-connect');
    const inputs = [];
    const field = (label, input) => { const wrap = el('label', 'integrations-field'); wrap.append(el('span', '', label), input); form.append(wrap); };
    const keys = row.keys.length ? row.keys : [''];
    for (const key of keys) {
      const name = key ? null : Object.assign(el('input', 'integrations-key'), { type: 'text', placeholder: 'KEY_NAME', autocomplete: 'off', spellcheck: false });
      const value = Object.assign(el('input', 'integrations-value'), { type: 'password', autocomplete: 'off', placeholder: row.set.includes(key) ? t('integrations.set_replace', 'set · type to replace') : '' });
      if (name) field(t('integrations.key', 'Key'), name);
      field(key || t('integrations.value', 'Value'), value);
      inputs.push({ key, name, value });
    }
    const connect = createAction({ label: row.connected ? t('integrations.save_keys', 'Save keys') : t('integrations.connect', 'Connect'), size: 'compact', kind: 'primary', action: () => form.requestSubmit() });
    const actions = [connect];
    if (row.connected) actions.push(createAction({ label: t('integrations.disconnect', 'Disconnect'), size: 'compact', action: () => void disconnect(row) }));
    form.append(createActionBar({ actions }).el);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(inputs.map(({ key, name, value }) => [key || name.value.trim(), value.value]).filter(([k, v]) => k && v));
      void run(row, request(`/api/integrations/${encodeURIComponent(row.name)}/connect`, { method: 'PUT', json: { campaign_id: id(), values } }),
        t('integrations.connected_to', 'Written to {file}.'));
    });
    return form;
  }

  const disconnect = (row) => run(row, request(`/api/integrations/${encodeURIComponent(row.name)}/connect?campaign_id=${encodeURIComponent(id())}`, { method: 'DELETE' }),
    t('integrations.removed', 'Removed {file}.'));

  async function run(row, pending, said) {
    if (busy) return;
    busy = true;
    notice.set('info', t('integrations.saving', 'Saving…'));
    const result = await pending;
    busy = false;
    notice.set(result.ok ? 'success' : 'failed', result.ok ? said.replace('{file}', result.data.file) : result.message);
    if (result.ok) await load(row.name);
  }

  /** LIVE where a bridge reports state: what its route says, beside the facts; a value is never a token. */
  function live(row) {
    const box = el('dl', 'setup-gbrain-answers integrations-live');
    if (!row.state || row.bridge_state !== 'running') return box;
    const url = row.state.replaceAll('{campaign}', encodeURIComponent(id())).replaceAll('{workspace}', encodeURIComponent(row.workspaces[0] || ''));
    void request(url, { cache: 'no-store' }).then((result) => {
      if (!result.ok) { fact(box, t('integrations.bridge_says', 'Bridge says'), result.message); return; }
      for (const [key, value] of Object.entries(result.data || {})) {
        if (value === null || value === '' || typeof value === 'object') continue;
        fact(box, key, String(value));
      }
    });
    return box;
  }

  function renderDetail(item, detail) {
    const row = rows.find((one) => one.name === item.id);
    if (!row) return () => {};
    detail.append(facts(row), live(row));
    const own = row.panel && panels[row.panel] ? panels[row.panel]() : null;
    if (own) { detail.append(own.el); void (own.enter ?? own.show)?.(); }
    else if (row.panel) detail.append(el('p', 'setup-lede', t('integrations.own_panel_elsewhere', '{label} connects in its own panel: Settings › Integrations › {label}.', { label: row.label })));
    else detail.append(connectForm(row));
    return () => own?.destroy?.();
  }

  // In Settings, stones and the detail beside them; inside Setup's Installations, one fold per
  // integration under Ronin Services (a phalanx seats only in a surface's own content).
  const stones = embedded ? null : createPhalanx({ items: [], className: 'integrations-stones', renderDetail });
  const folds = embedded ? el('div', 'integrations-folds') : null;
  const open = new Set();
  let cleanups = [];
  if (stones) stones.mount(host, { before: [line, notice.el] });
  else host.append(line, notice.el, folds);
  const paintFolds = () => {
    for (const done of cleanups) done();
    cleanups = [];
    folds.replaceChildren(...rows.map((row) => {
      const fold = el('details', 'integrations-fold');
      fold.dataset.connected = String(row.connected);
      fold.open = open.has(row.name);
      fold.append(el('summary', '', `${row.label} · ${stateWord(row)}`));
      const body = el('div', 'integrations-fold-body');
      fold.append(body);
      fold.addEventListener('toggle', () => { if (fold.open) open.add(row.name); else open.delete(row.name); });
      cleanups.push(renderDetail({ id: row.name }, body));
      return fold;
    }));
  };

  async function load(keep = '') {
    refresh.setDisabled(true);
    const result = await request(`/api/integrations?campaign_id=${encodeURIComponent(id())}`, { cache: 'no-store' });
    refresh.setDisabled(false);
    if (!result.ok) { line.textContent = t('integrations.read_failed', 'The integrations could not be read: {error}', { error: result.message }); return; }
    rows = Array.isArray(result.data.integrations) ? result.data.integrations : [];
    line.textContent = integrationsLine(rows);
    if (!stones) { paintFolds(); return; }
    stones.setItems(rows.map(itemFor));
    if (keep) stones.select(keep);
  }

  return { el: embedded ? host : surface.el, enter: () => { notice.set('', ''); return load(); }, destroy: () => { stones?.destroy(); for (const done of cleanups) done(); } };
}
