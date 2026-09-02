/**
 * Where the running UI is, and how to get a browser — for the checks that need both.
 *
 * Two browser gates need this (`smoke-ui`, `check-tips`) and for a while they each had their
 * own copy. The copies disagreed: one derived the host the way the server actually binds,
 * the other assumed loopback, and `check-tips` failed against a server that was up and
 * answering the whole time. Two implementations of one fact drift the moment either is
 * touched, which is the argument for this file existing rather than a shared constant.
 */
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const require_ = createRequire(import.meta.url);

/**
 * No hardcoded host: this derives the same ladder the server itself binds with
 * (`src/config.ts`) — BIND env, else the tailnet IP, else loopback. `staging` points the
 * derived URL at the /staging/ copy.
 */
export function defaultUrl(staging = false) {
  let host = process.env.BIND?.trim();
  if (!host) {
    try {
      host = execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).trim().split('\n')[0];
    } catch { /* tailscale not installed / not up */ }
  }
  return `http://${host || '127.0.0.1'}:${process.env.PORT || 3006}/${staging ? 'staging/' : ''}`;
}

export const HOST_TOOLS = `${homedir()}/.cache/ronin-host-tools`;

/**
 * Playwright is a HOST TOOL, not a dependency (`docs/host-tools.md`), so a public install
 * never carries a browser. Resolution is that document's three steps in its order — env
 * override, normal resolution, then ONE documented machine-local location.
 *
 * Returns null when there is no browser, which every caller must treat as a SKIP rather
 * than a failure: the free build has to verify on a box that never installed one.
 */
export async function loadPlaywright() {
  const candidates = [
    () => (process.env.RONIN_PLAYWRIGHT_PATH ? import(process.env.RONIN_PLAYWRIGHT_PATH) : null),
    () => require_('playwright'),
    () => createRequire(`${HOST_TOOLS}/`)('playwright'),
  ];
  for (const load of candidates) {
    try {
      const m = await load();
      if (m?.chromium) return m;
    } catch { /* try the next */ }
  }
  return null;
}

/**
 * axe-core rides the same host-tools rule as playwright: a machine-local accessibility
 * engine, never a shipped dependency. Returns the injectable source, or null — and null
 * is a SKIP with a note, not a failure, for the same reason as loadPlaywright.
 */
export async function loadAxeSource() {
  const { readFileSync } = await import('node:fs');
  const candidates = [
    process.env.RONIN_AXE_PATH,
    `${HOST_TOOLS}/node_modules/axe-core/axe.min.js`,
  ];
  for (const p of candidates) {
    try {
      if (p) return readFileSync(p, 'utf8');
    } catch { /* try the next */ }
  }
  return null;
}
