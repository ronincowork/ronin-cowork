import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const require_ = createRequire(import.meta.url);

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
