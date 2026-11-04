/* part of the ronin-cowork client — see js/README.md */
/**
 * THE MODELS WORKBENCH'S SURFACES (owner, 2026-10-19; PATTERNS.md Home). Home's Models door
 * opens the Models workbench; its surfaces are its own, apart from Settings' Model Providers
 * surface, and draw with the same drawing (provider-surface.js: createProviderDrawing, the
 * provider's page; providerStones, the stones) over the same reads.
 *   WS1 `createModelStones`: Phalanx A/B stones of providers. A stone pressed opens the
 *   provider's page beside the rail; a stone dragged into a workspace places the provider
 *   there whole (`createModelProvider`), no rail, the whole workspace to its page.
 *   The selector lists one card per provider (`providerOffers`), each placing that surface.
 *   `createModelDefaults`: the model a new Agent, a new Team lead and Mika start on.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { dayTime, el, loadProviderCatalog, providerCatalog } from './form-steps.js';
import { createPhalanx } from './phalanx.js';
import { createProviderDrawing, createRefreshAll, providerStones, recordRuntime, stepItem } from './provider-surface.js';
import { SURFACE_DRAG } from './workbench.js';
import { WORKBENCH_TYPES } from './workbench-catalog.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { toClipboard } from './panels.js';
import { buildMachineSettings } from './machine-settings.js';

/** The selector's cards: one per provider, from the record every reader takes. */
export const providerOffers = () => providerStones(recordRuntime()).map(({ id, label, secondary }) => ({ key: id, label, summary: secondary }));

/** A stone that can be dragged into a workspace: the drop places the provider there. */
const draggable = (stone) => ({
  ...stone,
  draggable: true,
  events: { dragstart: (event) => {
    event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.modelProvider, detail: { key: stone.id } }));
    event.dataTransfer.setData('text/plain', stone.label);
    event.dataTransfer.effectAllowed = 'copy';
  } },
});

/** WS1: the stones of providers; the pressed one's page beside the rail. */
export function createModelStones(context) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('harness.stones', 'Harness'), className: 'setup-surface setup-provider-surface models-stones' });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const drawing = createProviderDrawing(context, { repaint: () => repaint(), say });
  const stones = createPhalanx({
    className: 'setup-provider-stones',
    renderDetail: (item, host) => drawing.paintProvider(item.id, host),
    onSelectionChange: (id) => { if (!id) drawing.closed(); },
  });
  stones.mount(out.content, { after: [notice] });
  const repaint = () => {
    context.workbench?.refreshSelector?.();
    const items = drawing.stones();
    say(items.length ? '' : t('setup_surface.no_catalog', 'No model providers are in the catalog on this machine.'));
    stones.setItems(items.map(draggable));
  };
  return {
    el: out.el,
    show: async () => { await drawing.showRecord(); },
    destroy: () => { drawing.destroy(); stones.destroy(); },
  };
}

/**
 * THE MODEL REFRESH SURFACE (owner, 2026-10-20): the one Refresh all door and what it does,
 * step by step, never a black box. Three steps in the provider page's own shape (stepItem):
 *   1. Model lists — each signed-in CLI's own list, read by the door's first request.
 *   2. Model info — models.dev, fetched by its second request on its own route: the source,
 *      its repository and licence, what was kept, and which copy Ronin uses.
 *   3. Review — an update that differs waits here, one row per model in the provider
 *      table's columns, with Accept · Discard · View payload (the pending file whole, raw,
 *      in the full overlay with one Copy). Only Accept uses it.
 * Each step says running, done or failed as the door runs.
 */
export function createModelRefresh(context) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('harness.refresh', 'Refresh'), className: 'setup-surface models-refresh' });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const drawing = createProviderDrawing(context, { repaint: () => repaint(), say });
  // What each step is doing now: '' at rest (it says what the record holds), or the door's state.
  const live = { lists: '', accounts: '', info: '' };
  let review = null;
  let infoFailure = '';
  // The accounts (KAN-236): read with the record, discovered one by one when the door runs.
  let accounts = [];
  const readAccounts = async () => { const result = await request('/api/accounts', { cache: 'no-store' }); if (result.ok) accounts = result.data.accounts || []; return result.ok; };
  const discoverAccounts = async () => {
    let every = true;
    for (const account of accounts.filter((row) => row.configured && !row.seeded)) {
      const result = await request('/api/accounts/discover', { method: 'POST', json: { id: account.id } });
      if (!result.ok) every = false;
    }
    await readAccounts();
    return every;
  };
  const refresh = createRefreshAll(drawing, { between: discoverAccounts, onStep: (key, state, answer) => {
    live[key] = state;
    if (key === 'info' && state === 'done') review = answer;
    if (key === 'info') infoFailure = state === 'failed' ? String(answer || '') : '';
    paintSteps();
  } });
  const flow = el('ol', 'setup-provider-steps models-refresh-steps');
  out.content.append(refresh.el, notice, flow);
  const send = async (url) => {
    const result = await request(url, { method: 'POST', json: {} });
    if (!result.ok) { say(result.message, true); return; }
    review = result.data;
    await loadProviderCatalog();
    paintSteps();
  };
  // View payload: the pending file as it is, over this surface, with one Copy.
  const view = async () => {
    const read = await request('/api/model-info/pending', { cache: 'no-store' });
    if (!read.ok) { say(read.message, true); return; }
    const text = JSON.stringify(read.data, null, 2);
    const { fullOverlay } = await import('./work-details.js');
    out.el.querySelector(':scope > .work-overlay')?.remove();
    fullOverlay(out.el, (layer, [utility]) => {
      const copy = WorkspaceKit.primitives.createAction({ label: t('models.payload_copy', 'Copy'), size: 'compact',
        action: async () => { copy.el.textContent = await toClipboard(text) ? t('models.payload_copied', 'Copied') : t('models.payload_copy_failed', 'Copy failed'); } });
      utility.prepend(copy.el);
      layer.append(utility, el('pre', 'models-payload', text));
    });
  };
  const paintSteps = () => {
    flow.replaceChildren(
      listsStep(drawing.runtime(), live.lists),
      accountsStep(accounts, live.accounts),
      infoStep(review, live.info, infoFailure),
      reviewStep(review, live, { send, view }),
    );
  };
  const repaint = () => { refresh.paint(); paintSteps(); context.workbench?.refreshSelector?.(); };
  return {
    el: out.el,
    show: async () => {
      const read = await request('/api/model-info', { cache: 'no-store' });
      if (read.ok) review = read.data;
      await readAccounts();
      await drawing.showRecord();
    },
    destroy: () => { drawing.destroy(); },
  };
}

/**
 * THE MODEL DEFAULTS SURFACE (owner, 2026-10-21): Agent, Team lead and Mika, each row saving
 * itself. It is ⚙ Configuration's own `models` section drawn alone: one record
 * (agents.sessions, jobs.mikaassist), two views, never two settings.
 */
export function createModelDefaults() {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('models.defaults', 'Defaults'), className: 'setup-surface models-defaults' });
  const room = buildMachineSettings(out.content, () => true, { only: 'models' });
  return { el: out.el, show: () => room.enter() };
}

/** A step's state while the door runs, else what the record says. */
const stepState = (state, rest) => state === 'running' ? { state: t('models.step_running', 'Running…'), current: true }
  : state === 'failed' ? { state: t('models.step_failed', 'Failed'), failed: true }
  : rest;

/** One line under a step: a quiet label and its value, the provider page's note. */
const line = (label, ...value) => {
  const p = el('p', 'setup-provider-note models-refresh-line');
  const text = el('span', 'models-refresh-value');
  text.append(...value.map((v) => (typeof v === 'string' ? document.createTextNode(v) : v)));
  p.append(el('span', 'models-refresh-key', label), text);
  return p;
};
/** A step's facts: one block under its description, a row per fact. */
const factsOf = (made) => {
  if (!made.facts) { made.facts = el('div', 'models-refresh-facts'); made.copy.append(made.facts); }
  return made.facts;
};
const link = (href, text) => { const a = el('a', null, text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };

/** Step 1: each harness (CLI) — its version, the newer release, and what its own list said, from the record the door just wrote. */
function listsStep(runtime, state) {
  const providers = Array.isArray(runtime?.providers) ? runtime.providers : [];
  const read = String(runtime?.refreshed_at || '');
  const made = stepItem({ key: 'lists', n: 1, label: t('harness.step_harnesses', 'Harnesses'),
    ...stepState(state, read ? { state: t('models.lists_read', 'Read {date}', { date: dayTime(read) }), done: true } : { state: t('models.lists_never', 'Not read yet') }),
    detail: t('harness.step_harnesses_detail', 'Each activated CLI: its version, the newest release, and its own model list. Only these models can launch on a subscription.') });
  for (const provider of providers.filter((row) => row.installed)) {
    const list = provider.model_list;
    const version = provider.version ? ` ${provider.version}` : '';
    const newer = provider.update_available && provider.latest ? t('models.lists_newer', ' · {version} available', { version: provider.latest }) : '';
    const said = !provider.activated ? t('models.lists_not_activated', 'not activated, not asked')
      : list?.unavailable ? list.unavailable
      : list ? t('models.lists_count', '{n} models', { n: list.rows?.length ?? 0 }) + newer
      : t('models.lists_not_read', 'not read yet');
    factsOf(made).append(line(`${provider.label || provider.id}${version}`, said));
  }
  return made.item;
}

/** Step 2 (KAN-236): each account asked for its model list — today's Hermes Discover, run for every configured account. */
function accountsStep(accounts, state) {
  const rows = accounts.filter((row) => !row.seeded);
  const dated = rows.map((row) => row.discoveredAt).filter(Boolean).sort().pop();
  const made = stepItem({ key: 'accounts', n: 2, label: t('accounts.title', 'Accounts'),
    ...stepState(state, dated ? { state: t('models.lists_read', 'Read {date}', { date: dayTime(dated) }), done: true } : { state: rows.length ? t('models.lists_never', 'Not read yet') : t('accounts.none_yet', 'None yet') }),
    detail: t('accounts.step_detail', 'Each Personal API and Ronin API account is asked for its list; you tick what it offers on Accounts.') });
  for (const row of rows) {
    const said = !row.configured ? t('accounts.key_missing', 'Key missing')
      : row.discoveredAt ? t('accounts.models_n', '{n} models · {m} offered', { n: row.models.length, m: row.offered.length })
      : t('models.lists_not_read', 'not read yet');
    factsOf(made).append(line(row.name, said));
  }
  return made.item;
}

/** Step 3: where model info comes from, what the last fetch kept, and which copy is in use. */
function infoStep(review, state, failure) {
  const check = review?.check;
  const failed = state === 'failed' || (!state && check?.outcome === 'failed');
  const rest = check && check.outcome !== 'failed' ? { state: t('models.info_fetched', 'Fetched {date}', { date: dayTime(check.at) }), done: true }
    : { state: t('models.info_never', 'Not fetched yet') };
  const made = stepItem({ key: 'info', n: 3, label: t('models.step_info', 'Model info'), ...stepState(failed ? 'failed' : state, rest),
    detail: t('models.info_detail', 'Names, descriptions, prices and limits for those models, from the public models.dev catalog.') });
  const source = review?.source;
  if (source) {
    factsOf(made).append(line(t('models.info_source', 'Source'), link(source.url, source.url.replace(/^https:\/\//, ''))));
    factsOf(made).append(line(t('models.info_repository', 'Repository'), link(source.repository, source.repository.replace(/^https:\/\//, '')), ` · ${source.licence}`));
  }
  if (failed) factsOf(made).append(line(t('models.info_why', 'Why'), failure || check?.say || ''));
  const labels = Object.fromEntries((providerCatalog().providers || []).map((p) => [p.models_dev, p.label]));
  const kept = review?.pending?.kept ?? review?.using?.kept ?? {};
  const keptText = Object.entries(kept).map(([key, n]) => `${labels[key] || key} ${n}`).join(' · ');
  if (keptText) factsOf(made).append(line(t('models.info_kept', 'Kept'), t('models.info_kept_text', '{list} — the models that use tools', { list: keptText })));
  const using = review?.using;
  if (using) {
    factsOf(made).append(line(t('models.info_in_use', 'In use'), using.origin === 'user'
      ? t('models.info_in_use_user', 'accepted by you, fetched {date}', { date: dayTime(using.fetched_at) })
      : t('models.info_in_use_stock', 'shipped with Ronin, fetched {date}', { date: dayTime(using.fetched_at) })));
  }
  return made.item;
}

/** A field's value for a table cell. */
const priceOf = (cost) => (typeof cost?.input === 'number' && typeof cost?.output === 'number' ? `$${cost.input} in · $${cost.output} out` : '');
const contextOf = (limit) => (limit?.context ? `${Math.round(limit.context / 1000).toLocaleString('en-GB')}K` : '');
/** `was → now` when a cell changed, else the value; an empty side reads —. */
const cell = (was, now, changed) => (changed && was !== now ? `${was || '—'} → ${now || '—'}` : now || was || '');

/** The fields the table shows; any other change is named under the model. */
const SHOWN = new Set(['name', 'description', 'release_date', 'cost.input', 'cost.output', 'limit.context']);
const fieldWord = (field) => ({
  family: t('models.field_family', 'family'), knowledge: t('models.field_knowledge', 'knowledge'),
  'cost.cache_read': t('models.field_cache_read', 'cache read price'), 'cost.cache_write': t('models.field_cache_write', 'cache write price'),
  'limit.output': t('models.field_output', 'output limit'), reasoning: t('models.field_reasoning', 'reasoning'), tool_call: t('models.field_tool_call', 'tool use'),
  open_weights: t('models.field_open_weights', 'open weights'), 'modalities.input': t('models.field_modalities_in', 'inputs'), 'modalities.output': t('models.field_modalities_out', 'outputs'),
}[field] || field);

/** Step 4: the update waiting, one row per model in the provider table's columns, and the three choices. */
function reviewStep(review, live, { send, view }) {
  const pending = review?.pending;
  const running = live.lists === 'running' || live.accounts === 'running' || live.info === 'running';
  const changes = pending?.changes ?? [];
  const rest = pending
    ? { state: t('models.review_waiting', '{n} changed · nothing changes until you accept', { n: changes.length === 1 ? t('models.one_model', '1 model') : t('models.n_models', '{n} models', { n: changes.length }) }), current: true }
    : review?.check?.outcome === 'same' ? { state: t('models.review_same', 'Nothing waiting: models.dev matches the model info in use'), done: true }
    : { state: t('models.review_none', 'Nothing waiting') };
  const made = stepItem({ key: 'review', n: 4, label: t('models.step_review', 'Review'), ...(running ? { state: t('models.review_after_info', 'After step 3') } : rest),
    detail: pending ? t('models.review_detail', 'Fetched {date}, compared with the model info Ronin uses now.', { date: dayTime(pending.fetched_at) }) : '' });
  if (!pending || running) return made.item;
  const table = el('table', 'setup-provider-models models-review');
  const head = el('tr');
  for (const text of [t('setup_surface.col_model', 'Model'), t('setup_surface.col_cost', 'Price'), t('setup_surface.col_context', 'Context'), t('setup_surface.col_released', 'Released'), t('setup_surface.col_description', 'Description')]) head.append(el('th', null, text));
  const thead = el('thead'); thead.append(head);
  const body = el('tbody');
  const words = { added: t('models.change_added', 'new'), removed: t('models.change_removed', 'gone'), changed: t('models.change_changed', 'changed') };
  for (const change of changes) {
    const info = pending.models?.[change.provider]?.[change.model] ?? {};
    const by = Object.fromEntries(change.fields.map((f) => [f.field, f]));
    const was = (field, fallback) => (by[field] ? by[field].was : fallback);
    const row = el('tr');
    row.dataset.change = change.change;
    const name = el('td');
    name.append(el('span', 'setup-provider-default', words[change.change] || change.change), el('b', null, info.name || change.model), el('span', 'setup-provider-model-id', change.model));
    const other = change.change === 'changed' ? change.fields.filter((f) => !SHOWN.has(f.field)).map((f) => `${fieldWord(f.field)} ${f.was ?? '—'} → ${f.now ?? '—'}`) : [];
    if (other.length) name.append(el('span', 'setup-provider-default', other.join(' · ')));
    const changed = change.change === 'changed';
    const inWas = was('cost.input', info.cost?.input); const outWas = was('cost.output', info.cost?.output);
    const side = (old, now) => (old !== now ? `$${old ?? '—'} → $${now ?? '—'}` : `$${now}`);
    const price = changed && (by['cost.input'] || by['cost.output'])
      ? `${side(inWas, info.cost?.input)} in · ${side(outWas, info.cost?.output)} out`
      : priceOf(info.cost);
    const contextWas = contextOf({ context: was('limit.context', info.limit?.context) });
    row.append(
      name,
      el('td', null, price),
      el('td', null, cell(contextWas, contextOf(info.limit), changed)),
      el('td', null, cell(dayTime(was('release_date', info.release_date)), dayTime(info.release_date), changed)),
      el('td', null, cell(was('description', info.description), info.description, changed)),
    );
    body.append(row);
  }
  table.append(thead, body);
  const scroll = el('div', 'setup-provider-table'); scroll.append(table);
  made.copy.append(scroll);
  const action = (label, kind, onClick) => { const button = WorkspaceKit.primitives.createAction({ label, kind, action: onClick }); const node = button.el ?? button; node.classList.add('setup-provider-action'); return node; };
  made.controls.append(
    action(t('models.info_accept', 'Accept'), 'primary', () => send('/api/model-info/accept')),
    action(t('models.info_discard', 'Discard'), '', () => send('/api/model-info/discard')),
    action(t('models.info_view_payload', 'View payload'), '', view),
  );
  return made.item;
}

/** A workspace of its own for one provider: its page, the whole workspace, no rail. */
export function createModelProvider(key, context) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: key, className: 'setup-surface models-provider' });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const page = el('div', 'models-provider-page');
  out.content.append(page, notice);
  let dispose = null;
  const drawing = createProviderDrawing(context, { repaint: () => repaint(), say });
  const repaint = () => {
    dispose?.(); dispose = null;
    page.replaceChildren();
    out.header.title.textContent = drawing.stones().find((stone) => stone.id === key)?.label || key;
    dispose = drawing.paintProvider(key, page);
  };
  return {
    el: out.el,
    show: async () => { await drawing.showRecord(); },
    destroy: () => { dispose?.(); drawing.destroy(); },
  };
}
