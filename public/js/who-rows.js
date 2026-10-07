/* part of the ronin-cowork client — see js/README.md */
/** The Who door's stones from one collection reading (GET /api/collection). Pure: no DOM. */
import { RONIN_HELPERS } from './roster-groups.js';

/**
 * The stones from one collection reading ({ teams, boards }): every Team the reading names,
 * Ronin Helpers last. No stone for "no team": Unfiled is unfiled by definition and says
 * nothing (owner, 2026-10-03). A Team stone is its name, nothing else.
 * Under each Team, `under` chooses what stacks: 'boards' (a board's `items` are everything
 * under it, by stage) or 'agents' (`membersOf(name)` → [{ name, title, lead }], lead first).
 * A bar is its title and nothing else: the surface is a table of contents, saying where to
 * drill, not a reading of everything (owner, 2026-10-03).
 */
export function whoRows(reading = {}, { under = 'boards', membersOf = () => [] } = {}) {
  const teams = Array.isArray(reading.teams) ? reading.teams : [];
  const boards = Array.isArray(reading.boards) ? reading.boards : [];
  const boardStone = (board) => ({
    id: board.id, kind: 'board', board, className: 'who-board', label: board.title,
    items: board.stages.flatMap((row) => row.items.map((item) => ({ id: item.id, kind: 'item', item, className: 'who-item', label: item.title }))),
  });
  const agentStone = (team, member) => ({
    id: `agent:${team.name}:${member.name}`, kind: 'agent', agent: member, team: team.name, className: 'who-agent',
    label: member.lead ? `人 ${member.title || member.name}` : member.title || member.name,
  });
  const stone = (team, teamBoards) => ({
    id: team.name, kind: 'team', team, className: 'who-team',
    label: String(team.title ?? '').trim() || team.name,
    items: under === 'agents' ? membersOf(team.name).map((member) => agentStone(team, member)) : teamBoards.map(boardStone),
  });
  const ordinary = teams.filter((team) => team.name !== RONIN_HELPERS).sort((a, b) => a.name.localeCompare(b.name));
  const helper = teams.find((team) => team.name === RONIN_HELPERS);
  return [
    ...ordinary.map((team) => stone(team, boards.filter((board) => board.teams.includes(team.name)))),
    ...(helper ? [stone(helper, [])] : []),
  ];
}

/**
 * What dropping `moved` on `target` means on Who, or '' when nothing: a board onto another
 * Team gives it to that Team; the Add block onto a Team adds to it (owner, 2026-10-07). Those are the moves here (owner, 2026-10-04: Agents move on
 * the Team roster, items on What). `moved` is { kind, id, team }: what is dragged and the
 * Team it was under; `target` is a row ({ kind, id }).
 */
export function whoMove(moved, target) {
  if (!moved || !target) return '';
  if (target.kind === 'team' && moved.kind === 'board' && moved.team !== target.id) return 'assign';
  if (target.kind === 'team' && moved.kind === 'add') return 'add';
  return '';
}


/** The items an Agent holds, across the boards given: the board itself when it holds the root, and every item under any board it holds. */
export const itemsHeldBy = (boards = [], agent = '') => {
  const holder = `agent:${agent}`;
  return boards.flatMap((board) => [
    ...(board.holder === holder ? [board] : []),
    ...board.stages.flatMap((stage) => stage.items.filter((item) => item.holder === holder)),
  ]);
};

