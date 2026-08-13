import { execFileSync } from 'node:child_process';
import { config } from '../config.js';

/**
 * ORIGIN — is this websocket coming from Ronin's own page, or from someone else's?
 *
 * WHY THIS EXISTS EVEN WITH AUTH ON, AND EVEN ON A TAILNET. A browser attaches its
 * ambient credentials — Basic auth, cookies — to a cross-origin WEBSOCKET without
 * asking anyone, and the same-origin policy does not stop the connection being opened.
 * So any page the owner happens to visit could open `/pty` against their own Ronin and
 * type into a live shell, with the browser helpfully authenticating it. `checkAuth`
 * cannot see this: the credentials really are the owner's. Only the Origin can tell a
 * page Ronin served from a page it did not.
 *
 * THE RULE: a MISSING Origin is allowed, a FOREIGN one is refused.
 *
 * Missing is allowed because this is browser-only defence and every non-browser client
 * is legitimate and Origin-less — the smoke test, `wscat`, a script in a pane. Refusing
 * those would break the gate and every tool on the box while stopping no attack: an
 * attacker with a socket library sets any Origin they like, or none. This check exists
 * for the one client that CANNOT lie about its Origin, which is exactly the browser.
 *
 * WHAT COUNTS AS OURS is a set of HOSTNAMES, not full origins — scheme and port are
 * deliberately ignored. The threat is a foreign SITE; `https://<tailnet>:8443` and
 * `http://<bind>:3006` are the same deployment reached two ways, and anyone who can
 * serve a page from Ronin's own hostname already owns the box. Matching hostnames
 * keeps every legitimate path working, which matters more here than a distinction that
 * buys nothing: this is the class of change that took the UI down in August.
 */

/** This machine's tailnet identity, or nothing if Tailscale is absent. Same "ask the machine" resolve as config.ts. */
function tailnetNames(): string[] {
  try {
    const out = execFileSync('tailscale', ['status', '--json'], { encoding: 'utf8' });
    const self = JSON.parse(out)?.Self;
    const names: string[] = [];
    // MagicDNS reports a FQDN with a trailing dot; a browser's Origin never has one.
    if (typeof self?.DNSName === 'string' && self.DNSName) names.push(self.DNSName.replace(/\.$/, ''));
    if (Array.isArray(self?.TailscaleIPs)) names.push(...self.TailscaleIPs.map(String));
    return names;
  } catch {
    return []; // no tailscale, not up, or shape changed — the other entries still stand
  }
}

/**
 * Resolved ONCE at boot, not per request: it shells out to tailscale, and an upgrade
 * is not the place to pay that. A machine that joins a tailnet mid-run is a restart.
 */
const OURS: ReadonlySet<string> = new Set(
  [
    config.bind,
    'localhost',
    '127.0.0.1',
    '::1',
    ...tailnetNames(),
    // The escape hatch for a deployment we cannot resolve: any other reverse proxy,
    // which the README explicitly allows. Comma-separated hostnames. Documented in
    // .env.example beside BIND, because a proxy is the moment somebody needs it.
    ...(process.env.RONIN_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ]
    .filter(Boolean)
    .map((h) => h.toLowerCase()),
);

/**
 * `true` if this upgrade may proceed.
 *
 * `host` is the request's own Host header, and it is a full member of the allowlist
 * rather than a fallback: a reverse proxy that preserves Host — the near-universal
 * default — makes Origin and Host agree for every legitimate page, whatever address
 * the proxy forwards to. That arm is what keeps an unknown proxy working; the resolved
 * tailnet name is what keeps THIS box working even if its proxy rewrites Host. Neither
 * arm is trusted alone to decide a refusal, and together they cannot refuse a real page.
 */
export function originAllowed(origin?: string, host?: string): boolean {
  if (!origin) return true; // non-browser client — see the note above
  let from: string;
  try {
    from = new URL(origin).hostname.toLowerCase();
  } catch {
    return false; // a browser always sends a parseable Origin; this is not one
  }
  if (OURS.has(from)) return true;
  if (host) {
    // Host carries a port and may be bracketed IPv6; URL() normalises both away.
    try {
      if (new URL(`http://${host}`).hostname.toLowerCase() === from) return true;
    } catch {
      /* malformed Host — fall through to the refusal */
    }
  }
  return false;
}

/** For the boot log: what this Ronin will accept a browser socket from. */
export function allowedOrigins(): string[] {
  return [...OURS];
}
