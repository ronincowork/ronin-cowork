/* One lifecycle owner for the existing Tile transport/render machinery. */
import { Tile } from './tile.js';

export function createTerminalTileHost(options = {}) {
  const mode = options.mode === 'full' ? 'full' : 'reduced';
  const el = document.createElement('div');
  el.className = 'wk-terminal-host';
  el.dataset.mode = mode;
  let tile = null;
  let parked = true;

  const ensure = () => {
    if (tile) return tile;
    tile = new Tile(Number(options.index) || 0);
    tile.el.classList.add('wk-hosted-tile');
    // Consumer actions ride the Tile's own head row, beside its buttons — this host is
    // the one seam that touches the Tile, so the consumer never reaches in itself.
    const head = tile.el.querySelector(':scope > .tile-head');
    for (const action of Array.isArray(options.actions) ? options.actions : []) if (action instanceof Node && head) head.append(action);
    el.append(tile.el);
    return tile;
  };
  const mount = (session = '') => {
    const current = ensure();
    parked = false;
    el.hidden = false;
    if (session && current.session !== session) current.connect(session);
    current.doFit();
    return current;
  };
  const switchSession = (session) => {
    if (!session) return park();
    const current = mount();
    if (current.session !== session) current.connect(session);
    return current;
  };
  // Parking is the transport decision only: the Tile stays where it is, empty, the way
  // an unconnected cell of the Sessions grid does. Concealing is hide()'s, never park()'s.
  const park = () => {
    if (tile?.session) tile.detach();
    parked = true;
    return true;
  };
  /** Conceal without touching the transport — the pool's warm-hidden state. Parking is
   *  the transport decision and stays its own verb. */
  const hide = () => { el.hidden = true; };
  const fit = () => { if (!parked) tile?.doFit(); };
  const send = (text) => !parked && !!tile?.sendRaw(String(text));
  const destroy = () => {
    if (!tile) return;
    tile.wire?.close();
    tile.ro?.disconnect();
    if (tile.kakiTimer) clearInterval(tile.kakiTimer);
    tile.el.remove();
    tile = null;
    parked = true;
  };
  return { el, mount, switchSession, park, hide, destroy, fit, send, get session() { return tile?.session || ''; }, get parked() { return parked; } };
}
