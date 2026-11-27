/* part of the ronin-cowork client — see js/README.md */
/**
 * SETTINGS' HARNESS SURFACES, drawn with harnesses-surface.js (createHarnessDrawing, a harness's
 * page; harnessStones, the stones) over the same reads.
 *   `createModelStones`: the stones of harnesses; a stone pressed opens its page in place of the stones; a
 *   stone dragged into a workspace places that harness there whole (`createModelHarness`).
 *   The selector lists one card per harness (`harnessOffers`).
 *   `createModelRefresh`: Refresh all, step by step.
 *   `createModelDefaults`: the model a new Agent, a new Team lead and Mika start on (Office defaults).
 */
import { WorkspaceKit } from './workspace-kit.js';
import { dayTime, el } from './form-steps.js';
import { createPhalanx } from './phalanx.js';
import { createHarnessDrawing, createRefreshAll, harnessStones, recordRuntime, stepItem } from './harnesses-surface.js';
import { SURFACE_DRAG } from './workbench.js';
import { WORKBENCH_TYPES } from './workbench-catalog.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { buildMachineSettings } from './machine-settings.js';

/** The selector's cards: one per provider, from the record every reader takes. */
export const harnessOffers = () => harnessStones(recordRuntime()).map(({ id, label, secondary }) => ({ key: id, label, summary: secondary }));

/** A stone that can be dragged into a workspace: the drop places the provider there. */
const draggable = (stone) => ({
  ...stone,
  draggable: true,
  events: { dragstart: (event) => {
    event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.modelHarness, detail: { key: stone.id } }));
    event.dataTransfer.setData('text/plain', stone.label);
    event.dataTransfer.effectAllowed = 'copy';
  } },
});

/** WS1: the stones of providers; the pressed one's page in their place. */
export function createModelStones(context) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('harness.stones', 'Harness'), className: 'setup-surface setup-provider-surface models-stones' });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const drawing = createHarnessDrawing(context, { repaint: () => repaint(), say });
  const stones = createPhalanx({
    className: 'setup-provider-stones',
    renderDetail: (item, host) => drawing.paintHarness(item.id, host),
    onSelectionChange: (id) => { if (!id) drawing.closed(); },
  });
  stones.mount(out.content, { after: [notice] });
  const repaint = () => {
    context.workbench?.refreshSelector?.();
    const items = drawing.stones();
    say(items.length ? '' : t('setup_surface.no_catalog', 'No harnesses are in the catalog on this machine.'));
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
 * step by step, never a black box. Two steps in the provider page's own shape (stepItem):
 *   1. Harnesses — each signed-in CLI's own list, read by the door's request.
 *   2. Accounts — each configured account asked for its list (KAN-236).
 * Each step says running, done or failed as the door runs. (The models.dev step went, owner
 * 18 Nov 2026, KAN-653: the CLIs' own lists are the source.)
 */
export function createModelRefresh(context) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('harness.refresh', 'Refresh'), className: 'setup-surface models-refresh' });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const drawing = createHarnessDrawing(context, { repaint: () => repaint(), say });
  // What each step is doing now: '' at rest (it says what the record holds), or the door's state.
  const live = { lists: '', accounts: '' };
  // The model services: read with the record, each asked for its model list when the door runs.
  let accounts = [];
  const readAccounts = async () => { const result = await request('/api/model-services', { cache: 'no-store' }); if (result.ok) accounts = result.data.services || []; return result.ok; };
  const discoverAccounts = async () => {
    let every = true;
    for (const account of accounts.filter((row) => row.configured && !row.seeded)) {
      const result = await request('/api/model-services/discover', { method: 'POST', json: { id: account.id } });
      if (!result.ok) every = false;
    }
    await readAccounts();
    return every;
  };
  const refresh = createRefreshAll(drawing, { between: discoverAccounts, onStep: (key, state) => {
    live[key] = state;
    paintSteps();
  } });
  const flow = el('ol', 'setup-provider-steps models-refresh-steps');
  out.content.append(refresh.el, notice, flow);
  const paintSteps = () => {
    flow.replaceChildren(
      listsStep(drawing.runtime(), live.lists),
      accountsStep(accounts, live.accounts),
    );
  };
  const repaint = () => { refresh.paint(); paintSteps(); context.workbench?.refreshSelector?.(); };
  return {
    el: out.el,
    show: async () => {
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

/** Step 1: each harness (CLI) — its version, the newer release, and what its own list said, from the record the door just wrote. */
function listsStep(runtime, state) {
  const providers = Array.isArray(runtime?.harnesses) ? runtime.harnesses : [];
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

/** Step 2: each configured model service asked for its model list. */
function accountsStep(accounts, state) {
  const rows = accounts.filter((row) => !row.seeded);
  const dated = rows.map((row) => row.discoveredAt).filter(Boolean).sort().pop();
  const made = stepItem({ key: 'accounts', n: 2, label: t('model_services.title', 'Model services'),
    ...stepState(state, dated ? { state: t('models.lists_read', 'Read {date}', { date: dayTime(dated) }), done: true } : { state: rows.length ? t('models.lists_never', 'Not read yet') : t('accounts.none_yet', 'None yet') }),
    detail: t('accounts.step_detail', 'Each private API and Ronin Gateway is asked for its model list.') });
  for (const row of rows) {
    const said = !row.configured ? t('accounts.key_missing', 'Key missing')
      : row.discoveredAt ? t('accounts.models_count', '{n} models', { n: (row.discovered || []).length })
      : t('models.lists_not_read', 'not read yet');
    factsOf(made).append(line(row.name, said));
  }
  return made.item;
}

/** A workspace of its own for one provider: its page, the whole workspace. */
export function createModelHarness(key, context) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: key, className: 'setup-surface models-provider' });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const page = el('div', 'models-provider-page');
  out.content.append(page, notice);
  let dispose = null;
  const drawing = createHarnessDrawing(context, { repaint: () => repaint(), say });
  const repaint = () => {
    dispose?.(); dispose = null;
    page.replaceChildren();
    out.header.title.textContent = drawing.stones().find((stone) => stone.id === key)?.label || key;
    dispose = drawing.paintHarness(key, page);
  };
  return {
    el: out.el,
    show: async () => { await drawing.showRecord(); },
    destroy: () => { dispose?.(); drawing.destroy(); },
  };
}
