/* part of the ronin-cowork client — see js/README.md */
/**
 * THE DRAWN FORM IDIOM — shared by New Team and New Agent, drawn nowhere else.
 *
 * The owner preferred the condensed density (ronin-lab `concepts/new-agent-condensed.html`):
 * label-left steps, one rectangle for every clickable thing, collapse-on-pick. This module
 * is that idiom as functions — a step box that can fold to its one-line answer, the kind
 * tiles with `open` dotted and set apart, the provider/model pair where either pick may
 * stand alone, and the tag row readings. Feature meaning stays in the forms; these are only
 * the shapes.
 *
 * The provider/model pair is THE ONE PICKER: New Agent, New Team, Add Agent to Team,
 * Campaign Agent defaults, Team Configuration, ⚙ Configuration and cowork setup all call
 * `providerModelPair`, and it alone reads the provider catalog.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { mandateTitle } from './mandates.js';

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

/** The mandate word a person reads for a stored value: its file's title (mandates.js). */
export const mandateWord = (value) => mandateTitle(value);

/* ---------- the provider catalog, and the one picker that reads it ---------- */

/**
 * THE PROVIDER CATALOG AS EVERY PICKER READS IT — one read, no join here.
 *
 * `GET /api/provider-catalog` answers the dates and every provider with its rows already
 * JOINED on the server (`src/model-providers.ts` `providerRows`): Native first, then each
 * model the CLI listed on the last Refresh all, grouped by HQ's tier (Unrated last), with two
 * names — `model`, the id every launch uses, and `name`, the CLI's own display name with the
 * version in it — its `use_for` line and facts, plus `operational`,
 * `off` and `selectable` for this machine. `GET /api/setup/runtime` answers the machine
 * facts the Model providers surface paints (installed, signed in, steps). Nothing here
 * probes; only Refresh all on that surface reads a model list. A surface calls
 * `loadProviderCatalog()` when it is shown and paints from `providerCatalog()`; a picker
 * built before the first read paints again when it lands.
 */
let catalog = { rows: [], providers: [], machine: [], measured_at: '', refreshed_at: '', loaded: false };
let inflight = null;
const NATIVE_MODEL = 'native';

export function loadProviderCatalog() {
  if (inflight) return inflight;
  inflight = Promise.all([request('/api/provider-catalog'), request('/api/setup/runtime', { cache: 'no-store' })]).then(([read, runtime]) => {
    const providers = read.ok && Array.isArray(read.data?.providers) ? read.data.providers : [];
    const machine = runtime.ok && Array.isArray(runtime.data?.providers) ? runtime.data.providers : [];
    catalog = {
      preferences: read.data?.preferences || {},
      rows: providers.flatMap((entry) => (Array.isArray(entry?.models) ? entry.models : [])), providers, machine,
      measured_at: read.ok ? String(read.data?.measured_at || '') : '',
      refreshed_at: read.ok ? String(read.data?.refreshed_at || '') : '',
      loaded: true,
    };
    inflight = null;
    return catalog;
  });
  return inflight;
}

/** What every reader paints from: `{ rows, providers, machine, measured_at, refreshed_at, loaded }`. */
export const providerCatalog = () => catalog;

/** light · standard · frontier · unrated, in the person's words. */
export function tierWord(tier) {
  return { light: t('forms.tier_light', 'light'), standard: t('forms.tier_standard', 'standard'), frontier: t('forms.tier_frontier', 'frontier'), unrated: t('forms.tier_unrated', 'unrated') }[tier] || String(tier || '');
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
/**
 * A row's tier and its line, as every picker shows them beside the name: "frontier · <HQ's
 * use it for line>". The tier word drops when the name already says it (a Ronin models tier
 * row is named for its tier); the line is the model's own, from HQ's catalog; Unrated has none.
 */
export const rowTierWord = (row) => {
  const tier = row?.model === NATIVE_MODEL ? '' : tierWord(row?.tier);
  const word = tier && tier.toLowerCase() !== modelLabel(row).toLowerCase() ? tier : '';
  const line = row?.model === NATIVE_MODEL ? '' : String(row?.use_for || '');
  return [word, line].filter(Boolean).join(' · ');
};
export const modelWord = (row) => rowTierWord(row)
  ? t('forms.model_word', '{model} · {tier}', { model: modelLabel(row), tier: rowTierWord(row) })
  : modelLabel(row);

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
  providerSelect.setAttribute('aria-label', labels.provider ?? t('forms.provider', 'harness'));
  modelSelect.setAttribute('aria-label', labels.model ?? t('forms.model', 'model'));
  const option = (label, value, disabled = false) => { const out = el('option', null, label); out.value = value; out.disabled = disabled; return out; };
  const paint = () => {
    const current = read() || {};
    const providers = providerCatalog().providers;
    providerSelect.replaceChildren(option(blank.provider ?? t('forms.default', 'default'), ''));
    for (const entry of providers) {
      const name = entry.cli_label || entry.label;
      const label = entry.operational ? name : entry.off ? t('forms.provider_turned_off', '{name} — turned off', { name }) : entry.cli === 'hermes' ? `${name} — add a setup in Models` : t('forms.provider_off', '{name} — not on this machine', { name });
      providerSelect.add(option(label, entry.provider, !entry.operational));
    }
    providerSelect.value = current.provider || '';
    const chosen = fixed || providerSelect.value;
    const rows = providerCatalog().rows.filter(row => row.provider === chosen);
    modelSelect.replaceChildren(option(blank.model ?? t('forms.default', 'default'), ''));
    for (const row of rows) {
      const label = fixed && !row.operational ? (row.off ? t('forms.model_turned_off', '{model} — turned off', { model: modelWord(row) }) : t('forms.model_off', '{model} — not on this machine', { model: modelWord(row) })) : modelWord(row);
      modelSelect.add(option(label, row.model, !row.selectable));
    }
    modelSelect.value = current.model || '';
    modelSelect.disabled = !chosen;
  };
  providerSelect.addEventListener('change', () => { write(providerSelect.value, ''); paint(); });
  modelSelect.addEventListener('change', () => write(fixed || providerSelect.value, modelSelect.value));
  const wrap = el('div', 'fs-pair');
  if (!fixed) wrap.append(field(labels.provider ?? t('forms.provider', 'harness'), providerSelect));
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
