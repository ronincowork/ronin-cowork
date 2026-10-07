/* part of the ronin-cowork client — see js/README.md */
/**
 * WHO: YOUR TEAMS — the Teams door of the collections workbench, built to the direction
 * doc (samurai_lab/wip/buildouts/COLLECTIONS_DIRECTION.md, owner 2026-10-04): find work,
 * add work, reassign work; detail, configuration and editing live on a workbench, never here.
 *
 *   Head          the door's name.
 *   Questions     Workspace (any number; none is all) and Under each Team: Boards or Agents.
 *   Stones        Teams, name only.
 *   Bars          boards or Agents under each Team, title only.
 *   Team pressed  the thin open beside the rail: objective, Agents with 人 on the lead, boards
 *                 by name, and one door, Launch, which opens the Team's tab.
 *   Bar pressed   expands in place to a short read in one format (the fork's `expand`):
 *                 an Agent — its role, what it is working on now, the items it holds;
 *                 a board — its objective and its items by title, each a press to its own
 *                 description, status and holder, and one door, Open, which places the
 *                 work-item surface beside this one; an item — description, status, holder.
 *   Drag          a board onto another Team. The Add block beside Under each Team, dragged onto
 *                 a Team stone, opens a partial overlay with the add form for what is showing
 *                 (a board, or an Agent) — owner, 2026-10-07.
 *
 * Reading: GET /api/collection (src/collection-read.ts), one request, every chosen workspace
 * as ?root=. `whoRows` (who-rows.js) is the pure mapping.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createCollectionPhalanx } from './collection-phalanx.js';
import { membersOfTeam, subscribe } from './team-controller.js';
import { subscribe as subscribeStore } from './store.js';
import { carryItem } from './team-drag.js';
import { itemsHeldBy, whoMove, whoRows } from './who-rows.js';
import { agentTitle, currentWorkStep } from './team-members.js';
import { stanceLabel } from './home.js';
import { holderName } from './work-readings.js';
import { stageLabel } from './team-kanban.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { openPartialOverlay } from './partial-overlay.js';
import { createAgentPicker } from './team-profile.js';
import { NEW_BOARD, draftItem } from './work-details.js';

export const WHO_TYPE = 'collection.who';
const el = (tag, cls = '', text = '') => { const out = document.createElement(tag); if (cls) out.className = cls; if (text) out.textContent = text; return out; };

/** `openTeam(name)` opens the Team's tab; `openBoard(board)` places the work-item surface beside this one. */
export function createWhoSurface({ openTeam = () => {}, openBoard = () => {}, onNewAgent = () => {} } = {}) {
  const { createSurface, createAction } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('collection.who', 'Who: Your Teams'), className: 'who-surface' });
  const DRAG = 'application/x-ronin-who'; // what a drag on this surface carries

  // The two questions: the workspaces (any number; none is all), and what stacks under each Team.
  let chosen = [];
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

  // THE ADD BLOCK (owner, 2026-10-07): beside Under each Team, drawn as the questions are.
  // Dragged onto a Team stone it opens a partial overlay over the stone with the add form for
  // what is showing: a board (the draft form, a new board held by the Team) or an Agent (the
  // picker the Team profile's plus uses).
  const add = el('div', 'who-add'); add.draggable = true;
  add.setAttribute('role', 'button'); add.tabIndex = 0;
  add.append(el('small', 'ask-label', t('collection.add_hint', 'Drag onto a Team')), el('b', 'ask-reading', t('collection.add', 'Add +')));
  add.addEventListener('dragstart', (event) => { event.dataTransfer.setData(DRAG, JSON.stringify({ kind: 'add' })); event.dataTransfer.effectAllowed = 'copy'; });
  const questions = el('div', 'who-questions'); questions.append(filter.el, add);
  const addTo = (team, anchor) => {
    const name = String(team.label || team.id);
    openPartialOverlay(surface.content, { anchor,
      title: under === 'agents' ? t('collection.add_agent_to', 'Add an Agent to {team}', { team: name }) : t('collection.add_board_to', 'New board for {team}', { team: name }),
      draw: (body, { lift }) => {
        if (under === 'agents') { body.append(createAgentPicker(team.id, { onNewAgent, failed: (result) => { if (!result.ok) surface.setState('failed', result.message || ''); }, joined: () => { lift(); void read(); } })); return; }
        draftItem(body, { heading: '', parent: NEW_BOARD, team: team.id, save: async (fields) => {
          const made = await request('/api/work-items', { method: 'POST', json: fields });
          if (!made.ok) return made.message;
          lift(); void read(); return '';
        } });
      } });
  };

  let rows = new Map(); // session name -> the store's home row (stance, work record)
  const nowOf = (name) => { const row = rows.get(name) || {}; const step = currentWorkStep(row.tegami); return [step.text, stanceLabel(row.stance)].filter(Boolean).join(' · '); };
  // `now` is read when a bar expands, never carried in the rows: a status tick must not repaint the stones.
  const members = (name) => membersOfTeam(name).map((member) => ({ name: member.name, title: agentTitle(member), lead: Boolean(member.team_lead) }));

  /* ---------- the thin open: a Team pressed ----------
   * Name with Launch beside it, the objective, then its Agents and its boards as the same
   * bars the stacks use: each a press to its read in place, the one format everywhere. */
  const bar = (row) => {
    const button = el('button', `sws-stone ${row.className || ''}`.trim()); button.type = 'button';
    button.dataset.cphDepth = '1'; button.dataset.swsId = String(row.id);
    button.append(el('b', 'sws-label', row.label));
    let open = null;
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      if (open) { open.remove(); open = null; button.setAttribute('aria-expanded', 'false'); return; }
      open = el('div', 'cph-expand'); expand(row, open); button.after(open); button.setAttribute('aria-expanded', 'true');
    });
    return button;
  };
  const list = (title, rows) => {
    const box = el('div', 'who-open-list');
    box.append(el('b', 'who-open-label', title));
    if (!rows.length) box.append(el('span', 'who-open-none', t('collection.none', 'None')));
    for (const row of rows) box.append(bar(row));
    return box;
  };
  const renderDetail = (item, host) => {
    if (item.kind !== 'team') return;
    const box = el('div', 'who-open');
    const head = el('div', 'who-open-head');
    const launch = createAction({ label: '', launch: true, size: 'compact', title: t('league.launch_team', 'Launch'), action: () => openTeam(item.id) });
    launch.el.setAttribute('aria-label', launch.el.title);
    head.append(el('h2', '', item.label), launch.el);
    box.append(head);
    if (item.team.objective) box.append(el('p', 'who-open-objective', item.team.objective));
    const teams = last?.teams || [];
    const boards = (last?.boards || []).filter((board) => board.teams.includes(item.id));
    const rowsFor = whoRows({ teams: teams.filter((team) => team.name === item.id), boards }, { under: 'agents', membersOf: members })[0]?.items || [];
    const boardRows = whoRows({ teams: teams.filter((team) => team.name === item.id), boards }, { under: 'boards', membersOf: members })[0]?.items || [];
    box.append(list(t('league.agents', 'Agents'), rowsFor), list(t('collection.boards', 'Boards'), boardRows));
    host.append(box);
  };

  /* ---------- a bar pressed: the short read in one format ---------- */
  const read1 = (host, lines) => { for (const [label, text] of lines) { if (!text) continue; const line = el('div', 'cph-expand-line'); line.append(el('b', '', label), document.createTextNode(text)); host.append(line); } };
  const expand = (item, host) => {
    if (item.kind === 'agent') {
      const member = { ...(members(item.team).find((row) => row.name === item.agent.name) || item.agent), now: nowOf(item.agent.name) };
      const held = itemsHeldBy(last?.boards?.filter((board) => board.teams.includes(item.team)) || [], member.name);
      read1(host, [
        [t('collection.role', 'Role'), member.lead ? t('league.team_lead', 'Team Lead') : t('league.agent', 'Agent')],
        [t('collection.now', 'Now'), member.now || t('collection.idle', 'nothing recorded')],
        [t('collection.holds', 'Holds'), held.map((row) => row.title).join(' · ') || t('collection.none', 'None')],
      ]);
      return;
    }
    if (item.kind === 'board') {
      read1(host, [[t('collection.objective', 'Objective'), item.board.objective || t('collection.none', 'None')]]);
      const items = item.board.stages.flatMap((stage) => stage.items);
      const titles = el('div', 'cph-expand-items');
      for (const row of items) {
        const line = el('button', 'cph-expand-item'); line.type = 'button'; line.textContent = row.title;
        line.draggable = true; line.addEventListener('dragstart', (event) => carryItem(event.dataTransfer, row)); // onto a tile: the item's reference
        line.setAttribute('aria-expanded', 'false');
        const more = el('div', 'cph-expand-more'); more.hidden = true;
        read1(more, [[t('collection.description', 'Description'), row.objective || t('collection.none', 'None')], [t('collection.status', 'Status'), stageLabel(row.stage)], [t('collection.holder', 'Holder'), holderName(row.holder) || t('collection.nobody', 'nobody')]]);
        line.addEventListener('click', () => { more.hidden = !more.hidden; line.setAttribute('aria-expanded', String(!more.hidden)); });
        titles.append(line, more);
      }
      if (!items.length) titles.append(el('span', 'who-open-none', t('collection.board_empty', 'Nothing under this board yet.')));
      host.append(titles);
      const open = createAction({ label: t('collection.open', 'Open'), size: 'compact', action: () => openBoard(item.board) });
      host.append(open.el);
      return;
    }
    if (item.kind === 'item') {
      read1(host, [[t('collection.description', 'Description'), item.item.objective || t('collection.none', 'None')], [t('collection.status', 'Status'), stageLabel(item.item.stage)], [t('collection.holder', 'Holder'), holderName(item.item.holder) || t('collection.nobody', 'nobody')]]);
    }
  };
  const phalanx = createCollectionPhalanx({ className: 'who-phalanx', items: [], renderDetail, expand });
  phalanx.mount(surface.content, { before: [questions] });

  /* ---------- the drags: a board onto another Team; the Add block onto a Team ---------- */
  const carried = (event) => { try { return JSON.parse(event.dataTransfer?.getData(DRAG) || 'null'); } catch { return null; } };
  const wire = (teams) => teams.map((team) => ({
    ...team,
    events: {
      dragover: (event) => { if (!event.dataTransfer?.types?.includes(DRAG)) return; event.preventDefault(); event.currentTarget.classList.add('cph-over'); },
      dragleave: (event) => event.currentTarget.classList.remove('cph-over'),
      drop: async (event) => {
        event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.remove('cph-over');
        const moved = carried(event);
        const move = whoMove(moved, team);
        if (move === 'add') { addTo(team, event.currentTarget); return; }
        if (move !== 'assign') return;
        const result = await request(`/api/work-items/${encodeURIComponent(moved.id)}/assign`, { method: 'POST', json: { team: team.id } });
        if (!result.ok) { surface.setState('failed', result.message || ''); return; }
        void read();
      },
    },
    items: (team.items || []).map((row) => row.kind !== 'board' ? row : {
      ...row, draggable: true,
      events: { dragstart: (event) => { event.dataTransfer.setData(DRAG, JSON.stringify({ kind: 'board', id: row.id, team: team.id })); carryItem(event.dataTransfer, { id: row.id, title: row.label }); event.dataTransfer.effectAllowed = 'move'; } },
    }),
  }));

  /* ---------- the reading ---------- */
  let shown = '';
  let reading = null;
  let last = null; // the reading last painted
  let roots = null; // every folder, from the first unfiltered reading, so a filter keeps offering them all
  const paint = (data) => {
    last = data;
    const next = whoRows(data, { under, membersOf: members });
    const signature = JSON.stringify(next);
    if (signature === shown) return;
    shown = signature;
    phalanx.setItems(wire(next));
    filter.options('root', (data.roots || []).map((row) => ({ v: row.name, l: row.name })));
  };
  async function read() {
    reading?.abort();
    const controller = new AbortController(); reading = controller;
    const query = chosen.map((root) => `root=${encodeURIComponent(root)}`).join('&');
    const result = await request(`/api/collection${query ? `?${query}` : ''}`, { cache: 'no-store', signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!result.ok) { surface.setState('failed', result.message || ''); return; }
    surface.setState();
    if (!chosen.length || !roots) roots = result.data.roots || [];
    paint({ ...result.data, roots });
  }
  let entered = false;
  const stopTeams = subscribe(() => { if (entered) void read(); });
  const stopRows = subscribeStore('home', (list) => { rows = new Map((list || []).map((row) => [row.name, row])); });
  return {
    el: surface.el,
    show: () => { entered = true; void read(); },
    leave: () => { entered = false; reading?.abort(); },
    destroy: () => { entered = false; reading?.abort(); stopTeams?.(); stopRows?.(); filter.destroy?.(); phalanx.destroy(); },
  };
}
