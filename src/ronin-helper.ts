import { createTeamRoster, readTeamRoster, type TeamRoster } from './team-rosters.js';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mikaHomeDir } from './mika-runtime.js';

/** Generic loader variation for house helpers. Mika is its first profile; Koshi is out of scope. */
export const RONIN_HELPER_LOADER = 'ronin_helper' as const;
export const RONIN_HELPERS_TEAM = 'ronin_helpers' as const;

export async function ensureRoninHelpersTeam(): Promise<TeamRoster> {
  const existing = await readTeamRoster(RONIN_HELPERS_TEAM, '');
  if (existing) return existing;
  try {
    return await createTeamRoster(RONIN_HELPERS_TEAM, {
      title: 'Ronin Helpers',
      kind: 'open',
      objective: 'Reserved inspectable sessions that help operate Ronin itself.',
      wipeboard: 'ronin_helpers',
      routines: {},
    });
  } catch (error) {
    const winner = await readTeamRoster(RONIN_HELPERS_TEAM, '');
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
