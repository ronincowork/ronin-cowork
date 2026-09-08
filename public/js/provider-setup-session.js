/* part of the ronin-cowork client — see js/README.md */
/**
 * THE NATIVE SIGN-IN TILE — one mount, handed to every workbench environment that seats
 * the Model providers surface (Ronin Setup and Ronin Settings). The surface asks its
 * environment for `mountProviderSetupSession` (setup-provider-state.js
 * `mountProviderAttachment`); this is the one implementation of it: a headerless
 * full-mode terminal tile attached to the provider's temporary setup session, parked by
 * Done and Close, destroyed when the surface repaints or the view is torn down.
 */
import { WorkspaceKit } from './workspace-kit.js';

export function createProviderSetupSessionMount() {
  const hosts = new Set();
  return {
    mountProviderSetupSession: ({ host, provider, session, workspace, onClosed } = {}) => {
      if (!(host instanceof Node) || !session) return null;
      const terminal = WorkspaceKit.adapters.createTerminalTileHost({ mode: 'full' });
      terminal.el.dataset.provider = String(provider?.id || provider || '');
      terminal.el.dataset.workspace = String(workspace || 'workspace2');
      host.replaceChildren(terminal.el);
      terminal.mount(String(session));
      hosts.add(terminal);
      let closed = false;
      const destroy = () => {
        if (closed) return;
        closed = true;
        hosts.delete(terminal);
        terminal.destroy();
        onClosed?.();
      };
      return { el: terminal.el, fit: terminal.fit, park: terminal.park, destroy };
    },
    /** Tear down every tile still mounted — a view's destroy. */
    destroyAll: () => { for (const host of hosts) host.destroy(); hosts.clear(); },
  };
}
