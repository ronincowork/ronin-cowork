import { execFileSync } from 'node:child_process';
import { config } from '../machine-settings.js';

function tailnetNames(): string[] {
  try {
    const out = execFileSync('tailscale', ['status', '--json'], { encoding: 'utf8' });
    const self = JSON.parse(out)?.Self;
    const names: string[] = [];
    if (typeof self?.DNSName === 'string' && self.DNSName) names.push(self.DNSName.replace(/\.$/, ''));
    if (Array.isArray(self?.TailscaleIPs)) names.push(...self.TailscaleIPs.map(String));
    return names;
  } catch {
    return []; // no tailscale, not up, or shape changed — the other entries still stand
  }
}

const OURS: ReadonlySet<string> = new Set(
  [
    config.bind,
    'localhost',
    '127.0.0.1',
    '::1',
    ...tailnetNames(),
    ...(process.env.RONIN_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ]
    .filter(Boolean)
    .map((h) => h.toLowerCase()),
);

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
    try {
      if (new URL(`http://${host}`).hostname.toLowerCase() === from) return true;
    } catch {
    }
  }
  return false;
}

export function allowedOrigins(): string[] {
  return [...OURS];
}
