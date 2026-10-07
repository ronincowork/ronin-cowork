/* part of the ronin-cowork client — see js/README.md */
/**
 * WORK — one card on the Team tenant with two layers behind a toggle: the Trello view and
 * the Work Items board, each the existing surface as it draws today (owner, 2026-10-07: both
 * stay, both need work later; this only puts them on team-next as one card). The toggle is
 * the one selector (ask.js), a two-answer question that flips on press, at the top of the
 * surface as Who's questions sit. Nothing here has a look of its own.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { ask } from './ask.js';
import { t } from './lexicon.js';

export const WORK_SURFACES_TYPE = 'team-next.work';

/** `trello()` and `workItems()` make the layers on first use; each is `{ el, show, leave?, destroy? }`. */
export function createWorkSurfaces({ trello, workItems }) {
  const { createSurface } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('team.work_card', 'Work'), className: 'work-surfaces' });
  const host = document.createElement('div');
  host.className = 'work-surfaces-layer';
  const layers = { trello: null, items: null };
  const make = { trello, items: workItems };
  let chosen = 'trello';
  let shown = null;
  let entered = false;
  const layer = (key) => { layers[key] ||= make[key](); return layers[key]; };
  const paint = () => {
    const next = layer(chosen);
    if (shown && shown !== next) shown.leave?.();
    shown = next;
    if (host.firstElementChild !== next.el) host.replaceChildren(next.el);
    if (entered) next.show?.();
  };
  const toggle = ask([{ fields: [{ key: 'layer', label: t('team.work_layer', 'Show'), options: [
    { v: 'trello', l: t('work_views.title', 'Trello view') },
    { v: 'items', l: t('work_items.title', 'Work Items') },
  ] }] }], { value: { layer: chosen }, density: 'tight', onChange: ({ layer: next }) => {
    chosen = next === 'items' ? 'items' : 'trello';
    paint();
  } });
  surface.content.append(toggle.el, host);
  return {
    el: surface.el,
    show: () => { entered = true; paint(); },
    leave: () => { entered = false; shown?.leave?.(); },
    destroy: () => { entered = false; toggle.destroy?.(); for (const made of Object.values(layers)) made?.destroy?.(); },
  };
}
