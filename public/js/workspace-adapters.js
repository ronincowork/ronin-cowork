/* Extraction seams for rooms that still have compatibility Tile hosts on dev. */
import { createTerminalTileHost } from './terminal-tile-host.js';

function createRoomWorkspaceView(options = {}) {
  const el = options.el || document.createElement('main');
  el.classList.add('wk-room-view');
  let room = null;
  return {
    el,
    title: options.title,
    mount: (_host, context) => { room = options.build?.(el, () => !el.hidden, context) || null; },
    enter: (context) => room?.enter?.(context),
    leave: () => room?.leave?.(),
    destroy: () => {
      room?.destroy?.();
      room = null;
      el.replaceChildren();
    },
  };
}

const createCommonsWorkspaceView = (options = {}) => createRoomWorkspaceView(options);
const createConfigurationWorkspaceView = (options = {}) => createRoomWorkspaceView(options);

export const WorkspaceAdapters = Object.freeze({
  createRoomWorkspaceView,
  createCommonsWorkspaceView,
  createConfigurationWorkspaceView,
  createTerminalTileHost,
});
