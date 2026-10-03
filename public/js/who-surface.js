/* part of the ronin-cowork client — see js/README.md */
/**
 * WHO — the Teams door of the collections workbench (owner, 2026-10-03). One stone per Team
 * in the shared Phalanx; under each stone, in chart rest, one column per board the Team works
 * on with that board's items stacked beneath. The header's one-line/two-line toggle folds the
 * boards away (stones only) or shows them. The top area holds one filter: the workspace
 * folder, so a Team working in two folders is found under either.
 *
 * Drill is the Phalanx's own, in place: press a Team and its boards and items are the rail
 * with the Team's profile beside; press a board and the detail is the board's items; press
 * an item and the detail is the item. Escape or the back stone is the one way back.
 *
 * Reading: GET /api/collection (src/collection-read.ts), one request, the folder filter sent
 * as ?root=. The no-team stone carries the Unfiled board, the board no Team holds; both say
 * the same thing from either side. `whoRows` (who-rows.js) is the pure mapping.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createPhalanx } from './phalanx.js';
import { membersOfTeam, subscribe, UNASSIGNED } from './team-controller.js';
import { whoRows } from './who-rows.js';
import { agentTitle } from './team-members.js';
import { stageLabel } from './team-kanban.js';
import { itemDetail, listDetail } from './work-details.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { t } from './lexicon.js';

export const WHO_TYPE = 'collection.who';
const el = (tag, cls = '') => { const out = document.createElement(tag); if (cls) out.className = cls; return out; };

/** `teamDetail(name)` is the Cowork view's one Team profile ({ el, render }), painted in place. */
export function createWhoSurface({ teamDetail } = {}) {
  const { createSurface, createAction } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('collection.who', 'Who'), className: 'who-surface' });
  // The one-line/two-line toggle the selector column wears: two lines shows the boards.
  const lines = createAction({ label: '', size: 'compact', className: 'tw-agent-density who-lines' });
  const marks = el('span', 'tw-agent-density-lines');
  marks.append(el('i'), el('i'));
  lines.el.replaceChildren(marks);
  let expanded = true;
  const paintLines = () => {
    lines.el.dataset.lines = expanded ? 'two' : 'one';
    lines.el.title = expanded ? t('collection.fold_boards', 'Hide the boards') : t('collection.unfold_boards', 'Show the boards');
    lines.el.setAttribute('aria-label', lines.el.title);
    lines.el.setAttribute('aria-pressed', String(expanded));
  };
  lines.el.addEventListener('click', () => { expanded = !expanded; paintLines(); phalanx.setDensity(expanded ? 'full' : 'compact'); });
  paintLines();
  surface.header?.actions.append(lines.el);

  // The filter: all workspaces, or one folder; the reading is asked again with it.
  let root = '';
  const filter = ask([{ fields: [{ key: 'root', label: t('collection.workspace', 'Workspace'), blank: t('collection.all_workspaces', 'All workspaces'), options: [] }] }],
    { density: 'tight', onChange: ({ root: next }) => { root = String(next || ''); void read(); } });

  const renderDetail = (item, host) => {
    if (item.kind === 'board') {
      listDetail(host, { title: item.board.title, about: item.board.objective || '', items: item.board.stages.flatMap((row) => row.items),
        empty: t('collection.board_empty', 'Nothing under this board yet.') });
      // An item line in the board's detail is the same press as its stone in the rail.
      for (const line of host.querySelectorAll('.tk-line')) line.addEventListener('click', () => phalanx.select(line.dataset.item, { focus: true }));
      return;
    }
    if (item.kind === 'item') { itemDetail(host, item.item); return; }
    const view = teamDetail?.(item.id);
    if (view) host.append(view.el);
  };
  const phalanx = createPhalanx({ className: 'who-phalanx', items: [], renderDetail, branches: 'chart' });
  phalanx.mount(surface.content, { before: [filter.el] });

  let shown = '';
  let reading = null;
  const paint = (data) => {
    const next = whoRows(data, {
      root, stageName: stageLabel, noTeamId: UNASSIGNED,
      leadOf: (name) => { const lead = membersOfTeam(name).find((member) => member.team_lead); return lead ? agentTitle(lead) : ''; },
      labels: {
        noTeam: t('league.ronin', 'Ronin: no team'),
        agents: (count) => t('league.agent_count', '{count} Agents', { count }),
        items: (count) => t('league.item_count', '{count} items', { count }),
      },
    });
    const signature = JSON.stringify(next);
    if (signature === shown) return;
    shown = signature;
    phalanx.setItems(next);
    filter.options('root', (data.roots || []).map((row) => ({ v: row.name, l: row.name })));
  };
  // Every folder stays offered while a filter is on: the first unfiltered reading's list holds.
  let roots = null;
  async function read() {
    reading?.abort();
    const controller = new AbortController(); reading = controller;
    const result = await request(`/api/collection${root ? `?root=${encodeURIComponent(root)}` : ''}`, { cache: 'no-store', signal: controller.signal });
    if (controller.signal.aborted || !result.ok) { if (!controller.signal.aborted) surface.setState('failed', result.message || ''); return; }
    surface.setState();
    if (!root || !roots) roots = result.data.roots || [];
    paint({ ...result.data, roots });
  }
  let entered = false;
  const stop = subscribe(() => { if (entered) void read(); });
  return {
    el: surface.el,
    show: () => { entered = true; void read(); },
    leave: () => { entered = false; reading?.abort(); },
    destroy: () => { entered = false; reading?.abort(); stop?.(); filter.destroy?.(); phalanx.destroy(); },
  };
}
