import { createTeamRoster, readTeamRoster, type TeamRoster } from './team-rosters.js';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mikaHomeDir } from './mika-runtime.js';

/** The launch path used by a Ronin helper. Mika is its first profile; she sits on Steerco. */
export const RONIN_HELPER_LOADER = 'ronin_helper' as const;
export const STEERCO_TEAM = 'steerco' as const;

export async function ensureSteercoTeam(): Promise<TeamRoster> {
  const existing = await readTeamRoster(STEERCO_TEAM, '');
  if (existing) return existing;
  try {
    return await createTeamRoster(STEERCO_TEAM, {
      title: 'Steerco',
      kind: 'open',
      objective: 'Place the work that reaches Ronin, and help operate Ronin.',
      wipeboard: 'steerco',
    });
  } catch (error) {
    const winner = await readTeamRoster(STEERCO_TEAM, '');
    if (winner) return winner;
    throw error;
  }
}

const welcomeReceipt = (): string => path.join(mikaHomeDir(), 'welcome-delivered.json');
export async function roninHelperWelcomeState(): Promise<{ state: 'pending' | 'delivered'; conversation: string } | null> {
  try {
    const row = JSON.parse(await readFile(welcomeReceipt(), 'utf8'));
    return row?.profile === 'mika' && (row.state === 'pending' || row.state === 'delivered')
      ? { state: row.state, conversation: String(row.conversation ?? '') } : null;
  } catch { return null; }
}
export async function recordRoninHelperWelcome(conversation: string, state: 'pending' | 'delivered'): Promise<void> {
  const target = welcomeReceipt();
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify({ schema: 1, profile: 'mika', conversation, state, at: new Date().toISOString() })}\n`, { mode: 0o600 });
  await rename(temp, target);
}
