/* part of the ronin-cowork client — see js/README.md */
/**
 * THE DRAWN FORM IDIOM — shared by New Team and New Agent, drawn nowhere else.
 *
 * The owner preferred the condensed density (ronin-lab `concepts/new-agent-condensed.html`):
 * label-left steps, one rectangle for every clickable thing, collapse-on-pick. This module
 * is that idiom as functions — a step box that can fold to its one-line answer, the kind
 * tiles with `open` dotted and set apart, the template tray with `Make your own` first and
 * the library door greyed, the provider/model pair where either pick may stand alone, and
 * the tag row readings. Feature meaning stays in the forms; these are only the shapes.
 *
 * The provider/model pair is THE ONE PICKER: New Agent, New Team, Add Agent to Team,
 * Campaign Agent defaults, Team Configuration, ⚙ Configuration, cowork setup and the
 * Presets rows all call `providerModelPair`, and it alone reads the provider catalog.
 */
import { t } from './lexicon.js';
import { request } from './request.js';

export const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = String(text);
  return node;
};

/**
 * A label-left step. Folding hides the body and shows the one-line `meta` answer in its
 * place — the body's controls are never rebuilt, so a fold costs no typed state. The
 * number is settable: steps renumber as a door or a session type adds and removes them.
 */
export function createStep({ n, key, title, onToggle = null }) {
  const box = el('section', 'fs-step');
  box.dataset.step = key;
  const head = el(onToggle ? 'button' : 'div', 'fs-step-head');
  if (onToggle) head.type = 'button';
  const num = el('span', 'fs-step-n', String(n));
  const chev = el('span', 'fs-chev', '');
  const sum = el('span', 'fs-sum');
  sum.hidden = true;
  head.append(num, el('h3', null, title), sum);
  const body = el('div', 'fs-step-body');
  box.append(head, body);
  if (onToggle) {
    head.append(chev);
    head.addEventListener('click', () => onToggle());
  }
  const setCollapsed = (on, meta = '', togglable = !!onToggle) => {
    box.dataset.collapsed = String(!!on);
    head.classList.toggle('fs-togglable', togglable);
    chev.textContent = togglable
      ? (on ? t('forms.expand', 'Expand') : t('forms.collapse', 'Collapse'))
      : '';
    if (onToggle) head.setAttribute('aria-expanded', String(!on));
    body.hidden = !!on;
    sum.hidden = !on;
    if (on) sum.textContent = meta || '—';
  };
  setCollapsed(false, '', !!onToggle && false);
  return {
    el: box,
    body,
    setNumber: (value) => { num.textContent = String(value); },
    setCollapsed,
  };
}

/** The mandate words a person reads for the ruled tokens — the same keys the Team
 *  Configuration card reads, so the two surfaces can never disagree. */
export function mandateWord(value) {
  const words = {
    open: t('campaign_view.option_open', 'Open'),
    discuss: t('campaign_view.option_discuss', 'Discuss'),
    plan: t('campaign_view.option_plan', 'Plan'),
    execute: t('campaign_view.option_execute', 'Execute'),
    nobody: t('campaign_view.option_nobody', 'Nobody'),
    'propose agents': t('campaign_view.option_propose', 'Propose Agents'),
    'staff agents': t('campaign_view.option_staff', 'Staff Agents'),
    'a plan': t('campaign_view.option_a_plan', 'A plan'),
    ideas: t('campaign_view.option_ideas', 'Ideas'),
    code: t('campaign_view.option_code', 'Code'),
    'an artifact': t('campaign_view.option_artifact', 'An artifact'),
    'no code': t('campaign_view.option_no_code', 'No code'),
    'the team': t('campaign_view.option_team', 'The Team'),
    user: t('campaign_view.option_user', 'You only'),
    read: t('campaign_view.option_read', 'Read'),
    write: t('campaign_view.option_write', 'Read and write'),
  };
  return words[value] || value;
}

/** One mandate dial as a select over its ruled values, worded by `mandateWord`. */
export function mandateSelect(values, current, onPick) {
  const select = el('select');
  for (const value of values) select.add(new Option(mandateWord(value), value));
  select.value = current;
  select.addEventListener('change', () => onPick(select.value));
  return select;
}

/** One mandate dial as a row of rectangles — the New Agent drawing's shape: the dial's
 *  name left, one box per ruled value, `open` first on every dial. */
export function dialRow(title, values, current, onPick) {
  const dial = el('div', 'fs-dial');
  dial.append(el('h4', null, title));
  const row = el('div', 'fs-dial-row');
  for (const value of values) {
    const box = el('button', 'fs-dial-opt');
    box.type = 'button';
    box.setAttribute('aria-pressed', String(value === current));
    box.append(el('b', null, mandateWord(value)));
    box.addEventListener('click', () => onPick(value));
    row.append(box);
  }
  dial.append(row);
  return dial;
}

export function dialRowMulti(title, values, chosen, onToggle) {
  const dial = el('div', 'fs-dial');
  dial.append(el('h4', null, title));
  const row = el('div', 'fs-dial-row');
  for (const value of values) {
    const on = chosen.includes(value);
    const box = el('button', 'fs-dial-opt');
    box.type = 'button';
    box.setAttribute('aria-pressed', String(on));
    box.append(el('b', null, mandateWord(value)));
    box.addEventListener('click', () => onToggle(value, !on));
    row.append(box);
  }
  dial.append(row);
  return dial;
}

/**
 * A row of pick-one tiles, each with its name and what it means. The Team step on New
 * Agent drew these first; Launch mode uses the same shape because it is the same kind of
 * question — a small closed set where the consequence of each answer needs saying.
 */
export function bookShelves(shelves, chosen, onToggle) {
  const host = el('div');
  for (const shelf of shelves) {
    host.append(el('p', 'fs-head', shelf.head));
    const grid = el('div', 'na-sopgrid');
    for (const row of shelf.rows) {
      const address = `${shelf.prefix}:${row.name}`;
      const on = chosen.includes(address);
      const box = el('button', 'na-sop');
      box.type = 'button';
      box.title = row.blurb || row.label || row.name;
      box.setAttribute('aria-pressed', String(on));
      box.append(el('span', 'aa-box'), el('b', null, row.name));
      box.addEventListener('click', () => onToggle(address, !on));
      grid.append(box);
    }
    host.append(grid);
  }
  return host;
}

/**
 * A BAND — a full-width divider that says what everything under it is, and folds it away.
 *
 * The owner asked for the first one over the Team's agent defaults, then for the same
 * treatment over the launch payload: "it's just sort of stuck down there like a turd. It
 * should be a proper section… and marked with an orange banner to hide or expand." Both
 * mark the same kind of seam — the subject changes below this line — so both are this.
 */
export function createBand(label, onToggle) {
  const band = el('button', 'ntf-band');
  band.type = 'button';
  const chev = el('span', 'ntf-band-chev', '▾');
  band.append(chev, el('span', null, label));
  band.addEventListener('click', () => onToggle());
  return {
    el: band,
    setOpen: (on) => {
      chev.textContent = on ? '▾' : '▸';
      band.setAttribute('aria-expanded', String(on));
    },
  };
}

export function wayTiles(rows, current, onPick) {
  const wrap = el('div', 'fs-pair');
  for (const row of rows) {
    const box = el('button', 'fs-way');
    box.type = 'button';
    box.setAttribute('aria-pressed', String(row.key === current));
    box.append(el('b', null, row.label), el('small', null, row.sub));
    box.addEventListener('click', () => onPick(row.key));
    wrap.append(box);
  }
  return wrap;
}

export function kindTiles(current, onPick) {
  const KINDS = [
    { key: 'coding', icon: '⌨' }, { key: 'work', icon: '💼' }, { key: 'personal', icon: '🎩' },
    { key: 'household', icon: '🏠' }, { key: 'social', icon: '🎪' }, { key: 'school', icon: '🎓' },
  ];
  const wrap = el('div', 'fs-kinds');
  wrap.append(el('span', 'fs-gridlabel', t('kind', 'Kind')));
  const grid = el('div', 'fs-kindgrid');
  const tile = (key, icon, open) => {
    const box = el('button', 'fs-kindtile');
    box.type = 'button';
    if (open) box.dataset.open = 'true';
    box.setAttribute('aria-pressed', String(key === current));
    box.append(el('i', null, icon), el('span', null, t(`kind.${key}`, key)));
    box.addEventListener('click', () => onPick(key));
    return box;
  };
  for (const kind of KINDS) grid.append(tile(kind.key, kind.icon, false));
  wrap.append(grid, tile('open', '○', true));
  return wrap;
}

/**
 * The template tray: `Make your own` leads (the form's own box — a template that filled
 * nothing in would collapse nothing), the catalog rows follow in their stated order, and
 * the library door stands greyed so the shelf is not mistaken for the whole offer.
 */
/** ONE TEMPLATE BOX — the launch forms' and the Campaign page's, so the two look the same by construction. */
export function templateBox(art, label, blurb, picked, act) {
  const cell = el('button', 'fs-tmpl');
  cell.type = 'button';
  cell.title = blurb;
  cell.setAttribute('aria-pressed', String(picked));
  const words = el('div');
  words.append(el('b', null, label));
  cell.append(el('i', null, art), words);
  if (act) cell.addEventListener('click', act);
  return cell;
}

export function templateTray(rows, current, onPick, { includeOwn = true } = {}) {
  const grid = el('div', 'fs-tmplgrid');
  const box = templateBox;
  if (includeOwn) grid.append(box('＋', t('forms.own', 'Make your own'), t('forms.own_blurb', 'Fresh and empty. Fill it in yourself.'), current === '', () => onPick('')));
  for (const row of rows) {
    grid.append(box(row.art, row.label, row.blurb, current === row.name, () => onPick(row.name)));
  }
  // in words, and offers no door of its own: the download happens on the Campaign page.
  const wrap = el('div');
  wrap.append(grid, el('p', 'fs-tmplnote', t('forms.library_note', 'More on the Ronin library — Campaign → Templates → Check the library to see them and download the ones you want.')));
  return wrap;
}

/* ---------- the provider catalog, and the one picker that reads it ---------- */

/**
 * THE CATALOG, READ ONCE PER SURFACE. Two reads, joined on the catalog's own `cli`
 * field: the provider catalog (GET /api/provider-catalog — its origin, stock or the
 * owner's copy, the date it was updated, and one entry per provider carrying the vendor
 * id, its CLI, its label and its model rows: model, tier, cost, good_at, not_good_at,
 * default, cmd, in catalog order) and what this machine measured of each CLI
 * (GET /api/setup/runtime `providers`, the Campaign's recorded provider summary:
 * installed, signed in, activated, dated). The catalog is a snapshot, not live data:
 * its `updated` date is shown wherever its facts are. Nothing here probes; the runtime
 * answers from the record, and only the Setup Model providers surface measures.
 * A surface calls `loadProviderCatalog()` when it is shown and paints from
 * `providerCatalog()`; a picker built before the first read paints again when it lands.
 */
let catalog = { rows: [], machine: [], measured_at: '', origin: '', updated: '', stock_updated: '', withdrawn: [], loaded: false };
let inflight = null;

export function loadProviderCatalog() {
  if (inflight) return inflight;
  inflight = Promise.all([request('/api/provider-catalog'), request('/api/setup/runtime', { cache: 'no-store' })]).then(([read, runtime]) => {
    const providers = read.ok && Array.isArray(read.data?.providers) ? read.data.providers : [];
    const machine = runtime.ok && Array.isArray(runtime.data?.providers) ? runtime.data.providers : [];
    catalog = {
      rows: orderedCatalog(catalogRows(providers), machine), machine,
      measured_at: runtime.ok ? String(runtime.data?.measured_at || '') : '',
      origin: read.ok ? String(read.data?.origin || '') : '', updated: read.ok ? String(read.data?.updated || '') : '',
      stock_updated: read.ok ? String(read.data?.stock_updated || '') : '',
      withdrawn: read.ok && Array.isArray(read.data?.withdrawn) ? read.data.withdrawn : [],
      loaded: true,
    };
    inflight = null;
    return catalog;
  });
  return inflight;
}

/** What every reader paints from: `{ rows, machine, measured_at, origin, updated, stock_updated, withdrawn, loaded }`. */
export const providerCatalog = () => catalog;

/**
 * The catalog's provider entries as flat model rows, each carrying its provider's id, CLI,
 * label, and which layer its section came from (`origin`: stock or user; `shadowed` when the
 * owner's section replaced a shipped one) — so a surface can say it. Pure.
 */
export function catalogRows(providers = []) {
  return (Array.isArray(providers) ? providers : []).flatMap((entry) => (Array.isArray(entry?.models) ? entry.models : [])
    .map((row) => ({ ...row, provider: entry.provider, cli: entry.cli, provider_label: entry.label || entry.provider, origin: entry.origin || 'stock', shadowed: entry.shadowed === true })));
}

/**
 * THE ROWS AS THE PICKER OFFERS THEM. Each catalog row gains what the machine measured
 * of its CLI — `operational` (the summary's activated: installed, signed in or recorded,
 * with a cell to launch) and the CLI's label — and providers this machine can launch
 * come first, so a first run reads the runnable ones before the greyed ones. Within a
 * group the catalog's own order holds. The vendor's label is the catalog's own. Pure:
 * the tests feed it rows.
 */
export function orderedCatalog(rows = [], machine = []) {
  const marked = (Array.isArray(rows) ? rows : []).filter((row) => row?.provider && row?.model).map((row) => {
    const entry = (Array.isArray(machine) ? machine : []).find((item) => item?.id === row.cli) || null;
    // `off`: the owner turned the provider off — greyed with that word, never the false
    // "not on this machine" (the house rule: disabled, never hidden; and never a lie).
    return { ...row, operational: entry?.activated === true, off: entry?.off === true && entry?.installed === true, provider_label: row.provider_label || row.provider, cli_label: entry?.label || row.cli || '' };
  });
  const providers = [...new Set(marked.map((row) => row.provider))];
  const on = providers.filter((provider) => marked.some((row) => row.provider === provider && row.operational));
  return [...on, ...providers.filter((provider) => !on.includes(provider))].flatMap((provider) => marked.filter((row) => row.provider === provider));
}

/** light · standard · frontier, in the person's words. */
export function tierWord(tier) {
  return { light: t('forms.tier_light', 'light'), standard: t('forms.tier_standard', 'standard'), frontier: t('forms.tier_frontier', 'frontier') }[tier] || String(tier || '');
}

/**
 * One model as an option reads: its id and its tier, and stops there. A picker is for
 * choosing, not for reading: the long good-at / not-good-at description belongs to the
 * Campaign's Model providers surface, where there is room for the whole table. In an
 * option it is a sentence squeezed into a line that cannot show it.
 */
export const modelWord = (row) => t('forms.model_word', '{model} · {tier}', { model: row.model, tier: tierWord(row.tier) });

/**
 * THE ONE PROVIDER → MODEL PICKER. Two selects, and either pick may stand alone: naming
 * the provider and no model gets that provider's catalog default, server-side; both
 * blank is the level above's answer. Every provider and every model in the catalog is
 * offered, operational providers first; what this machine cannot launch is disabled,
 * never hidden, so the list teaches what Ronin offers. The model select waits for a
 * provider to name its rows.
 *
 * `fixed` names the provider and drops its select: the row is the provider and the pick
 * is the model alone (⚙ Configuration's per-provider preference, Mika's row).
 * `field(label, control)` is the caller's own furniture; `classes` ride the selects;
 * `blank` names the two blank options; `labels` the two field labels.
 */
export function providerModelPair(read, write, field, { fixed = '', classes = '', blank = {}, labels = {} } = {}) {
  const providerSelect = el('select', classes);
  const modelSelect = el('select', classes);
  const option = (label, value, disabled = false) => { const out = el('option', null, label); out.value = value; if (disabled) out.disabled = true; return out; };
  const empty = { provider: blank.provider ?? t('forms.default', 'default'), model: blank.model ?? t('forms.default', 'default') };
  const paint = () => {
    const rows = providerCatalog().rows;
    const current = read() || {};
    if (!fixed) {
      const seen = rows.filter((row, index) => rows.findIndex((other) => other.provider === row.provider) === index);
      providerSelect.replaceChildren(option(empty.provider, ''));
      for (const row of seen) providerSelect.add(option(row.operational ? row.provider_label : row.off ? t('forms.provider_turned_off', '{name} — turned off', { name: row.provider_label }) : t('forms.provider_off', '{name} — not on this machine', { name: row.provider_label }), row.provider, !row.operational));
      providerSelect.value = seen.some((row) => row.provider === current.provider) ? String(current.provider) : '';
    }
    const chosen = fixed || providerSelect.value;
    const offered = rows.filter((row) => row.provider === chosen);
    modelSelect.replaceChildren(option(empty.model, ''));
    for (const row of offered) modelSelect.add(option(fixed && !row.operational ? (row.off ? t('forms.model_turned_off', '{model} · {tier} — turned off', { model: row.model, tier: tierWord(row.tier) }) : t('forms.model_off', '{model} · {tier} — not on this machine', { model: row.model, tier: tierWord(row.tier) })) : modelWord(row), row.model, !row.operational));
    modelSelect.value = offered.some((row) => row.model === current.model) ? String(current.model) : '';
    modelSelect.disabled = !chosen;
  };
  providerSelect.addEventListener('change', () => { write(providerSelect.value, ''); paint(); });
  modelSelect.addEventListener('change', () => { write(fixed || providerSelect.value, modelSelect.value); });
  const wrap = el('div', 'fs-pair');
  if (!fixed) wrap.append(field(labels.provider ?? t('forms.provider', 'model provider'), providerSelect));
  wrap.append(field(labels.model ?? t('forms.model', 'model'), modelSelect));
  paint();
  if (!providerCatalog().loaded) void loadProviderCatalog().then(paint);
  return { el: wrap, paint, providerSelect, modelSelect };
}

/** A row of small tags — the kit summary and the born reading speak in these. */
export function tagRow(items, emptyWord = '') {
  const wrap = el('div', 'fs-tags');
  if (!items.length && emptyWord) wrap.append(el('em', 'fs-tags-empty', emptyWord));
  for (const item of items) {
    const tag = el('span', 'fs-tag', typeof item === 'string' ? item : item.text);
    if (typeof item === 'object' && item.on) tag.dataset.on = 'true';
    wrap.append(tag);
  }
  return wrap;
}

/** One reading row — `dt` label, `dd` value (a node, a string, or the em-dash absence). */
export function readingRows(rows) {
  const dl = el('dl', 'fs-reading');
  for (const [label, value] of rows) {
    dl.append(el('dt', null, label));
    const dd = el('dd');
    if (value instanceof Node) dd.append(value);
    else if (value) dd.textContent = String(value);
    else dd.append(el('em', null, t('forms.none', '—')));
    dl.append(dd);
  }
  return dl;
}
