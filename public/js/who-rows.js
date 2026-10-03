/* part of the ronin-cowork client — see js/README.md */
/** The Who door's stones from one collection reading (GET /api/collection). Pure: no DOM. */
import { RONIN_HELPERS } from './roster-groups.js';

/**
 * The stones from one collection reading ({ teams, boards }): every Team the reading names,
 * Ronin Helpers last, and, with no folder filter, the no-team stone carrying the Unfiled
 * board. A Team's `items` are its boards; a board's `items` are everything under it, by
 * stage. A board or an item is its title and nothing else: the surface is a table of
 * contents, saying where to drill, not a reading of everything (owner, 2026-10-03).
 * `leadOf(name)` answers the lead's shown name; the reading's session name otherwise.
 */
export function whoRows(reading = {}, { root = '', noTeamId = ' unassigned', leadOf = () => '', labels = {} } = {}) {
  const teams = Array.isArray(reading.teams) ? reading.teams : [];
  const boards = Array.isArray(reading.boards) ? reading.boards : [];
  const agents = labels.agents || ((n) => `${n} Agents`);
  const boardStone = (board) => ({
    id: board.id, kind: 'board', board, className: 'who-board', label: board.title,
    items: board.stages.flatMap((row) => row.items.map((item) => ({ id: item.id, kind: 'item', item, className: 'who-item', label: item.title }))),
  });
  const stone = (team, teamBoards) => {
    const lead = leadOf(team.name) || team.lead || '';
    const count = agents(team.agents.length);
    return {
      id: team.name, kind: 'team', team, className: 'who-team',
      label: String(team.title ?? '').trim() || team.name,
      secondary: team.objective || '',
      state: lead ? `${count} · 人 ${lead}` : count,
      items: teamBoards.map(boardStone),
    };
  };
  const ordinary = teams.filter((team) => team.name !== RONIN_HELPERS).sort((a, b) => a.name.localeCompare(b.name));
  const helper = teams.find((team) => team.name === RONIN_HELPERS);
  const unfiled = boards.filter((board) => !board.teams.length);
  const noTeam = root ? [] : [stone({ name: noTeamId, title: labels.noTeam || 'Ronin: no team', objective: '', agents: [], lead: '' }, unfiled)];
  return [
    ...ordinary.map((team) => stone(team, boards.filter((board) => board.teams.includes(team.name)))),
    ...noTeam,
    ...(helper ? [stone(helper, [])] : []),
  ];
}

