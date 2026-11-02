/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TEAMS CARD'S ROWS — the pure mapping from the pushed rosters (each with its `board`
 * and `items`, teams-api.ts) and the Team projection's members to what the stones carry.
 * No DOM, no store: team-roster-surface.js paints, this says what.
 */

/** The Workspaces the rosters name, each once, for the Workspace question. */
export const workspaces = (rosters) => [...new Set(rosters.map((team) => team.workspace).filter(Boolean))].sort();

/**
 * One row per Team in the chosen workspaces (none chosen is all): its name and title,
 * Theme (the roster objective), State (the status of the Team's epic; no epic is blank),
 * the Agents on it (lead first, as `membersOf` orders them) and the titles of its items.
 */
export function teamsRows(rosters, membersOf, { roots = [] } = {}) {
  return rosters
    .filter((team) => !roots.length || roots.includes(team.workspace))
    .map((team) => ({
      id: team.name,
      label: team.title || team.name,
      theme: team.objective || '',
      state: team.board?.status || '',
      agents: membersOf(team.name).map((member) => member.name),
      items: (team.items || []).map((item) => item.title),
    }));
}
