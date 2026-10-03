/* part of the ronin-cowork client — see js/README.md */
/**
 * WHO — the Teams door of the collections workbench (owner, 2026-10-03). One stone per Team
 * in the shared Phalanx; under each stone, in chart rest, one column per board the Team works
 * on, and, when the header's one-line/two-line toggle says two, that board's items beneath. The top area holds one filter: the workspace
 * folder, so a Team working in two folders is found under either, and a second question,
 * what stacks under each Team: its boards or its Agents (an Agent pressed is its profile).
 * Bars drag: an item onto a board, a board or an Agent onto a Team (whoMove says what it means).
 *
 * Drawn with the collection phalanx (collection-phalanx.js), the phalanx forked for the
 * doors. Drill is the phalanx's own, in place: press a Team and its boards and items are the rail
 * with the Team's profile beside; press a board and the detail is the board's items; press
 * an item and the detail is the item. Escape or the back stone is the one way back.
 *
 * Reading: GET /api/collection (src/collection-read.ts), one request, the folder filter sent
 * as ?root=, once per chosen workspace and joined (unionReadings). There is no stone for "no team": Unfiled is unfiled by definition (owner,
 * 2026-10-03). `whoRows` (who-rows.js) is the pure mapping.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createCollectionPhalanx } from './collection-phalanx.js';
import { membersOfTeam, moveTeamMembership, subscribe } from './team-controller.js';
import { unionReadings, whoMove, whoRows } from './who-rows.js';
import { agentTitle } from './team-members.js';
import { itemDetail, listDetail } from './work-details.js';
import { createAgentCompositionReader } from './agent-composition.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { t } from './lexicon.js';

export const WHO_TYPE = 'collection.who';
const el = (tag, cls = '') => { const out = document.createElement(tag); if (cls) out.className = cls; return out; };

/** `teamDetail(name)` is the Cowork view's one Team profile ({ el, render }), painted in place. */
export function createWhoSurface({ teamDetail, openAgent = () => {} } = {}) {
  const { createSurface, createAction } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('collection.who', 'Who'), className: 'who-surface' });
  // The one-line/two-line toggle the selector column wears: two lines shows the work items
  // under each board; one line, the boards alone.
  const lines = createAction({ label: '', size: 'compact', className: 'tw-agent-density who-lines' });
  const marks = el('span', 'tw-agent-density-lines');
  marks.append(el('i'), el('i'));
  lines.el.replaceChildren(marks);
  let expanded = false;
  const paintLines = () => {
    lines.el.dataset.lines = expanded ? 'two' : 'one';
    lines.el.title = expanded ? t('collection.fold_items', 'Hide the work items') : t('collection.unfold_items', 'Show the work items');
    lines.el.setAttribute('aria-label', lines.el.title);
    lines.el.setAttribute('aria-pressed', String(expanded));
    phalanx?.setFold(!expanded);
  };
  lines.el.addEventListener('click', () => { expanded = !expanded; paintLines(); });
  surface.header?.actions.append(lines.el);

  // Two questions: the workspace (all, or one folder; the reading is asked again with it),
  // and what stacks under each Team, its boards or its Agents.
  let chosen = []; // the workspaces chosen; none is all
  let under = 'boards';
  const filter = ask([{ fields: [
    { key: 'root', label: t('collection.workspace', 'Workspace'), blank: t('collection.all_workspaces', 'All workspaces'), many: true, options: [] },
    { key: 'under', label: t('collection.under_each_team', 'Under each Team'), options: [
      { v: 'boards', l: t('collection.under_boards', 'Boards') }, { v: 'agents', l: t('collection.under_agents', 'Agents') },
    ] },
  ] }], { value: { root: [], under }, density: 'tight', onChange: ({ root: nextRoots, under: nextUnder }) => {
    const next = (nextRoots || []).map(String);
    const rootsMoved = next.join('\n') !== chosen.join('\n');
    chosen = next; under = nextUnder === 'agents' ? 'agents' : 'boards';
    if (rootsMoved) void read(); else if (last) paint(last);
  } });

  const renderDetail = (item, host) => {
    if (item.kind === 'board') {
      listDetail(host, { title: item.board.title, about: item.board.objective || '', items: item.board.stages.flatMap((row) => row.items),
        empty: t('collection.board_empty', 'Nothing under this board yet.') });
      // An item line in the board's detail is the same press as its stone in the rail.
      for (const line of host.querySelectorAll('.tk-line')) line.addEventListener('click', () => phalanx.select(line.dataset.item, { focus: true }));
      return;
    }
    if (item.kind === 'item') { itemDetail(host, item.item); return; }
    if (item.kind === 'agent') {
      // The Agent's profile, as Team Chart draws it: name, then the composition reader; Launch opens its workbench.
      const member = item.agent;
      const head = el('div', 'league-team-detail-head');
      const launch = createAction({ label: t('league.launch_agent', 'Launch'), launch: true, size: 'compact', action: () => openAgent(member.name) });
      const tools = el('div', 'wk-surface-header-actions'); tools.append(launch.el);
      const title = el('h2'); title.textContent = member.title || member.name;
      const id = el('p', 'league-team-objective'); id.textContent = `@${member.name}`;
      head.append(title, tools, id);
      const box = el('div', 'league-team-detail'); box.append(head);
      const profile = createAgentCompositionReader(member.name, { setState: (kind, message) => surface.setState(kind, message) });
      box.append(profile.el); host.append(box);
      void profile.show();
      return profile.destroy;
    }
    const view = teamDetail?.(item.id);
    if (view) host.append(view.el);
  };
  const phalanx = createCollectionPhalanx({ className: 'who-phalanx', items: [], renderDetail });
  phalanx.mount(surface.content, { before: [filter.el] });
  paintLines();

  /* DRAG AND DROP (owner, 2026-10-03). A bar drags; a Team stone takes a board (assign) or an
   * Agent (join it, leave the Team it was under); a board bar takes an item (reparent). The
   * meaning is whoMove's; each move is one call to the store, then the reading is asked again. */
  const DRAG = 'application/x-ronin-who';
  const carried = (event) => { try { return JSON.parse(event.dataTransfer?.getData(DRAG) || 'null'); } catch { return null; } };
  const moves = {
    assign: (moved, target) => request(`/api/work-items/${encodeURIComponent(moved.id)}/assign`, { method: 'POST', json: { team: target.id } }),
    reparent: (moved, target) => request(`/api/work-items/${encodeURIComponent(moved.id)}/reparent`, { method: 'POST', json: { parent: target.id } }),
    join: (moved, target) => moveTeamMembership(moved.id, moved.team, target.id),
  };
  const wire = (rows, team = '', board = '') => rows.map((row) => {
    const out = { ...row, events: { ...(row.events || {}) } };
    const mine = { kind: row.kind, id: row.kind === 'agent' ? row.agent.name : row.id, team, board };
    if (row.kind !== 'team') {
      out.draggable = true;
      out.events.dragstart = (event) => { event.dataTransfer.setData(DRAG, JSON.stringify(mine)); event.dataTransfer.effectAllowed = 'move'; };
    }
    if (row.kind === 'team' || row.kind === 'board') {
      // The browser hides the data until the drop; while over, only the type says it is ours.
      out.events.dragover = (event) => { if (!event.dataTransfer?.types?.includes(DRAG)) return; event.preventDefault(); event.currentTarget.classList.add('cph-over'); };
      out.events.dragleave = (event) => event.currentTarget.classList.remove('cph-over');
      out.events.drop = async (event) => {
        event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.remove('cph-over');
        const move = whoMove(carried(event), row);
        if (!move) return;
        const result = await moves[move](carried(event), row);
        if (!result.ok) { surface.setState('failed', result.message || ''); return; }
        void read();
      };
    }
    if (Array.isArray(row.items)) out.items = wire(row.items, row.kind === 'team' ? row.id : team, row.kind === 'board' ? row.id : board);
    return out;
  });

  let shown = '';
  let reading = null;
  let last = null; // the reading last painted, for a switch of what stacks
  const paint = (data) => {
    last = data;
    const next = whoRows(data, {
      under,
      membersOf: (name) => membersOfTeam(name).map((member) => ({ name: member.name, title: agentTitle(member), lead: Boolean(member.team_lead) })),
    });
    const signature = JSON.stringify(next);
    if (signature === shown) return;
    shown = signature;
    phalanx.setItems(wire(next));
    filter.options('root', (data.roots || []).map((row) => ({ v: row.name, l: row.name })));
  };
  // Every folder stays offered while a filter is on: the first unfiltered reading's list holds.
  let roots = null;
  async function read() {
    reading?.abort();
    const controller = new AbortController(); reading = controller;
    // One request per chosen workspace (the route narrows by one root), joined; none is all.
    const results = await Promise.all((chosen.length ? chosen : ['']).map((root) =>
      request(`/api/collection${root ? `?root=${encodeURIComponent(root)}` : ''}`, { cache: 'no-store', signal: controller.signal })));
    if (controller.signal.aborted) return;
    const failed = results.find((result) => !result.ok);
    if (failed) { surface.setState('failed', failed.message || ''); return; }
    surface.setState();
    const data = results.length > 1 ? unionReadings(results.map((result) => result.data)) : results[0].data;
    if (!chosen.length || !roots) roots = data.roots || [];
    paint({ ...data, roots });
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
