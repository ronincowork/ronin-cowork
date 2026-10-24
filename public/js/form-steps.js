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
  const chev = el('span', 'fs-chev', '');
  const sum = el('span', 'fs-sum');
  sum.hidden = true;
  // A section inside a step is unnumbered (owner, 2026-10-20): no `n`, no number in the head; only
  // the outer steps number, and only a numbered head is renumbered.
  const num = el('span', 'fs-step-n', String(n ?? ''));
  head.append(...(n == null ? [] : [num]), el('h3', null, title), sum);
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
    sum.hidden = !on || meta == null;
    if (on) sum.textContent = meta == null ? '' : (meta || '—');
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
  };
  return words[value] || value;
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
 * The template tray: `Open` leads (the form's own box — a template that filled
 * nothing in would collapse nothing), the catalog rows follow in their stated order, and
 * the library door stands greyed so the shelf is not mistaken for the whole offer.
 */
/** ONE TEMPLATE BOX — the launch forms' and the Campaign page's, so the two look the same by construction. */
function templateBox(art, label, blurb, picked, act) {
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
  if (includeOwn) grid.append(box('○', t('campaign_view.option_open', 'Open'), t('forms.open_template_blurb', 'Use the open form with no template.'), current === '', () => onPick('')));
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
 * THE PROVIDER CATALOG AS EVERY PICKER READS IT — one read, no join here.
 *
 * `GET /api/provider-catalog` answers the catalog's own facts (origin, `updated`) and every
 * provider with its rows already JOINED on the server (`src/model-providers.ts`
 * `providerRows`, since 2026-09-25): Native first, then each model the CLI listed on the
 * last Refresh all, in the CLI's order, with two names — `model`, the id every launch uses,
 * and `name`, the CLI's own display name with the version in it — plus `operational`,
 * `off` and `selectable` for this machine. `GET /api/setup/runtime` answers the machine
 * facts the Model providers surface paints (installed, signed in, steps). Nothing here
 * probes; only Refresh all on that surface reads a model list. A surface calls
 * `loadProviderCatalog()` when it is shown and paints from `providerCatalog()`; a picker
 * built before the first read paints again when it lands.
 */
let catalog = { rows: [], providers: [], machine: [], measured_at: '', refreshed_at: '', origin: '', model_info: { origin: '', fetched_at: '' }, withdrawn: [], loaded: false };
let inflight = null;
const NATIVE_MODEL = 'native';

export function loadProviderCatalog() {
  if (inflight) return inflight;
  inflight = Promise.all([request('/api/provider-catalog'), request('/api/setup/runtime', { cache: 'no-store' })]).then(([read, runtime]) => {
    const providers = read.ok && Array.isArray(read.data?.providers) ? read.data.providers : [];
    const machine = runtime.ok && Array.isArray(runtime.data?.providers) ? runtime.data.providers : [];
    catalog = {
      rows: providers.flatMap((entry) => (Array.isArray(entry?.models) ? entry.models : [])), providers, machine,
      measured_at: read.ok ? String(read.data?.measured_at || '') : '',
      refreshed_at: read.ok ? String(read.data?.refreshed_at || '') : '',
      origin: read.ok ? String(read.data?.origin || '') : '',
      model_info: { origin: String(read.data?.model_info?.origin || ''), fetched_at: String(read.data?.model_info?.fetched_at || '') },
      withdrawn: read.ok && Array.isArray(read.data?.withdrawn) ? read.data.withdrawn : [],
      loaded: true,
    };
    inflight = null;
    return catalog;
  });
  return inflight;
}

/** What every reader paints from: `{ rows, providers, machine, measured_at, refreshed_at, origin, model_info, withdrawn, loaded }`. */
export const providerCatalog = () => catalog;

/** light · standard · frontier, in the person's words. */
export function tierWord(tier) {
  return { light: t('forms.tier_light', 'light'), standard: t('forms.tier_standard', 'standard'), frontier: t('forms.tier_frontier', 'frontier') }[tier] || String(tier || '');
}

/** An ISO moment as people read it, `20 Oct 2026, 17:35`; a bare day as `19 Feb 2026`; '' when unreadable. */
export function dayTime(iso) {
  const text = String(iso || '');
  const at = new Date(text);
  if (!text || Number.isNaN(at.getTime())) return '';
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${at.getUTCDate()} ${month[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
  const two = (n) => String(n).padStart(2, '0');
  return `${at.getDate()} ${month[at.getMonth()]} ${at.getFullYear()}, ${two(at.getHours())}:${two(at.getMinutes())}`;
}

/** A model's list price from its model info, `$4 in · $20 out per M tokens`; '' when it has none. */
export function priceText(info) {
  const cost = info?.cost ?? {};
  if (typeof cost.input !== 'number' || typeof cost.output !== 'number') return '';
  return t('forms.model_price', '${input} in · ${output} out per M tokens', { input: cost.input, output: cost.output });
}

/**
 * One model as an option reads: its name and its tier, and stops there. A picker is for
 * choosing, not for reading: the model's description belongs to the
 * Campaign's Model providers surface, where there is room for the whole table. In an
 * option it is a sentence squeezed into a line that cannot show it.
 */
export const modelLabel = (row) => {
  if (row?.model === NATIVE_MODEL) return t('forms.model_native', 'Native');
  const known = row?.name ? null : catalog.rows.find((item) => item.provider === row?.provider && item.model === row?.model);
  return String(row?.name || known?.name || row?.model || '');
};
export const modelWord = (row) => row?.model === NATIVE_MODEL || !row?.tier
  ? modelLabel(row)
  : t('forms.model_word', '{model} · {tier}', { model: modelLabel(row), tier: tierWord(row.tier) });

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
    for (const row of offered) {
      const unavailable = row.selectable !== true;
      const label = fixed && !row.operational
        ? (row.off ? t('forms.model_turned_off', '{model} — turned off', { model: modelWord(row) }) : t('forms.model_off', '{model} — not on this machine', { model: modelWord(row) }))
        : modelWord(row);
      modelSelect.add(option(label, row.model, !row.operational || unavailable));
    }
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
    const dt = el('dt');
    if (label instanceof Node) dt.append(label); else dt.textContent = String(label ?? '');
    dl.append(dt);
    const dd = el('dd');
    if (value instanceof Node) dd.append(value);
    else if (value) dd.textContent = String(value);
    else dd.append(el('em', null, t('forms.none', '—')));
    dl.append(dd);
  }
  return dl;
}
