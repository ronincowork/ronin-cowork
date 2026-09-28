import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require_ = createRequire(import.meta.url);

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * What the installation WROTE DOWN. `.env` is where setup.sh records BIND and PORT
 * ("BIND, decided once and written down" — setup.sh), and it is the only place that knows
 * this box answers on loopback with Tailscale Serve in front. Reading the environment
 * alone made this helper guess a tailnet address the server had stopped binding, so every
 * UI script's no-argument default pointed at a closed door.
 */
function recorded(key) {
  try {
    const line = readFileSync(path.join(REPO, '.env'), 'utf8')
      .split('\n')
      .find((l) => new RegExp(`^\\s*${key}=`).test(l));
    return line?.split('=').slice(1).join('=').split('#')[0].trim() || '';
  } catch { return ''; }
}

export function defaultUrl(staging = false) {
  let host = process.env.BIND?.trim() || recorded('BIND');
  if (!host) {
    try {
      host = execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8' }).trim().split('\n')[0];
    } catch { /* tailscale not installed / not up */ }
  }
  const port = process.env.PORT || recorded('PORT') || 4810;
  return `http://${host || '127.0.0.1'}:${port}/${staging ? 'staging/' : ''}`;
}

export const HOST_TOOLS = `${homedir()}/.cache/ronin-host-tools`;

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
