/* part of the ronin-cowork client — see js/README.md */
/** The Who door's stones from one collection reading (GET /api/collection). Pure: no DOM. */
import { holderName } from './work-readings.js';
import { RONIN_HELPERS } from './roster-groups.js';

/**
 * The stones from one collection reading ({ teams, boards }): every Team the reading names,
 * Ronin Helpers last, and, with no folder filter, the no-team stone carrying the Unfiled
 * board. A Team's `items` are its boards; a board's `items` are everything under it, by
 * stage. `leadOf(name)` answers the lead's shown name; the reading's session name otherwise.
 */
export function whoRows(reading = {}, { root = '', noTeamId = ' unassigned', leadOf = () => '', stageName = (key) => key, labels = {} } = {}) {
  const teams = Array.isArray(reading.teams) ? reading.teams : [];
  const boards = Array.isArray(reading.boards) ? reading.boards : [];
  const agents = labels.agents || ((n) => `${n} Agents`);
  const items = labels.items || ((n) => `${n} items`);
  const boardStone = (board) => ({
    id: board.id, kind: 'board', board, className: 'who-board', label: board.title,
    state: `${items(board.stages.reduce((n, row) => n + row.items.length, 0))} · ${stageName(board.stage)}`,
    items: board.stages.flatMap((row) => row.items.map((item) => ({
      id: item.id, kind: 'item', item, className: 'who-item', label: item.title,
      state: [stageName(item.stage), holderName(item.holder) ? `@${holderName(item.holder)}` : ''].filter(Boolean).join(' · '),
    }))),
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

