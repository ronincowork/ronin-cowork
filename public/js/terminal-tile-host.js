/* One lifecycle owner for a Tile: make, mount, park, hide, fit, destroy. */
import { Tile } from './tile.js';
import { tiles } from './state.js';

export function createTerminalTileHost(options = {}) {
  const mode = options.mode === 'full' ? 'full' : 'reduced';
  const el = document.createElement('div');
  el.className = 'wk-terminal-host';
  el.dataset.mode = mode;
  let tile = null;
  let parked = true;

  const ensure = () => {
    if (tile) return tile;
    tile = new Tile({
      onMinimize: options.onMinimize,
      transcriptCache: options.transcriptCache,
    });
    tiles.push(tile);
    tile.el.classList.add('wk-hosted-tile');
    // Consumer actions ride the Tile's own head row, beside its buttons — this host is
    // the one seam that touches the Tile, so the consumer never reaches in itself.
    const head = tile.el.querySelector(':scope > .tile-head');
    for (const action of [...(Array.isArray(options.actions) ? options.actions : [])].reverse()) if (action instanceof Node && head) head.prepend(action);
    el.append(tile.el);
    return tile;
  };
  const mount = (session = '') => {
    const current = ensure();
    parked = false;
    el.hidden = false;
    if (session && current.session !== session && current.connect(session) === false) return false;
    current.doFit();
    return current;
  };
  const park = () => {
    if (tile?.session) tile.detach();
    parked = true;
    el.hidden = true;
    return true;
  };
  /** Conceal without touching the transport — the pool's warm-hidden state. Parking is
   *  the transport decision and stays its own verb. */
  const hide = () => { el.hidden = true; };
  const fit = () => { if (!parked) tile?.doFit(); };
  const destroy = () => {
    if (!tile) return;
    tile.unsubscribeHome?.();
    tile.docView?.dispose();
    tile.wire?.close();
    tile.transcriptView?.dispose();
    tile.ro?.disconnect();
    tile.composer?.dispose();
    tile.el.remove();
    const at = tiles.indexOf(tile);
    if (at >= 0) tiles.splice(at, 1);
    tile = null;
    parked = true;
  };
  return { el, mount, park, hide, destroy, fit, get parked() { return parked; } };
}
