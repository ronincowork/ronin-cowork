/**
 * SETUP'S TICKS (owner, 2026-11-22; KAN-768; samurai_lab/wip/FACTS.md): each step is ticked when
 * the office's facts say it is done, nothing recorded by Setup. One meaning each, the facts' own
 * (src/facts.ts). Every press is a real setting or nothing. Pushed as `setup-progress` whenever a
 * fact is written, so a change made anywhere ticks the step.
 *
 * ONE SETUP ON EVERY OFFICE (owner, 2026-11-24; w926; samurai_lab/wip/SETUP_SWEEP.md §7): three
 * steps, in any order, none a gate, and nothing decides onboarding is over:
 *   harness    one of the person's own CLI harnesses is Activated, never Ronin's house models (integrations_authentications)
 *   workspace  a Workspace of theirs, not Ronin Lab, has an objective (workspaces)
 *   team       a Team has a live lead (teams_agents)
 * `tailscale` and `no_password` are for the Password card in Settings.
 */
import { browserAccess, describedWorkspaces, ledTeams, onFactWritten, ownHarnesses } from './facts.js';
import { broadcastEvent } from './ws/events.js';

export const SETUP_STEP_IDS = ['harness', 'workspace', 'team'] as const;
export type SetupStepId = typeof SETUP_STEP_IDS[number];

export interface SetupProgress {
  steps: Array<{ id: SetupStepId; number: number; answered: boolean }>;
  /** The tailnet address, '' when this machine is not on Tailscale: the Password card offers Tailscale only by it. */
  tailscale: string;
  no_password: boolean;
}

/** Setup's three ticks, read from the facts. A new office is one with none of them true. */
export async function setupTicks(): Promise<Record<SetupStepId, boolean>> {
  const [harnesses, described, teams] = await Promise.all([ownHarnesses(), describedWorkspaces(), ledTeams()]);
  return { harness: harnesses.length > 0, workspace: described.length > 0, team: teams.length > 0 };
}

export async function readSetupProgress(): Promise<SetupProgress> {
  const [ticked, access] = await Promise.all([setupTicks(), browserAccess()]);
  return {
    steps: SETUP_STEP_IDS.map((id, index) => ({ id, number: index + 1, answered: ticked[id] })),
    tailscale: access.tailscale,
    no_password: access.no_password,
  };
}

/** A fact written is the office changed: Setup's ticks go out again. */
export function startSetupProgress(): void {
  onFactWritten((name) => {
    void readSetupProgress().then((progress) => broadcastEvent({ t: 'setup-progress', ...progress }), () => {});
    // THE WORKSPACES MOVED (KAN-809): the fact is rebuilt from the workspaces store, whoever wrote it
    // (a page, Irasshai's workspace tool, an Agent), so every Workspaces list on every page reads again.
    if (name === 'workspaces') broadcastEvent({ t: 'workspaces-changed' });
  });
}
