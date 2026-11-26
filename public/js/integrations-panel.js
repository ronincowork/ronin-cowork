/* part of the ronin-cowork client — see js/README.md */
/**
 * SETTINGS › INTEGRATIONS (owner, 2026-11-26, KAN-857; docs/architecture/integrations.md). Every outside
 * service is one record in this machine's Settings, set up and keyed here; a Workspace only uses it.
 *
 * Section 1, Integrations: the table pattern (data-table.js), a row per record: what it is reached by
 * (bridge, MCP, web API; Jira hidden behind `item`) and whether its key is saved, with Configure and
 * Remove; `+ Add an integration` below. Section 2 is the one open: Add (the kinds: each starting record
 * Ronin ships, Jira, an MCP server, a web API) or Configure (its facts, its key, Jira's own panel).
 *
 * Read: GET /api/integrations, GET /api/mcp/stock. Writes, through the broker (the Services part `mcp`):
 * POST /api/mcp/stock (a starting record), /api/mcp/add, /api/apis/add, /api/mcp/remove; a key through
 * POST /api/secrets/<secret>; Jira's disconnect DELETE /api/jira/<campaign>. Adding turns it on in
 * Settings; Remove deletes the record and its key.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { el, createStep } from './form-steps.js';
import { createTable } from './data-table.js';
import { campaigns, loadCampaigns } from './campaigns.js';

const BY = 'owner';
const SIGN_IN = {
  key: () => t('integrations.sign_in_key', 'a pasted key'),
  oauth: () => t('integrations.sign_in_oauth', 'OAuth, in the browser'),
  none: () => t('integrations.sign_in_none', 'none'),
};

/** What a record is reached by, in words. */
function waysOf(row) {
  if (row.name === 'jira') return t('integrations.way_hidden', 'Ronin’s work items');
  const ways = [];
  if (row.bridge) ways.push(t('integrations.way_bridge', 'Bridge'));
  if (row.reach) ways.push(t('integrations.way_mcp', 'MCP'));
  if (row.base) ways.push(t('integrations.way_api', 'Web API'));
  return ways.join(' · ') || '—';
}

/** Its key, in words: never the value. */
function keyWord(row) {
  if (row.sign_in === 'none') return t('integrations.key_none', 'None needed');
  if (row.saved) return row.sign_in === 'oauth' ? t('integrations.key_signed_in', 'Signed in') : t('integrations.key_saved', 'Saved');
  return row.sign_in === 'oauth' ? t('integrations.key_sign_in', 'Sign in needed') : t('integrations.key_missing', 'Not saved');
}

/** How many are set up, in one line. */
export function integrationsLine(rows) {
  if (!rows.length) return t('integrations.none_yet', 'No integrations yet. Add one, or ask an Agent to set one up.');
  const missing = rows.filter((row) => !row.saved);
  if (!missing.length) return t('integrations.all_set', '{n} integrations set up.', { n: rows.length });
  return t('integrations.some_missing', '{n} integrations; {m} still need a key: {names}.', { n: rows.length, m: missing.length, names: missing.map((row) => row.label).join(', ') });
}

/* ---- small parts ---- */
function button(label, action, kind = '') {
  const made = WorkspaceKit.primitives.createAction({ label, kind, action });
  return made.el ?? made;
}
function bar(...actions) {
  return WorkspaceKit.primitives.createActionBar({ actions: actions.filter(Boolean) }).el;
}
function input(value = '', type = 'text') {
  const node = el('input'); node.type = type; node.value = value; node.spellcheck = false;
  node.setAttribute('autocapitalize', 'off');
  return node;
}
function select(rows, value) {
  const node = el('select');
  for (const [id, name] of rows) { const o = el('option', null, name); o.value = id; node.append(o); }
  node.value = value;
  return node;
}
function field(name, control) {
  control.setAttribute('aria-label', name);
  const node = el('label', 'hermes-field', name); node.append(control);
  return node;
}
function stone(name, pressed, fn) {
  const out = el('button', 'ask-opt ask-rect');
  out.type = 'button';
  out.append(el('span', 'ask-name', name));
  out.setAttribute('aria-selected', String(pressed));
  out.addEventListener('click', fn);
  return out;
}
function stoneRow(items) {
  const row = el('div', 'ask setup-harness-row setup-harness-ways setup-hermes-sources'); row.dataset.density = 'tight';
  row.append(...items);
  return row;
}
/** A record's facts, one line each in the body's one size. */
function facts(pairs) {
  const box = el('div', 'integrations-facts');
  for (const [label, value] of pairs) {
    if (value) box.append(el('p', 'setup-fine', `${label}: ${value}`));
  }
  return box;
}
/** The form pattern (createStep): numbered sections, each folding to a one-line meta. */
function sections(defs, open) {
  const box = el('div', 'fs-steps model-services-steps');
  defs.forEach((d, i) => {
    if (!(d.key in open)) open[d.key] = true;
    const step = createStep({ n: i + 1, key: d.key, title: d.title, onToggle: () => { open[d.key] = !open[d.key]; step.setCollapsed(!open[d.key], d.meta || ''); } });
    step.body.append(...d.nodes);
    step.setCollapsed(!open[d.key], d.meta || '');
    box.append(step.el);
  });
  return box;
}

/** `campaign()` is this machine's Campaign; `panels.jira()` builds Jira's own panel ({el, enter}). */
export function createIntegrationsPanel(campaign, { panels = {}, embedded = false } = {}) {
  const surface = embedded ? null : WorkspaceKit.primitives.createSurface({ label: t('integrations.title', 'Integrations'), className: 'setup-surface model-services integrations-surface' });
  const host = embedded ? el('section', 'model-services integrations-embedded') : surface.content;
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text || ''; notice.hidden = !text; };
  const body = el('div', 'model-services-body');
  host.append(body);

  let rows = [];
  let stock = [];
  let open = ''; // '' | 'add' | a record's name
  let kind = ''; // the kind picked under Add: a starting record's name, 'jira', 'mcp' or 'api'
  let own = null; // Jira's panel, while shown
  const folds = {};
  const id = () => campaign()?.id || campaigns()[0]?.id || '';
  const said = (result) => (result.ok ? (result.data?.lines ?? []).join(' ') : result.message);

  /** The paste field for a record's key: sent, then cleared at once; never shown again. */
  function keyForm(row) {
    const form = el('form', 'model-services-form');
    form.autocomplete = 'off';
    const value = input('', 'password'); value.autocomplete = 'new-password';
    const save = button(row.saved ? t('integrations.replace_key', 'Replace key') : t('integrations.save_key', 'Save key'), () => {}, 'primary'); save.type = 'submit';
    form.append(field(t('integrations.key_for', '{label} key', { label: row.label }), value), bar(save));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!value.value) { say(t('secret.empty_field', 'Paste the key first.'), true); return; }
      const sent = value.value; value.value = ''; save.disabled = true;
      const result = await request(`/api/secrets/${encodeURIComponent(row.secret)}`, { method: 'POST', json: { value: sent } });
      save.disabled = false;
      say(result.ok ? t('integrations.key_saved_line', '{label}: key saved.', { label: row.label }) : result.message, !result.ok);
      if (result.ok) await load();
    });
    return form;
  }

  async function remove(row) {
    const result = row.name === 'jira'
      ? await request(`/api/jira/${encodeURIComponent(id())}`, { method: 'DELETE' })
      : await request('/api/mcp/remove', { method: 'POST', json: { name: row.name, by: BY } });
    say(result.ok ? t('integrations.removed', '{label} removed, with its key.', { label: row.label }) : said(result), !result.ok);
    if (result.ok) { if (open === row.name) open = ''; await load(); }
  }

  function jiraPanel() {
    own?.destroy?.();
    own = panels.jira ? panels.jira() : null;
    if (!own) return el('p', 'setup-fine', t('integrations.jira_here', 'Jira is set up from its own card.'));
    void (own.enter ?? own.show)?.();
    return own.el;
  }

  /* ---- section 2: Configure one ---- */
  function configure(row) {
    const nodes = [facts([
      [t('integrations.what', 'What it is'), row.blurb],
      [t('integrations.reached', 'Reached by'), waysOf(row)],
      [t('integrations.reach', 'Address'), row.reach],
      [t('integrations.base', 'Base URL'), row.base],
      [t('integrations.sign_in', 'Sign-in'), row.name === 'jira' ? '' : SIGN_IN[row.sign_in]()],
      [t('integrations.workspaces', 'Workspaces using it'), row.workspaces.join(', ')],
    ])];
    if (row.name === 'jira') nodes.push(jiraPanel());
    else if (row.sign_in === 'key' && row.secret) nodes.push(keyForm(row));
    else if (row.sign_in === 'oauth') {
      nodes.push(bar(button(row.saved ? t('integrations.sign_in_again', 'Sign in again') : t('integrations.sign_in_button', 'Sign in'), () => {
        window.open(`/api/mcp/oauth/start?name=${encodeURIComponent(row.name)}`, '_blank', 'noopener');
        say(t('integrations.signing_in', 'Sign in in the new tab; this list reads it again when you come back.'));
        window.addEventListener('focus', () => void load(), { once: true });
      }, 'primary')));
    }
    return { key: `configure-${row.name}`, title: t('integrations.configure_title', 'Configure {label}', { label: row.label }), meta: keyWord(row), nodes };
  }

  /* ---- section 2: Add one ---- */
  function addForm(api) {
    const form = el('form', 'model-services-form');
    form.autocomplete = 'off';
    const name = input();
    const where = input('', 'url');
    const signIn = select(['key', 'oauth', 'none'].map((v) => [v, SIGN_IN[v]()]), 'key');
    const go = button(t('integrations.add', 'Add'), () => {}, 'primary'); go.type = 'submit';
    form.append(field(t('integrations.add_name', 'Name (lowercase letters, digits and -)'), name),
      field(api ? t('integrations.add_base', 'Base URL') : t('integrations.add_reach', 'Address: its URL, or the command that starts it'), where),
      field(t('integrations.add_sign_in', 'Sign-in'), signIn), bar(go));
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); go.disabled = true;
      if (!api) say(t('integrations.adding_line', 'Connecting to the server…'));
      const json = { name: name.value.trim(), [api ? 'base' : 'reach']: where.value.trim(), sign_in: signIn.value, by: BY };
      const result = await request(api ? '/api/apis/add' : '/api/mcp/add', { method: 'POST', json });
      go.disabled = false;
      say(said(result), !result.ok);
      if (result.ok) { open = json.name; kind = ''; await load(); }
    });
    return form;
  }

  function add() {
    const unused = stock.filter((s) => !rows.some((r) => r.name === s.name));
    const jiraFree = panels.jira && !rows.some((r) => r.name === 'jira');
    const kinds = [
      ...unused.map((s) => [s.name, s.label]),
      ...(jiraFree ? [['jira', 'Jira']] : []),
      ['mcp', t('integrations.kind_mcp', 'MCP server')],
      ['api', t('integrations.kind_api', 'Web API')],
    ];
    const nodes = [stoneRow(kinds.map(([k, label]) => stone(label, kind === k, () => { kind = k; paint(); })))];
    const picked = unused.find((s) => s.name === kind);
    if (picked) {
      nodes.push(el('p', 'setup-fine', picked.description), bar(button(t('integrations.add_named', 'Add {label}', { label: picked.label }), async () => {
        const result = await request('/api/mcp/stock', { method: 'POST', json: { name: picked.name, by: BY } });
        say(said(result), !result.ok);
        if (result.ok) { open = picked.name; kind = ''; await load(); }
      }, 'primary')));
    } else if (kind === 'jira') nodes.push(jiraPanel());
    else if (kind === 'mcp') nodes.push(addForm(false));
    else if (kind === 'api') nodes.push(addForm(true));
    else nodes.push(el('p', 'setup-fine', t('integrations.pick_kind', 'Pick what to add. Its key is asked for next.')));
    return { key: 'add', title: t('integrations.add_title', 'Add an integration'), meta: '', nodes };
  }

  /* ---- section 1: the list ---- */
  function list() {
    const table = createTable({
      headings: [t('integrations.col_name', 'Integration'), t('integrations.col_ways', 'Reached by'), t('integrations.col_key', 'Key')],
      rows: rows.map((row) => ({
        cells: [row.label, waysOf(row), keyWord(row)],
        tools: [[t('integrations.configure', 'Configure'), () => { open = row.name; paint(); }], [t('integrations.remove', 'Remove'), () => void remove(row)]],
      })),
      lines: [[t('integrations.add_line', '+ Add an integration'), () => { open = 'add'; kind = ''; paint(); }]],
    });
    return { key: 'list', title: t('integrations.title', 'Integrations'), meta: integrationsLine(rows), nodes: [table] };
  }

  function paint() {
    own?.destroy?.(); own = null;
    const row = rows.find((one) => one.name === open);
    const defs = [list(), ...(open === 'add' ? [add()] : row ? [configure(row)] : [])];
    body.replaceChildren(
      el('p', 'setup-fine', t('integrations.lede', 'Every outside service is set up here once, with its key. A Workspace chooses which its Agents are told of.')),
      notice, sections(defs, folds));
  }

  async function load() {
    const [result, shipped] = await Promise.all([
      request(`/api/integrations?campaign_id=${encodeURIComponent(id())}`, { cache: 'no-store' }),
      request('/api/mcp/stock', { cache: 'no-store' }),
      campaigns().length ? null : loadCampaigns(),
    ]);
    if (!result.ok) { say(t('integrations.read_failed', 'The integrations could not be read: {error}', { error: result.message }), true); return; }
    rows = Array.isArray(result.data.integrations) ? result.data.integrations : [];
    stock = shipped.ok && Array.isArray(shipped.data.stock) ? shipped.data.stock : [];
    paint();
  }

  return { el: embedded ? host : surface.el, enter: () => load(), destroy: () => { own?.destroy?.(); } };
}
