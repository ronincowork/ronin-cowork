/* part of the ronin-cowork client — see js/README.md */
/** The Who door's stones from one collection reading (GET /api/collection). Pure: no DOM. */
import { RONIN_HELPERS } from './roster-groups.js';

/**
 * The stones from one collection reading ({ teams, boards }): every Team the reading names,
 * Ronin Helpers last. No stone for "no team": Unfiled is unfiled by definition and says
 * nothing (owner, 2026-10-03). A Team stone is its name and its lead, nothing else.
 * Under each Team, `under` chooses what stacks: 'boards' (a board's `items` are everything
 * under it, by stage) or 'agents' (`membersOf(name)` → [{ name, title, lead }], lead first).
 * A bar is its title and nothing else: the surface is a table of contents, saying where to
 * drill, not a reading of everything (owner, 2026-10-03).
 */
export function whoRows(reading = {}, { under = 'boards', leadOf = () => '', membersOf = () => [] } = {}) {
  const teams = Array.isArray(reading.teams) ? reading.teams : [];
  const boards = Array.isArray(reading.boards) ? reading.boards : [];
  const boardStone = (board) => ({
    id: board.id, kind: 'board', board, className: 'who-board', label: board.title,
    items: board.stages.flatMap((row) => row.items.map((item) => ({ id: item.id, kind: 'item', item, className: 'who-item', label: item.title }))),
  });
  const agentStone = (member) => ({
    id: `agent:${member.name}`, kind: 'agent', agent: member, className: 'who-agent',
    label: member.lead ? `人 ${member.title || member.name}` : member.title || member.name,
  });
  const stone = (team, teamBoards) => {
    const lead = leadOf(team.name) || team.lead || '';
    return {
      id: team.name, kind: 'team', team, className: 'who-team',
      label: String(team.title ?? '').trim() || team.name,
      state: lead ? `人 ${lead}` : '',
      items: under === 'agents' ? membersOf(team.name).map(agentStone) : teamBoards.map(boardStone),
    };
  };
  const ordinary = teams.filter((team) => team.name !== RONIN_HELPERS).sort((a, b) => a.name.localeCompare(b.name));
  const helper = teams.find((team) => team.name === RONIN_HELPERS);
  return [
    ...ordinary.map((team) => stone(team, boards.filter((board) => board.teams.includes(team.name)))),
    ...(helper ? [stone(helper, [])] : []),
  ];
}

/**
 * What dropping `moved` on `target` means, or '' when nothing: an item onto another board
 * reparents it there; a board onto another Team gives it to that Team; an Agent onto another
 * Team moves the Agent there (owner, 2026-10-03: the items and Agents are drag-droppable).
 * `moved` is { kind, id, team, board }: the kind and id of what is dragged and the Team or
 * board it was under; `target` is a row ({ kind, id }).
 */
export function whoMove(moved, target) {
  if (!moved || !target) return '';
  if (target.kind === 'team' && moved.kind === 'board' && moved.team !== target.id) return 'assign';
  if (target.kind === 'team' && moved.kind === 'agent' && moved.team !== target.id) return 'join';
  if (target.kind === 'board' && moved.kind === 'item' && moved.board !== target.id) return 'reparent';
  return '';
}
