import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * THE ONE REPO-ROOT ANCHOR. A module that computes a repo path from its own location
 * breaks the day the module moves — the KYOKAI mv proved it four times over
 * (`hotwords.ts` opened `src/services/ronin_catalogs/`, koshi and the bench shelled
 * `src/services/bin/`, counting wrote stats into `src/`). tsc cannot see the class;
 * only a request can. So: every file that needs the install tree resolves it from
 * HERE, and only this file — which does not move — may look at its own location.
 */
/** @service — services resolve the install root through cowork's one answer. */
export const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * First IPv4 address Tailscale reports for this node, or 127.0.0.1 as a fallback.
 *
 * Exported since 2026-08-17 for SETTEI's record, which has to tell the owner the one
 * distinction that matters about exposure: bound to your tailnet with no password is a
 * closed door, and bound wider with no password is a live shell on an open port. Both
 * are "not loopback", so nothing short of this comparison can separate them — and
 * `assertBindIsSafe` below already relies on exactly the same test.
 */
export function tailnetIp(): string {
  try {
    const out = execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).trim();
    const ip = out.split('\n')[0]?.trim();
    if (ip) return ip;
  } catch {
    // tailscale not installed / not up — fall through
  }
  return '127.0.0.1';
}

export const config = {
  port: Number(process.env.PORT ?? 3006),
  /** If BIND is unset we lock to the tailnet IP so the server is not publicly reachable. */
  bind: process.env.BIND?.trim() || tailnetIp(),
  user: process.env.GRID_USER ?? '',
  pass: process.env.GRID_PASS ?? '',
  /** latest | largest | smallest | manual */
  windowSize: process.env.TMUX_WINDOW_SIZE?.trim() || 'latest',
  /**
   * Mouse mode on browser viewer sessions. 'off' (default — owner, 2026-09-01:
   * "we never see this again") because 'on' set a trap on every locked tile: a
   * wheel tick dropped the SHARED pane into tmux copy-mode — freezing the live
   * output for the agent and every other viewer — and the next typed t or f then
   * opened tmux's "(jump to forward)" prompt, eating keystrokes until two
   * cancels. The cost of 'off': trackpad/wheel over a locked tile no longer
   * scrolls tmux scrollback (xterm.js hands the wheel to the app instead); the
   * tape view still scrolls natively. Set TMUX_MOUSE=on to take the old trade.
   */
  mouse: process.env.TMUX_MOUSE?.trim() || 'off',
  /** Internal grouped "viewer" sessions get this prefix; hidden from the picker. */
  viewerPrefix: 'grid_',
  /**
   * Working directory for sessions created from the picker. Without this, a new
   * session inherits ronin's own cwd (the repo root). Override with RONIN_NEW_SESSION_DIR
   * in .env — the default is $HOME, the only directory every ronin_machine has.
   */
  newSessionDir: process.env.RONIN_NEW_SESSION_DIR?.trim() || `${process.env.HOME}`,
  /**
   * Desktop push-to-talk dictation proxies audio to a host Whisper service
   * (podcast-scribe's POST /transcribe). Empty string disables the feature.
   */
  scribeUrl: process.env.SCRIBE_URL?.trim() ?? 'http://127.0.0.1:3004',
} as const;

export const authEnabled = Boolean(config.user && config.pass);

/** Loopback, in the spellings a person actually writes in .env. */
function isLoopback(addr: string): boolean {
  const a = addr.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return a === '127.0.0.1' || a === '::1' || a === 'localhost' || a.startsWith('127.');
}

/**
 * THE DOOR MAY NOT STAND OPEN BY ACCIDENT.
 *
 * `.env.example` has warned since forever that `BIND=0.0.0.0` "can expose a live shell
 * to the internet" — and nothing enforced it, which is the same as not saying it. The
 * default is already safe (unset BIND resolves to the tailnet IP, or loopback when
 * Tailscale is absent); what was missing is a floor under the EXPLICIT override.
 *
 * So: with auth off, the bind must be loopback or this machine's own tailnet address.
 * Tailscale-first is untouched — the tailnet IP is non-loopback and stays allowed, and
 * that is the whole normal deployment. What dies is `0.0.0.0` / `::` / a routable
 * public address with no credentials behind it.
 *
 * REFUSE, not warn. A warning in a log nobody reads is exactly how the .env.example
 * note already failed once; the point of a floor is that you cannot step through it.
 * Turning auth on lifts the restriction entirely — this checks for an UNGUARDED door,
 * not a wide one, and an operator who sets GRID_USER/GRID_PASS has answered the question.
 */
export function assertBindIsSafe(passwordAuth = false): void {
  // Either kind of credential answers the question this floor asks. The password
  // half cannot be read here (config.ts must stay dependency-light), so the caller
  // passes the fact in — src/index.ts hands it `passwordAuthEnabled()`.
  if (authEnabled || passwordAuth) return;
  if (isLoopback(config.bind)) return;
  // Compare against the address Tailscale reports rather than "is it private": a LAN
  // address is not a tailnet, and every box on the café wifi shares one.
  if (config.bind.trim() === tailnetIp()) return;
  throw new Error(
    `refusing to start: BIND=${config.bind} is neither loopback nor this machine's tailnet address, and auth is off — ` +
      `that serves live shells to anything that can reach the port. ` +
      `Set GRID_USER and GRID_PASS in .env to turn auth on, or bind 127.0.0.1 (behind your own proxy) or your tailnet IP.`,
  );
}
