/* xterm emits user input and terminal-generated protocol replies through the same public
 * onData event. Its core emits onUserInput immediately before onData only for genuine
 * keyboard, paste, mouse and composition input. Keep that provenance; bytes cannot tell us. */
export function terminalInputRouter(user, protocol) {
  let userOwned = false;
  return {
    markUserInput: () => { userOwned = true; },
    route: (data) => {
      const send = userOwned ? user : protocol;
      userOwned = false;
      send(data);
    },
  };
}

export function wireTerminalInput(term, user, protocol) {
  // tmux's DA queries are answered synchronously beside its PTY. Keep xterm from
  // producing a duplicate whose browser parse timer could fire after tmux's deadline.
  term.parser?.registerCsiHandler({ final: 'c' }, () => true);
  term.parser?.registerCsiHandler({ prefix: '>', final: 'c' }, () => true);

  const userSignal = term?._core?.coreService?.onUserInput;
  // onUserInput is not public in the pinned xterm. Retain its stronger provenance when
  // present, but an internal rename must not prevent every terminal tile from opening.
  if (typeof userSignal !== 'function') {
    term.onData(user);
    return;
  }
  const router = terminalInputRouter(user, protocol);
  userSignal.call(term._core.coreService, router.markUserInput);
  term.onData(router.route);
}

export const terminalOwnsTarget = (terminalElement, target) => !!terminalElement
  && !!target
  && (target === terminalElement || terminalElement.contains(target));

/**
 * ^C. Typed into a pane it ends the Agent and takes the tmux session with it, with no
 * confirmation and no way back, so the tile holds it and raises the retire sheet
 * instead — see `Tile`'s onUserData. Interrupting is still reachable, deliberately by
 * a route that cannot be a slip: the `^C` button on the keys row and a pad key bound
 * to `int` both hand this byte straight to `sendRaw`.
 */
export const INTERRUPT = '\x03';
