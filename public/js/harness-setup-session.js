/* part of the ronin-cowork client — see js/README.md */
/**
 * THE NATIVE SIGN-IN TILE: one mount, handed to every workbench environment that shows a
 * harness's terminal sign-in (the one harness panel, harnesses-surface.js, in Setup and Settings). The
 * panel asks its environment for `mountHarnessSetupSession`; this is the one implementation of it: a headerless
 * full-mode terminal tile attached to the provider's temporary setup session, parked by
 * Done and Close, destroyed when the surface repaints or the view is torn down.
 */
import { WorkspaceKit } from './workspace-kit.js';

export function createHarnessSetupSessionMount() {
  const hosts = new Set();
  return {
    mountHarnessSetupSession: ({ host, provider, session, workspace, onClosed } = {}) => {
      if (!(host instanceof Node) || !session) return null;
      const terminal = WorkspaceKit.adapters.createTerminalTileHost({ mode: 'full' });
      terminal.el.dataset.provider = String(provider?.id || provider || '');
      terminal.el.dataset.workspace = String(workspace || 'workspace2');
      host.replaceChildren(terminal.el);
      const tile = terminal.mount(String(session));
      hosts.add(terminal);
      let closed = false;
      const destroy = () => {
        if (closed) return;
        closed = true;
        hosts.delete(terminal);
        terminal.destroy();
        onClosed?.();
      };
      // What the screen shows, read only: the panel's Copy code and Copy link follow it.
      const screenText = () => (tile && tile.term?.screenText?.()) || '';
      const onOutput = (fn) => (tile && tile.term?.onOutput?.(fn)) || (() => {});
      /** A key the screen offers, pressed for the person (the panel's Go Back). */
      const send = (keys) => Boolean(tile?.sendRaw?.(keys));
      return { el: terminal.el, fit: terminal.fit, park: terminal.park, destroy, screenText, onOutput, send };
    },
    /** Tear down every tile still mounted — a view's destroy. */
    destroyAll: () => { for (const host of hosts) host.destroy(); hosts.clear(); },
  };
}
