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
  const userSignal = term?._core?.coreService?.onUserInput;
  if (typeof userSignal !== 'function') throw new Error('xterm user-input provenance is unavailable');
  const router = terminalInputRouter(user, protocol);
  userSignal.call(term._core.coreService, router.markUserInput);
  term.onData(router.route);
}

export const terminalOwnsTarget = (terminalElement, target) => !!terminalElement
  && !!target
  && (target === terminalElement || terminalElement.contains(target));
