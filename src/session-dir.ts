import path from 'node:path';
import { exactPane } from './tmux.js';
import { tmux } from './tmux-client.js';
import { storeDir } from './resources.js';

export const RIREKI_DIR = storeDir('session');

const KEY_TTL_MS = 2_000;
const keyCache = new Map<string, { key: string; at: number }>();
const keyInFlight = new Map<string, Promise<string>>();

export function rememberSessionKey(name: string, key: string): void {
  keyCache.set(name, { key, at: Date.now() });
}

export async function sessionKey(name: string): Promise<string> {
  const hit = keyCache.get(name);
  if (hit && Date.now() - hit.at < KEY_TTL_MS) return hit.key;
  const flying = keyInFlight.get(name);
  if (flying) return flying;

  const ask = (async () => {
    try {
      const stdout = await tmux.run([
        'display-message',
        '-p',
        '-t',
        exactPane(name),
        '#{@ronin-key}\t#{session_created}',
      ]);
      const key = parseSessionKey(stdout, name);
      keyCache.set(name, { key, at: Date.now() });
      return key;
    } catch {
      return name; // no server: best effort, callers treat a missing dir as "no tape"
    } finally {
      keyInFlight.delete(name);
    }
  })();
  keyInFlight.set(name, ask);
  return ask;
}

export function parseSessionKey(stdout: string, name: string): string {
  const [stamped, created] = stdout.replace(/\r?\n+$/, '').split('\t');
  const born = (created ?? '').trim();
  return stamped?.trim() || (born ? `${name}-${born}` : name);
}

export function sessionDir(key: string): string {
  return path.join(RIREKI_DIR, key);
}
