import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sessionDir } from './session-dir.js';
import type { SessionInfo } from './tmux.js';

export const MIKA_SESSION = 'mika_agent' as const;
export const MIKA_HOUSE_SEAT = 'mika' as const;

export type MikaIdentityState = 'absent' | 'verified' | 'collision';

export function isMikaBirthReceipt(value: unknown, key: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  return receipt.house_seat === MIKA_HOUSE_SEAT && receipt.session === MIKA_SESSION && receipt.conversation === key;
}

/** Name is only the lookup key. The tmux stamp and current key-bound 0600 receipt are authority. */
export async function verifyMikaIdentity(sessions: readonly SessionInfo[]): Promise<{ state: MikaIdentityState; session?: SessionInfo }> {
  const session = sessions.find((item) => item.name === MIKA_SESSION);
  if (!session) return { state: 'absent' };
  if (session.house_seat !== MIKA_HOUSE_SEAT || !session.key) return { state: 'collision', session };
  try {
    const receipt = JSON.parse(await readFile(path.join(sessionDir(session.key), 'birth-receipt.json'), 'utf8')) as Record<string, unknown>;
    if (!isMikaBirthReceipt(receipt, session.key)) {
      return { state: 'collision', session };
    }
    return { state: 'verified', session };
  } catch {
    return { state: 'collision', session };
  }
}
