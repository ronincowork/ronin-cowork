/* part of the ronin-cowork client — see js/README.md */
/**
 * THE INTEGRATIONS PANEL (KAN-339; KAN-513) — every integration in one frame, each the same way
 * whether Ronin has a bridge for it or not: the bridges (behaviours with `when: integration:<name>`)
 * and any name a Workspace uses, each with the Workspaces using it, whether its Services part
 * runs, and the secrets saved under `<name>-` (names only). Keys are saved by an Agent's
 * `secret ask`, never here. A name with a panel of its own (Jira's) shows that panel inside the
 * frame, as it works on its own. Over /api/integrations (src/routes/integrations-api.ts).
 *
 * MCP SERVERS (KAN-592; docs/architecture/integrations.md). Each record is a row beside the
 * bridges, with its Campaigns and controls, all through the broker (/api/mcp/*, a Services part):
 * Add (name, address, sign-in) writes the record; Remove is one press; a key record pastes its
 * secret here (POST /api/secrets/<secret>, the field `secret ask` uses; the value is cleared the
 * moment it is sent); an oauth record's Sign in opens /api/mcp/oauth/start in a new tab; the
 * Campaigns it is available to are ticked on the row (none ticked: every Campaign); available is
 * not on: a Campaign, Workspace, Team or Agent integrations switch turns it on. An Add whose
 * key is not saved yet opens the paste field for that secret, then adds again.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { el } from './form-steps.js';
import { createPhalanx } from './phalanx.js';
import { MULTIPLE_CAMPAIGNS_ENABLED, campaigns, loadCampaigns } from './campaigns.js';

const PART = {
  running: () => t('integrations.part_running', 'running'),
  parked: () => t('integrations.part_parked', 'on this machine, not running (Services › Ronin Services)'),
};

const SIGN_IN = {
  key: () => t('integrations.sign_in_key', 'a pasted key'),
  oauth: () => t('integrations.sign_in_oauth', 'OAuth, in the browser'),
  none: () => t('integrations.sign_in_none', 'none'),
};

/** An MCP row's stone word: whether it can be reached yet. */
export function mcpState(mcp) {
  if (mcp.sign_in === 'none') return t('integrations.mcp_ready', 'MCP · ready');
  if (mcp.saved) return mcp.sign_in === 'oauth' ? t('integrations.mcp_signed_in', 'MCP · signed in') : t('integrations.mcp_key_saved', 'MCP · key saved');
  return mcp.sign_in === 'oauth' ? t('integrations.mcp_sign_in', 'MCP · sign in') : t('integrations.mcp_key_needed', 'MCP · key needed');
}

/** The answer's lines, or its error, as one line. */
const said = (result) => (result.ok ? (result.data?.lines ?? []).join(' ') : result.message);

/** How many have keys saved, across the list, in one line. */
export function integrationsLine(rows) {
  if (!rows.length) return t('integrations.none_listed', 'No integrations yet: a bridge file or a Workspace adds one.');
  const keyed = rows.filter((row) => row.secrets.length);
  if (!keyed.length) return t('integrations.nothing_saved', '{n} integrations; no keys saved yet. An Agent asks for one with secret ask <name>-<key>.', { n: rows.length });
  return t('integrations.saved_n', '{n} of {all} have keys saved: {names}.', { n: keyed.length, all: rows.length, names: keyed.map((row) => row.label).join(', ') });
}

/** `campaign()` is the selected Campaign; `panels[name]()` builds an integration's own panel ({el, enter}). */
export function createIntegrationsPanel(campaign, { panels = {}, embedded = false } = {}) {
  const { createSurface, createAction, createActionBar, createField } = WorkspaceKit.primitives;
  const ADD_ID = '\u0000add';
  const refresh = createAction({ label: t('integrations.refresh', 'Refresh'), size: 'compact', action: () => void load() });
  const addServer = createAction({ label: t('integrations.add_server', 'Add MCP server'), size: 'compact', action: () => { stones?.openDetail({ id: ADD_ID, label: t('integrations.add_title', 'Add an MCP server') }); } });
  const surface = embedded ? null : createSurface({ label: t('integrations.title', 'Integrations'), className: 'setup-surface integrations-surface', actions: [addServer, refresh] });
  const host = embedded ? el('section', 'integrations-embedded') : surface.content;
  if (embedded) host.append(el('h3', 'integrations-heading', t('integrations.title', 'Integrations')));
  const line = el('p', 'setup-lede integrations-line');
  line.setAttribute('role', 'status');
  let rows = [];

  const id = () => campaign()?.id || '';
  const stateWord = (row) => (row.mcp ? mcpState(row.mcp) : row.secrets.length ? t('integrations.keys_n', '{n} saved', { n: row.secrets.length })
    : panels[row.name] ? t('integrations.own_panel', 'Own panel') : t('integrations.no_keys', 'No keys'));
  const keyed = (row) => (row.mcp ? row.mcp.saved || row.mcp.sign_in === 'none' : row.secrets.length > 0);
  const itemFor = (row) => ({ id: row.name, label: row.label, state: stateWord(row), attrs: { 'data-keyed': String(keyed(row)) } });

  const fact = (dl, label, value) => { const item = el('div', 'setup-answer'); item.append(el('dt', '', label), el('dd', '', value)); dl.append(item); };

  function facts(row) {
    const dl = el('dl', 'setup-answers integrations-facts');
    if (row.blurb) fact(dl, t('integrations.what', 'What it is'), row.blurb);
    if (row.mcp) {
      fact(dl, t('integrations.reach', 'Address'), row.mcp.reach || '—');
      fact(dl, t('integrations.sign_in', 'Sign-in'), SIGN_IN[row.mcp.sign_in]());
      fact(dl, t('integrations.secrets', 'Keys saved'), row.secrets.join(', ')
        || (row.mcp.secret ? t('integrations.mcp_not_saved', 'none: {secret} is not saved yet', { secret: row.mcp.secret }) : t('integrations.mcp_no_secret', 'none needed')));
      fact(dl, t('integrations.workspaces', 'Workspaces using it'), row.workspaces.join(', ') || t('integrations.no_workspaces', 'none yet: add it on a Workspace'));
      return dl;
    }
    fact(dl, t('integrations.bridge', 'Bridge'), row.bridge || t('integrations.no_bridge', 'none: Agents use its own CLI or API'));
    if (row.part) fact(dl, t('integrations.part', 'Services part'), `${row.name} · ${PART[row.part]()}`);
    fact(dl, t('integrations.secrets', 'Keys saved'), row.secrets.join(', ')
      || (panels[row.name] ? t('integrations.in_own_panel', 'set in its own panel, below')
        : t('integrations.no_secrets', 'none: an Agent asks with secret ask {name}-<key>', { name: row.name })));
    fact(dl, t('integrations.workspaces', 'Workspaces using it'), row.workspaces.join(', ') || t('integrations.no_workspaces', 'none yet: add it on a Workspace'));
    return dl;
  }

  // ---- MCP servers: the broker's routes, each press answered at once ----
  const by = () => t('integrations.by_owner', 'owner');
  const lineOf = () => { const p = el('p', 'integrations-said'); p.setAttribute('role', 'status'); return p; };

  /** The paste field for one secret: the value goes to its file and is cleared from the field at once. */
  function pasteField(secret, { saved = false, onSaved = () => {} } = {}) {
    const form = el('form', 'integrations-paste');
    form.autocomplete = 'off';
    const input = Object.assign(el('input', 'integrations-paste-value'), { type: 'password', autocomplete: 'off', spellcheck: false, placeholder: t('secret.paste', 'Paste it here') });
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('aria-label', t('integrations.paste_for', 'Key for {secret}', { secret }));
    const note = lineOf();
    const SAVE = t('secret.save', 'Save');
    const save = createAction({ label: SAVE, kind: 'primary', size: 'compact', action: () => form.requestSubmit() });
    form.append(el('p', 'integrations-paste-for', saved
      ? t('integrations.paste_replace', '{secret} is saved. Paste a new key here to replace it.', { secret })
      : t('integrations.paste_title', 'Paste the key for {secret}. It is saved as a file and never shown again.', { secret })),
      el('div', 'integrations-paste-entry'), note);
    form.querySelector('.integrations-paste-entry').append(input, save.el);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!input.value) { note.textContent = t('secret.empty_field', 'Paste the key first.'); input.focus(); return; }
      const value = input.value;
      input.value = '';
      save.setDisabled(true);
      save.el.textContent = t('secret.saving', 'Saving…');
      const result = await request(`/api/secrets/${encodeURIComponent(secret)}`, { method: 'POST', json: { value } });
      save.setDisabled(false);
      save.el.textContent = SAVE;
      note.textContent = result.ok ? t('secret.saved', 'Saved: {name}', { name: secret }) : result.message;
      if (result.ok) await onSaved();
    });
    return form;
  }

  /** The Campaigns it is available to, ticked; none ticked is every Campaign. Available is not on. */
  function campaignsEditor(row) {
    const box = el('fieldset', 'integrations-campaigns');
    box.append(el('legend', '', t('integrations.campaigns', 'Available to Campaigns')));
    const list = el('div', 'integrations-campaign-list');
    const note = lineOf();
    const all = campaigns().filter((one) => one.state !== 'archived');
    const ids = new Set([...all.map((one) => one.id), ...row.mcp.campaigns]);
    const ticks = [...ids].map((cid) => {
      const label = el('label', 'integrations-campaign');
      const tick = Object.assign(el('input'), { type: 'checkbox', value: cid, checked: row.mcp.campaigns.includes(cid) });
      label.append(tick, el('span', '', all.find((one) => one.id === cid)?.title || cid));
      list.append(label);
      return tick;
    });
    const save = createAction({
      label: t('integrations.campaigns_save', 'Save Campaigns'), size: 'compact',
      action: async () => {
        note.textContent = t('integrations.saving', 'Saving…');
        const picked = ticks.filter((one) => one.checked).map((one) => one.value);
        const result = await request('/api/mcp/campaigns', { method: 'POST', json: { name: row.name, campaigns: picked, by: by() } });
        note.textContent = said(result);
        if (result.ok) row.mcp.campaigns = picked;
      },
    });
    box.append(list, el('p', 'integrations-hint', t('integrations.campaigns_hint', 'None ticked: every Campaign. Turn it on in a layer’s Integrations.')), save.el, note);
    return box;
  }

  function mcpControls(row) {
    const wrap = el('div', 'integrations-mcp');
    const note = lineOf();
    const actions = [];
    if (row.mcp.sign_in === 'oauth') {
      actions.push(createAction({
        label: row.mcp.saved ? t('integrations.sign_in_again', 'Sign in again') : t('integrations.sign_in_button', 'Sign in'), kind: 'primary', size: 'compact',
        action: () => {
          window.open(`/api/mcp/oauth/start?name=${encodeURIComponent(row.name)}`, '_blank', 'noopener');
          note.textContent = t('integrations.signing_in', 'Sign in in the new tab, then Refresh here.');
        },
      }));
    }
    const remove = createAction({
      label: t('integrations.remove', 'Remove'), size: 'compact',
      action: async () => {
        note.textContent = t('integrations.removing', 'Removing…');
        remove.setDisabled(true);
        const result = await request('/api/mcp/remove', { method: 'POST', json: { name: row.name, by: by() } });
        note.textContent = said(result);
        if (result.ok) { stones?.select(''); await load(); } else remove.setDisabled(false);
      },
    });
    actions.push(remove);
    // One office has one Campaign, so there is nothing to choose between (owner, 25 Nov: no "Campaign" on screen).
    if (MULTIPLE_CAMPAIGNS_ENABLED) wrap.append(campaignsEditor(row));
    if (row.mcp.sign_in === 'key' && row.mcp.secret) wrap.append(pasteField(row.mcp.secret, { saved: row.mcp.saved, onSaved: () => load() }));
    wrap.append(createActionBar({ actions }).el, note);
    return wrap;
  }

  /** Add an MCP server: the broker connects, reads its description and writes the record. */
  function addForm() {
    const form = el('form', 'integrations-add');
    form.autocomplete = 'off';
    const name = createField({ label: t('integrations.add_name', 'Name'), description: t('integrations.add_name_help', 'Lowercase letters, digits and -.') });
    const reach = createField({ label: t('integrations.add_reach', 'Address'), description: t('integrations.add_reach_help', 'Its URL, or the command that starts a local server.') });
    const pick = el('select');
    for (const v of ['key', 'oauth', 'none']) pick.append(Object.assign(el('option', '', SIGN_IN[v]()), { value: v }));
    const signIn = createField({ label: t('integrations.add_sign_in', 'Sign-in'), control: pick });
    name.control.spellcheck = reach.control.spellcheck = false;
    name.control.setAttribute('autocapitalize', 'off');
    reach.control.setAttribute('autocapitalize', 'off');
    const note = lineOf();
    const paste = el('div', 'integrations-add-paste');
    const ADD = t('integrations.add', 'Add');
    const add = createAction({ label: ADD, kind: 'primary', size: 'compact', action: () => form.requestSubmit() });
    form.append(el('h3', 'integrations-heading', t('integrations.add_title', 'Add an MCP server')), name.el, reach.el, signIn.el, createActionBar({ actions: [add] }).el, note, paste);
    const send = async () => {
      add.setDisabled(true);
      add.el.textContent = t('integrations.adding', 'Adding…');
      note.textContent = t('integrations.adding_line', 'Connecting to the server…');
      const result = await request('/api/mcp/add', { method: 'POST', json: { name: name.control.value.trim(), reach: reach.control.value.trim(), sign_in: pick.value, by: by() } });
      add.setDisabled(false);
      add.el.textContent = ADD;
      note.textContent = said(result);
      paste.replaceChildren();
      if (result.ok) { const added = name.control.value.trim(); await load(); stones?.select(added); return; }
      // The key is not saved yet: paste it here, then add again.
      const secret = result.data?.secret;
      if (secret) paste.append(pasteField(secret, { onSaved: send }));
    };
    form.addEventListener('submit', (event) => { event.preventDefault(); void send(); });
    return form;
  }

  function renderDetail(item, detail) {
    if (item.id === ADD_ID) { detail.append(addForm()); return () => {}; }
    const row = rows.find((one) => one.name === item.id);
    if (!row) return () => {};
    detail.append(facts(row));
    if (row.mcp) { detail.append(mcpControls(row)); return () => {}; }
    const own = panels[row.name] ? panels[row.name]() : null;
    if (own) { detail.append(own.el); void (own.enter ?? own.show)?.(); }
    return () => own?.destroy?.();
  }

  // In Settings, stones and the detail beside them; inside Setup's Installations, one fold per
  // integration under Ronin Services (a phalanx seats only in a surface's own content).
  const stones = embedded ? null : createPhalanx({ items: [], className: 'integrations-stones', renderDetail });
  const folds = embedded ? el('div', 'integrations-folds') : null;
  const open = new Set();
  let cleanups = [];
  if (stones) stones.mount(host, { before: [line] });
  else host.append(line, folds);
  const paintFolds = () => {
    for (const done of cleanups) done();
    cleanups = [];
    folds.replaceChildren(...rows.map((row) => {
      const fold = el('details', 'integrations-fold');
      fold.dataset.keyed = String(keyed(row));
      fold.open = open.has(row.name);
      fold.append(el('summary', '', `${row.label} · ${stateWord(row)}`));
      const body = el('div', 'integrations-fold-body');
      fold.append(body);
      fold.addEventListener('toggle', () => { if (fold.open) open.add(row.name); else open.delete(row.name); });
      cleanups.push(renderDetail({ id: row.name }, body));
      return fold;
    }));
  };

  async function load() {
    refresh.setDisabled(true);
    const [result] = await Promise.all([request(`/api/integrations?campaign_id=${encodeURIComponent(id())}`, { cache: 'no-store' }), campaigns().length ? null : loadCampaigns()]);
    refresh.setDisabled(false);
    if (!result.ok) { line.textContent = t('integrations.read_failed', 'The integrations could not be read: {error}', { error: result.message }); return; }
    rows = Array.isArray(result.data.integrations) ? result.data.integrations : [];
    line.textContent = integrationsLine(rows);
    if (!stones) { paintFolds(); return; }
    stones.setItems(rows.map(itemFor));
    if (stones.selected()) stones.refreshDetail();
  }

  return { el: embedded ? host : surface.el, enter: () => load(), destroy: () => { stones?.destroy(); for (const done of cleanups) done(); } };
}
