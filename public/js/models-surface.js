/* part of the ronin-cowork client — see js/README.md */
/**
 * SETTINGS' HARNESS SURFACES, drawn with the one harness panel (harnesses-surface.js), as Setup's Harness step is.
 *   `createModelStones`: the stones of harnesses; a stone pressed opens its panel in place of the stones; a
 *   stone dragged into a workspace places that harness there whole (`createModelHarness`).
 *   Here the Helpful Assistant opens in a window on the surface, put away with − (`createAgentWindow`).
 *   The selector lists one card per harness (`harnessOffers`).
 *   `createModelDefaults`: the model a new Agent, a new Team lead and Mika start on (Office defaults).
 */
import { WorkspaceKit } from './workspace-kit.js';
import { el } from './form-steps.js';
import { createHarnessDrawing, createHarnessesSurface, harnessStones, recordRuntime } from './harnesses-surface.js';
import { SURFACE_DRAG } from './workbench.js';
import { WORKBENCH_TYPES } from './workbench-catalog.js';
import { t } from './lexicon.js';
import { buildMachineSettings } from './machine-settings.js';
import { IRASSHAI_NAME, askIrasshai, createIrasshaiChat, irasshaiLive } from './setup-irasshai.js';

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

/** SETTINGS' WINDOW ON THE SURFACE (owner, 27 Nov 2026): the Helpful Assistant's chat over a harness surface,
 *  asked for when she is not here, put away with a kaki −. One per surface. */
function createAgentWindow() {
  let made = null;
  const build = () => {
    const out = el('section', 'harness-agent-window');
    const head = el('header', 'harness-agent-window-head');
    const close = el('button', 'window-control minimize', '−'); // the kaki − documents and the phalanx use
    close.type = 'button';
    close.setAttribute('aria-label', t('harness.put_away', 'Put away'));
    const chat = createIrasshaiChat();
    head.append(el('b', '', IRASSHAI_NAME), chat.toggle, close);
    out.append(head, chat.el);
    close.addEventListener('click', () => { chat.hide(); out.remove(); });
    return { out, chat };
  };
  return {
    open: (surface) => {
      if (!irasshaiLive()) void askIrasshai();
      made ||= build();
      if (!made.out.isConnected) surface.append(made.out);
      made.chat.show();
    },
    destroy: () => { made?.out.remove(); made?.chat.dispose(); made = null; },
  };
}

/** WS1: the stones of harnesses; the pressed one's panel in their place. */
export function createModelStones(context) {
  const agent = createAgentWindow();
  const surface = createHarnessesSurface(context, { label: t('harness.stones', 'Harness'), className: 'models-stones', openAgent: (at) => agent.open(at), decorate: draggable });
  return { el: surface.el, show: surface.show, destroy: () => { agent.destroy(); surface.destroy(); } };
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

/** A workspace of its own for one provider: its page, the whole workspace. */
export function createModelHarness(key, context) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: key, className: 'setup-surface models-provider' });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const page = el('div', 'models-provider-page');
  out.content.append(page, notice);
  let dispose = null;
  const agent = createAgentWindow();
  const drawing = createHarnessDrawing(context, { repaint: () => repaint(), say });
  // Mounted once: the panel hears every frame itself, so its terminal and drafts stand.
  const repaint = () => {
    out.header.title.textContent = drawing.stones().find((stone) => stone.id === key)?.label || key;
    dispose ||= drawing.paintHarness(key, page, { openAgent: () => agent.open(out.el) });
  };
  return {
    el: out.el,
    show: async () => { await drawing.showRecord(); },
    destroy: () => { dispose?.(); agent.destroy(); drawing.destroy(); },
  };
}
