import { createTeamRoster, readTeamRoster, type TeamRoster } from './team-rosters.js';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mikaHomeDir } from './mika-runtime.js';

/** Generic loader variation for house helpers. Mika is its first profile; Koshi is out of scope. */
export const RONIN_HELPER_LOADER = 'ronin_helper' as const;
export const RONIN_HELPERS_TEAM = 'RONIN_HELPERS' as const;

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
export async function roninHelperWelcomeDelivered(): Promise<boolean> {
  try { return JSON.parse(await readFile(welcomeReceipt(), 'utf8'))?.profile === 'mika'; } catch { return false; }
}
export async function recordRoninHelperWelcome(conversation: string): Promise<void> {
  const target = welcomeReceipt();
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify({ schema: 1, profile: 'mika', conversation, delivered_at: new Date().toISOString() })}\n`, { mode: 0o600 });
  await rename(temp, target);
}
