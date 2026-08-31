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
 */
import { launchSpecData } from './home.js';
import { t } from './lexicon.js';

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
  const head = el('div', 'fs-step-head');
  const num = el('span', 'fs-step-n', String(n));
  const chev = el('span', 'fs-chev', '');
  head.append(num, el('h3', null, title));
  const body = el('div', 'fs-step-body');
  const sum = el('span', 'fs-sum');
  sum.hidden = true;
  box.append(head, body, sum);
  if (onToggle) {
    head.append(chev);
    head.addEventListener('click', () => onToggle());
  }
  const setCollapsed = (on, meta = '', togglable = !!onToggle) => {
    box.dataset.collapsed = String(!!on);
    head.classList.toggle('fs-togglable', togglable);
    chev.textContent = togglable ? (on ? '▸' : '▾') : '';
    body.hidden = !!on;
    sum.hidden = !on;
    if (on) sum.textContent = meta || '—';
  };
  setCollapsed(false, '', !!onToggle && false);
  return {
    el: box,
    body,
    key,
    setNumber: (value) => { num.textContent = String(value); },
    // The outline in a Launch selector reads and writes this title, so the two can never
    // drift: one step, one name, wherever it is drawn.
    title: () => head.querySelector('h3').textContent,
    setTitle: (value) => { head.querySelector('h3').textContent = value; },
    focus: () => box.scrollIntoView({ block: 'start', behavior: 'smooth' }),
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

/** The six kinds and the not-applicable box below them — `open` is dotted and set apart,
 *  never a seventh peer (owner, 2026-08-31). Labels ride the reserved `kind.*` keys. */
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
export function templateTray(rows, current, onPick) {
  const grid = el('div', 'fs-tmplgrid');
  const box = (art, label, blurb, picked, act) => {
    const cell = el('button', 'fs-tmpl');
    cell.type = 'button';
    cell.title = blurb;
    cell.setAttribute('aria-pressed', String(picked));
    const words = el('div');
    words.append(el('b', null, label));
    cell.append(el('i', null, art), words);
    if (act) cell.addEventListener('click', act);
    return cell;
  };
  grid.append(box('＋', t('forms.own', 'Make your own'), t('forms.own_blurb', 'Fresh and empty. Fill it in yourself.'), current === '', () => onPick('')));
  for (const row of rows) {
    grid.append(box(row.art, row.label, row.blurb, current === row.name, () => onPick(row.name)));
  }
  const soon = box('▤', t('forms.library', 'From the Ronin library'), t('forms.library_blurb', 'Published bundles, pulled in and run. Not yet built.'), false, null);
  soon.disabled = true;
  grid.append(soon);
  return grid;
}

/**
 * TWO PICKS, AND EITHER MAY STAND ALONE. Naming the provider and no model gets that
 * provider's preferred model, server-side; both blank is the level above's answer. The
 * model select waits for a provider to name its table.
 */
export function providerModelPair(read, write, field) {
  const providerSelect = el('select');
  const modelSelect = el('select');
  const paint = () => {
    const rows = Array.isArray(launchSpecData) ? launchSpecData : [];
    const current = read();
    const seen = [...new Set(rows.map((row) => row.provider).filter(Boolean))];
    providerSelect.replaceChildren();
    providerSelect.add(new Option(t('forms.default', 'default'), ''));
    for (const name of seen) providerSelect.add(new Option(name, name));
    providerSelect.value = seen.includes(current.provider) ? current.provider : '';
    modelSelect.replaceChildren();
    modelSelect.add(new Option(t('forms.default', 'default'), ''));
    for (const row of rows) if (row.provider === providerSelect.value) modelSelect.add(new Option(row.model, row.model));
    modelSelect.value = current.model;
    modelSelect.disabled = !providerSelect.value;
  };
  providerSelect.addEventListener('change', () => { write(providerSelect.value, ''); paint(); });
  modelSelect.addEventListener('change', () => { write(providerSelect.value, modelSelect.value); });
  const wrap = el('div', 'fs-pair');
  wrap.append(field(t('forms.provider', 'model provider'), providerSelect), field(t('forms.model', 'model'), modelSelect));
  return { el: wrap, paint };
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
