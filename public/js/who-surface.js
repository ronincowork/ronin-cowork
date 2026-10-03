/* part of the ronin-cowork client — see js/README.md */
/**
 * WHO — the Teams door of the collections workbench (owner, 2026-10-03). One stone per Team
 * in the shared Phalanx; under each stone, in chart rest, one column per board the Team works
 * on with that board's items stacked beneath. The header's one-line/two-line toggle folds the
 * boards away (stones only) or shows them. The top area holds one filter: the workspace
 * folder, so a Team working in two folders is found under either, and a second question,
 * what stacks under each Team: its boards or its Agents (an Agent pressed is its profile).
 *
 * Drawn with the collection phalanx (collection-phalanx.js), the phalanx forked for the
 * doors. Drill is the phalanx's own, in place: press a Team and its boards and items are the rail
 * with the Team's profile beside; press a board and the detail is the board's items; press
 * an item and the detail is the item. Escape or the back stone is the one way back.
 *
 * Reading: GET /api/collection (src/collection-read.ts), one request, the folder filter sent
 * as ?root=. The no-team stone carries the Unfiled board, the board no Team holds; both say
 * the same thing from either side. `whoRows` (who-rows.js) is the pure mapping.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createCollectionPhalanx } from './collection-phalanx.js';
import { membersOfTeam, subscribe, UNASSIGNED } from './team-controller.js';
import { whoRows } from './who-rows.js';
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

  // Two questions: the workspace (all, or one folder; the reading is asked again with it),
  // and what stacks under each Team, its boards or its Agents.
  let root = '';
  let under = 'boards';
  const filter = ask([{ fields: [
    { key: 'root', label: t('collection.workspace', 'Workspace'), blank: t('collection.all_workspaces', 'All workspaces'), options: [] },
    { key: 'under', label: t('collection.under_each_team', 'Under each Team'), options: [
      { v: 'boards', l: t('collection.under_boards', 'Boards') }, { v: 'agents', l: t('collection.under_agents', 'Agents') },
    ] },
  ] }], { value: { root: '', under }, density: 'tight', onChange: ({ root: nextRoot, under: nextUnder }) => {
    const rootMoved = String(nextRoot || '') !== root;
    root = String(nextRoot || ''); under = nextUnder === 'agents' ? 'agents' : 'boards';
    if (rootMoved) void read(); else if (last) paint(last);
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

  let shown = '';
  let reading = null;
  let last = null; // the reading last painted, for a switch of what stacks
  const paint = (data) => {
    last = data;
    const next = whoRows(data, {
      root, under, noTeamId: UNASSIGNED,
      leadOf: (name) => { const lead = membersOfTeam(name).find((member) => member.team_lead); return lead ? agentTitle(lead) : ''; },
      membersOf: (name) => membersOfTeam(name).map((member) => ({ name: member.name, title: agentTitle(member), lead: Boolean(member.team_lead) })),
      labels: { noTeam: t('league.ronin', 'Ronin: no team') },
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
