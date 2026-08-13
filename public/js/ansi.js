/* part of the tmux-ronin client — see js/README.md */
/**
 * ANSI escape sequences — the one pattern the tape render needs.
 *
 * Its own module rather than a constant in `state.js`, because `state.js` reads
 * `window` at module top level (IS_TOUCH) and so cannot be imported outside a browser.
 * The tape's pure logic is unit-tested under node (tests/tape-fold.test.js), and a
 * regex that only loads inside a browser cannot be tested there.
 */

/** Any escape sequence — the tape view renders text, so anything else is dropped. */
export const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b[\]P][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b./g;
