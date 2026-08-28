/* League cowork space: the Team workbench geometry with Teams in the selector. */
import { createNewTeamView } from './new-team.js';
import { membersOfTeam, refreshTeams, teamByName, teamsFromState } from './team-controller.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';

const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
export function createLeagueWorkspaceView() {
  const { createCard, createMetadata, createSurface } = WorkspaceKit.primitives;
  const root = node('main', 'tw-view league-workspace'); root.id = 'league-workspace';
  let context = null, selected = 'workspace1', dragged = null;
  const blank = () => { const s = createSurface({ label: t('team.workspace_blank', 'Workspace'), className: 'tw-blank' }); s.content.append(node('p', 'tw-blank-word', t('team.workspace_blank', 'Workspace'))); return s; };
  const blanks = { workspace1: blank(), workspace2: blank() }, cells = {}, columns = {};
  for (const id of Object.keys(blanks)) {
    const c = node('div', 'tw-cell league-cell'), column = node('div', 'tw-column');
    c.dataset.workspace = id; c.append(blanks[id].el); column.append(c); cells[id] = c; columns[id] = column;
  }
  const select = (id) => { selected = id; for (const [name, cell] of Object.entries(cells)) cell.firstElementChild?.classList.toggle('tw-selected', name === id); };
  const place = (surface, id = selected) => {
    if (!surface?.el || !cells[id]) return;
    const from = Object.keys(cells).find((name) => cells[name].firstElementChild === surface.el);
    if (from && from !== id) cells[from].replaceChildren(blanks[from].el);
    cells[id].replaceChildren(surface.el); surface.enter?.(); select(id);
  };
  for (const [id, cell] of Object.entries(cells)) {
    cell.addEventListener('pointerdown', () => select(id), true);
    cell.addEventListener('dragover', (event) => { if (!dragged) return; event.preventDefault(); cell.dataset.dropReady = 'true'; });
    cell.addEventListener('dragleave', () => { delete cell.dataset.dropReady; });
    cell.addEventListener('drop', (event) => { if (!dragged) return; event.preventDefault(); delete cell.dataset.dropReady; const surface = dragged; dragged = null; place(surface, id); });
  }
  const selector = createSurface({ label: t('league.title', 'League'), className: 'tw-kanban league-selector' });
  const head = node('div', 'tw-roster-head'), count = node('span', 'tw-roster-count'), cards = node('div', 'tw-cards');
  head.append(node('span', 'tw-roster-title', t('league.title', 'League')), count); selector.el.prepend(head); selector.content.append(cards);
  const commons = createSurface({ label: t('league.commons', 'League commons') });
  commons.content.append(node('h2', 'league-surface-title', t('league.commons', 'League commons')));
  const listing = createSurface({ label: t('league.view', 'League view') });
  const board = WorkspaceKit.layouts.createLeagueBoard(), listingCards = board.querySelector('[data-surface="cards"]'); listing.content.append(board);
  const newTeam = createNewTeamView(WorkspaceKit), newTeamSurface = { el: newTeam.el, enter: () => newTeam.enter(context) };
  const teamSurface = (name) => {
    const surface = createSurface({ label: name, className: 'league-team-edit' }), team = teamByName(name);
    surface.content.append(node('h2', 'league-surface-title', name), createMetadata({ className: 'league-team-metadata', rows: [
      [t('team.team_role', 'Team role'), team.team_role], [t('team.objective', 'Objective'), team.objective],
      [t('stats.sessions', 'Sessions'), String(membersOfTeam(name).length)], [t('team.project_root', 'Project root'), team.project_root],
    ] }).el); return { el: surface.el };
  };
  const selectorCard = (heading, surface, options = {}) => {
    const card = createCard({ heading, summary: options.summary || '', metadata: options.metadata || [], variant: options.variant, action: () => place(surface) });
    card.el.draggable = true; card.el.addEventListener('dragstart', (event) => { dragged = surface; event.dataTransfer.setData('text/plain', heading); event.dataTransfer.effectAllowed = 'move'; });
    card.el.addEventListener('dragend', () => { dragged = null; }); return card.el;
  };
  const paint = () => {
    const teams = teamsFromState().filter((team) => !team.holding); count.textContent = teams.length ? String(teams.length) : '';
    cards.replaceChildren(selectorCard(t('league.commons', 'League commons'), { el: commons.el }), selectorCard(t('league.view', 'League view'), { el: listing.el }),
      ...teams.map((team) => selectorCard(team.name, teamSurface(team.name), { summary: team.objective, metadata: [t('league.session_count', '{n} sessions', { n: membersOfTeam(team.name).length })] })),
      selectorCard(t('new_team.title', 'New Team'), newTeamSurface, { variant: 'dotted' }));
    listingCards.replaceChildren(...teams.map((team) => selectorCard(team.name, teamSurface(team.name), { summary: team.objective })));
  };
  const declaration = { slots: [{ name: 'workspace1', label: 'Workspace 1', width: 40 }, { name: 'roster', label: 'League', width: 20, min: 6, compact: 176 }, { name: 'workspace2', label: 'Workspace 2', width: 40 }] };
  const workbench = WorkspaceKit.layouts.createWorkbenchLayout({ declaration, surfaces: { workspace1: columns.workspace1, roster: selector.el, workspace2: columns.workspace2 } });
  root.append(workbench.host);
  return { el: root, arrangement: workbench.arrangement, title: () => t('league.open_workspace', 'League workspace'), enter: async (next) => { context = next; await refreshTeams(); paint(); select('workspace1'); } };
}
