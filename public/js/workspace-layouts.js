/* Named Workspace Kit compositions. These establish geometry only. */

const layout = (name, surfaces) => {
  const el = document.createElement('div');
  el.className = `wk-layout wk-${name}`;
  el.dataset.layout = name;
  for (const [surface, child] of Object.entries(surfaces)) {
    const host = document.createElement('div');
    host.className = `wk-layout-surface wk-layout-surface-${surface}`;
    host.dataset.surface = surface;
    if (child instanceof Node) host.append(child);
    el.append(host);
  }
  return el;
};

const createLeagueBoard = (cards = null) => layout('league-board', { cards });
const createSessionGrid = (tiles = null) => layout('session-grid', { tiles });
const createExplorerLayout = (rail = null, content = null) => layout('explorer-layout', { rail, content });
// Agent Configuration has configuration and resolved-profile preview surfaces. It does
// not imply or reserve a terminal Tile.
const createAgentConfigurationLayout = (configuration = null, preview = null) =>
  layout('agent-configuration-layout', { configuration, preview });
// Transaction is the durable home for preflight, progress, receipts, partial failure and
// retry. New Team decides their behavior; the Kit guarantees they are not transient toast.
const createNewTeamLayout = (definition = null, roster = null, transaction = null) =>
  layout('new-team-layout', { definition, roster, transaction });

function createWorkbenchLayout(terminalTile = null, kanban = null, channels = null) {
  const el = layout('workbench-layout', { terminalTile, kanban, channels });
  const clamp = (value) => Math.max(25, Math.min(60, Number(value) || 40));
  const setWidths = (left = 40, right = 40) => {
    const boundedLeft = clamp(left);
    const boundedRight = clamp(right);
    // Keep a usable Kanban between them; the last changed edge yields when necessary.
    const excess = Math.max(0, boundedLeft + boundedRight - 80);
    const resolvedRight = boundedRight - excess;
    el.style.setProperty('--wk-left', `${boundedLeft}%`);
    el.style.setProperty('--wk-right', `${resolvedRight}%`);
    return { left: boundedLeft, right: resolvedRight };
  };
  const setCollapsed = (surface, on) => {
    const target = el.querySelector(`[data-surface="${surface}"]`);
    if (!target) return;
    target.hidden = !!on;
    el.dataset.open = ['terminalTile', 'kanban', 'channels']
      .filter((name) => !el.querySelector(`[data-surface="${name}"]`)?.hidden)
      .join('-');
  };
  el.dataset.open = 'terminalTile-kanban-channels';
  setWidths();
  return { el, setCollapsed, setWidths };
}

export const WorkspaceLayouts = Object.freeze({
  createLeagueBoard,
  createSessionGrid,
  createExplorerLayout,
  createAgentConfigurationLayout,
  createNewTeamLayout,
  createWorkbenchLayout,
});
