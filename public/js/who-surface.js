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
 * Reading: until GET /api/collection lands (w8), each Team's boards come from its own team
 * reading (`boards`: the root above every item it or a member holds, plus Unfiled), and the
 * workspace filter reads the roster's folder and repos. `whoRows` is the pure mapping.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createPhalanx } from './phalanx.js';
import { membersOfTeam, subscribe, teamsFromState, UNASSIGNED } from './team-controller.js';
import { orderCoworkTeams } from './cowork-workbench-contract.js';
import { RONIN_HELPERS } from './roster-groups.js';
import { agentTitle } from './team-members.js';
import { boardStages, holderName } from './work-readings.js';
import { PROJECT_STAGES } from './team-kanban.js';
import { itemDetail, listDetail } from './work-details.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { t } from './lexicon.js';

export const WHO_TYPE = 'collection.who';
const STAGE_KEYS = PROJECT_STAGES.map((stage) => stage.key);
const stageName = (key) => PROJECT_STAGES.find((stage) => stage.key === key)?.label || key;
const el = (tag, cls = '') => { const out = document.createElement(tag); if (cls) out.className = cls; return out; };

/** A Team works in a folder when its roster names it, or one of its repos is that folder. */
export const teamInRoot = (team, root) => !root || team?.project_root === root || (team?.repos || []).includes(root);

/**
 * The stones: every Team (the no-team stone and Ronin Helpers last), narrowed to one
 * workspace folder when `root` is given. A Team's `items` are its boards; a board's `items`
 * are everything under it, by stage then by the reading's order. `boardsOf(name)` answers
 * the Team's board reading (roots included, each with its holder), or [] before it is read.
 */
export function whoRows({ teams = [], boardsOf = () => [], membersOf = () => [], root = '', labels = {} } = {}) {
  const rows = orderCoworkTeams(teams.filter((team) => team.holding || teamInRoot(team, root)), {
    helperName: RONIN_HELPERS,
    noTeam: root ? null : { name: UNASSIGNED, title: labels.noTeam || 'Ronin: no team', objective: '', holding: true },
  });
  return rows.map((team) => {
    const members = membersOf(team.name);
    const lead = members.find((member) => member.team_lead);
    const count = (labels.agents || ((n) => `${n} Agents`))(members.length);
    const boards = team.holding ? [] : boardStages(boardsOf(team.name), STAGE_KEYS).map((entry) => ({
      id: entry.board.id, kind: 'board', board: entry.board, className: 'who-board',
      label: entry.board.title,
      state: `${(labels.items || ((n) => `${n} items`))(entry.size)} · ${stageName(entry.board.stage)}`,
      items: entry.stages.flatMap((stage) => stage.items.map((item) => ({
        id: item.id, kind: 'item', item, className: 'who-item', label: item.title,
        state: [stageName(item.stage), holderName(item.holder) ? `@${holderName(item.holder)}` : ''].filter(Boolean).join(' · '),
      }))),
    }));
    return {
      id: team.name, kind: 'team', team, className: 'who-team',
      label: String(team.title ?? '').trim() || team.name,
      secondary: team.objective || '',
      state: lead ? `${count} · 人 ${agentTitle(lead)}` : count,
      ...(team.holding ? {} : { items: boards }),
    };
  });
}

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

  // The filter: all workspaces, or one folder.
  let root = '';
  const filter = ask([{ fields: [{ key: 'root', label: t('collection.workspace', 'Workspace'), blank: t('collection.all_workspaces', 'All workspaces'), options: [] }] }],
    { density: 'tight', onChange: ({ root: next }) => { root = String(next || ''); paint(); } });
  const readRoots = async () => {
    const read = await request('/api/project-roots', { cache: 'no-store' });
    if (!read.ok) return;
    filter.options('root', (read.data || []).filter((row) => !row.archived).map((row) => ({ v: row.name, l: row.title || row.name })));
  };

  const boards = new Map(); // team name -> its board reading
  const renderDetail = (item, host) => {
    if (item.kind === 'board') {
      const entry = item.board;
      listDetail(host, { title: entry.title, about: entry.objective || '', items: item.items.map((row) => row.item),
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
  const paint = () => {
    const next = whoRows({
      teams: teamsFromState(), membersOf: membersOfTeam, boardsOf: (name) => boards.get(name) || [], root,
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
  };
  let reading = null;
  const readBoards = async () => {
    reading?.abort();
    const controller = new AbortController(); reading = controller;
    const names = teamsFromState().filter((team) => !team.holding).map((team) => team.name);
    const results = await Promise.all(names.map((name) => request(`/api/work-items?team=${encodeURIComponent(name)}`, { cache: 'no-store', signal: controller.signal })));
    if (controller.signal.aborted) return;
    names.forEach((name, index) => { if (results[index].ok) boards.set(name, results[index].data.boards || []); });
    paint();
  };
  let entered = false;
  const stop = subscribe(() => { if (entered) { paint(); void readBoards(); } });
  return {
    el: surface.el,
    show: () => { entered = true; paint(); void readRoots(); void readBoards(); },
    leave: () => { entered = false; reading?.abort(); },
    destroy: () => { entered = false; reading?.abort(); stop?.(); filter.destroy?.(); phalanx.destroy(); },
  };
}
