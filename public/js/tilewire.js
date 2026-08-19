/* part of the ronin-cowork client — see js/README.md */
/**
 * TILEWIRE — the tile's socket, and nothing else.
 *
 * One WebSocket to `/pty`, its reconnect timer, and the protocol split: JSON control
 * messages one way, raw pane bytes the other. It sits BESIDE the two views rather than
 * inside either, because both are fed by it and neither should own it — locked rides
 * the attach mirror, unlocked rides the recorded stream, and the URL is the only place
 * that difference exists on this side.
 *
 * THE DROP RULE — the one deliberate behaviour change of the split.
 *
 * `send()` used to be `if (ws && ws.readyState === 1) ws.send(...)`: a keystroke typed
 * into a locked tile while the socket was down went nowhere, silently. A phone is
 * mid-reconnect all the time, so this was a real loss of typed input with nothing on
 * screen to say so — the composer had a `noconn` guard, the xterm path did not.
 *
 * Input now reports whether it was delivered, and the tile SHOWS the drop. It is
 * dropped, never queued: replaying keystrokes into a live shell after a reconnect is
 * send-keys roulette — the parked line lands in whatever has focus a minute later,
 * which is how you delete the wrong thing. Loud loss beats silent loss beats a
 * surprise. Housekeeping messages (resize, reach-upward) stay quiet: nobody typed
 * them, and a flash per resize while disconnected is noise, not news.
 */

export class TileWire {
  /**
   * @param {{onStatus: (state: string) => void, onControl: (msg: object) => void,
   *          onBytes: (bytes: Uint8Array) => void, onDrop: () => void,
   *          reopen: (session: string) => void}} hooks
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.ws = null;
    this.retry = null;
    this.wantOpen = false;
    this.session = null;
  }

  connected() {
    return !!this.ws && this.ws.readyState === 1;
  }

  /** Housekeeping messages. Quiet: returns whether it went, tells nobody if it didn't. */
  send(msg) {
    if (!this.connected()) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  /**
   * A keystroke, a parcel, an injected wheel escape — anything a person caused.
   * Reports the drop so the tile can show it.
   */
  sendInput(d) {
    if (this.send({ t: 'i', d })) return true;
    this.hooks.onDrop();
    return false;
  }

  clearRetry() {
    if (!this.retry) return;
    clearTimeout(this.retry);
    this.retry = null;
  }

  /** Drop the socket without giving up the tile's intent to be connected. */
  drop() {
    if (!this.ws) return;
    try {
      this.ws.close();
    } catch (_) {}
    this.ws = null;
  }

  /** Stop wanting a connection at all. */
  close() {
    this.wantOpen = false;
    this.session = null;
    this.clearRetry();
    this.drop();
  }

  /**
   * Open the socket for one session.
   *
   * Locked rides the attach mirror (the original pipeline, untouched). Unlocked rides
   * the recorded stream: seed = recent history, then the live pane output.
   */
  open({ session, locked, cols, rows, tapeAt }) {
    this.wantOpen = true;
    this.session = session;
    this.clearRetry();
    this.drop();

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url =
      `${proto}://${location.host}/pty?session=${encodeURIComponent(session)}` +
      `&cols=${cols}&rows=${rows}` +
      (locked ? '' : '&mode=stream' + (tapeAt ? `&seg=${tapeAt.seg}&off=${tapeAt.off}` : ''));
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.hooks.onStatus('on');
      this.hooks.onOpen();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch (_) {
          return;
        }
        this.hooks.onControl(m);
        return;
      }
      this.hooks.onBytes(new Uint8Array(ev.data));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.hooks.onStatus('off');
      if (this.wantOpen && this.session === session) {
        this.retry = setTimeout(() => {
          if (this.wantOpen && this.session === session) this.hooks.reopen(session);
        }, 2000);
      }
    };
    ws.onerror = () => this.hooks.onStatus('off');
  }
}
