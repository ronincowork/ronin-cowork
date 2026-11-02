/* part of the ronin-cowork client — see js/README.md */
/**
 * THE EPICS WORKBENCH'S SURFACES (owner, 2026-11-02; KAN-187). Epics are work items, the level-1
 * parents (work-items.ts). Tilespace 1 holds a stone per Epic (`createEpicStones`), each stone its
 * title only, as the Teams and Workspaces stones are their names (team-roster-surface.js,
 * workspaces-surface.js). A pressed one's detail is the item's own reading (`renderItemDetail`,
 * work-items-surface.js); dragged into a tilespace, the stone places that Epic whole there
 * (`createEpicRecord`). The Epics are the store's pushed `epics` (js/store.js; KAN-190), sent
 * after every work item write, narrowed to the Campaign this tab looks at (`createEpicsRead`):
 * no surface here asks the server for them.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createPhalanx } from './phalanx.js';
import { t } from './lexicon.js';
import { subscribe as hear } from './store.js';
import { SURFACE_DRAG } from './workbench.js';
import { WORKBENCH_TYPES } from './workbench-catalog.js';
import { holderOf, renderItemDetail } from './work-items-surface.js';

/** The Epics of a reading: its level-1 items, by title. */
export const epicsOf = (items) => (items || []).filter((item) => item.level === 1)
  .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)));

/** Who works an Epic: its Agent, or the Team that holds it. */
function holder(item) {
  return holderOf(item, String(item.holder || '').replace(/^team:/, ''));
}

/** The bench's Epics: the pushed `epics` of the Campaign this tab looks at (all, when none). Each
 * `subscribe` hears the list now and on every push that moved it. */
export function createEpicsRead(campaignId) {
  const list = (pushed) => epicsOf((pushed || []).filter((item) => !campaignId() || item.campaign_id === campaignId()));
  let pushed = [];
  return {
    list: () => list(pushed),
    subscribe: (listener) => hear('epics', (next) => { pushed = Array.isArray(next) ? next : []; listener(); }),
  };
}

const status = () => { const line = document.createElement('div'); line.className = 'pr-status'; line.setAttribute('role', 'status'); return line; };

/** A stone per Epic, its title only; pressed, the Epic's reading beside the rail. */
export function createEpicStones({ epicsRead, workbench }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('epics.title', 'Epics'), className: 'setup-surface epics-records' });
  const messages = status();
  const say = (message, bad = false) => {
    messages.replaceChildren();
    if (!message) return;
    const line = document.createElement('div');
    line.className = `pr-empty${bad ? ' bad' : ''}`;
    line.textContent = message;
    messages.append(line);
  };
  const stones = createPhalanx({
    className: 'epic-stones',
    renderDetail: (stone, host) => {
      host.scrollTop = 0;
      const epic = epicsRead.list().find((row) => row.id === stone.id);
      if (epic) renderItemDetail(host, epic, { holder: holder(epic) });
    },
  });
  stones.mount(out.content, { before: [messages] });
  let shown = null;
  const paint = () => {
    say(epicsRead.list().length ? '' : t('epics.none', 'No Epics yet.'));
    const next = epicsRead.list().map((epic) => {
      const label = epic.title || epic.id;
      return {
        id: epic.id, label, draggable: true,
        events: { dragstart: (event) => {
          event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.epicRecord, detail: { key: epic.id } }));
          event.dataTransfer.setData('text/plain', label);
          event.dataTransfer.effectAllowed = 'copy';
        } },
      };
    });
    // A read that moves nothing a stone shows leaves the stones and an open reading alone.
    const signature = JSON.stringify(next.map(({ id, label }) => [id, label]));
    if (signature !== shown) { shown = signature; stones.setItems(next); } else stones.refreshDetail?.();
    workbench?.refreshSelector?.();
  };
  let stop = null;
  return {
    el: out.el,
    show: () => { stop ??= epicsRead.subscribe(paint); paint(); },
    destroy: () => { stop?.(); stop = null; stones.destroy(); },
  };
}

/** One Epic whole in a tilespace: its reading, no rail. */
export function createEpicRecord(key, { epicsRead }) {
  const { createSurface, setSurfaceState } = WorkspaceKit.primitives;
  const out = createSurface({ label: key, className: 'setup-surface epics-record' });
  const paint = () => {
    const epic = epicsRead.list().find((row) => row.id === key);
    out.content.replaceChildren();
    if (!epic) { setSurfaceState(out.el, 'empty', t('epics.gone', 'This Epic is no longer here.')); return; }
    setSurfaceState(out.el, null, '');
    out.header.title.textContent = epic.title || epic.id;
    renderItemDetail(out.content, epic, { holder: holder(epic) });
  };
  let stop = null;
  return {
    el: out.el,
    show: () => { stop ??= epicsRead.subscribe(paint); paint(); },
    destroy: () => { stop?.(); stop = null; },
  };
}
