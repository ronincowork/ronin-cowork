/**
 * SETUP'S TICKS (owner, 2026-11-22; KAN-768; samurai_lab/wip/FACTS.md): each step is ticked when
 * the office's facts say it is done, nothing recorded by Setup. One meaning each, the facts' own
 * (src/facts.ts). Every press is a real setting or nothing. Pushed as `setup-progress` whenever a
 * fact is written, so a change made anywhere ticks the step.
 *
 * HOSTED (owner, 2026-11-24; w926; samurai_lab/wip/SETUP_SWEEP.md §7): three steps, in any order,
 * none a gate, and nothing decides onboarding is over:
 *   harness    one of the person's own CLI harnesses is Activated, never Ronin's house models (integrations_authentications)
 *   workspace  a Workspace of theirs, not Ronin Lab, has an objective (workspaces)
 *   team       a Team has a live lead (teams_agents)
 *
 * SELF-HOSTED, five:
 *   provider       a provider is Activated (integrations_authentications)
 *   register       registered with Ronin, by name or anonymously (machine)
 *   workspace      a Workspace has a folder (workspaces)
 *   installations  anything is installed: a Services part, or an installation switched on (machine)
 *   password       a password is set, or the owner's "Tailscale only, no password" setting is on (machine)
 * Self-hosted Setup is finished when provider and workspace are ticked; the other three are optional.
 */
import { activatedProviders, anythingInstalled, browserAccess, describedWorkspaces, ledTeams, onFactWritten, ownHarnesses, registrationStatus } from './facts.js';
import { installedAnswer } from './routes/installed-api.js';
import { readOfficeRecord } from './office-record.js';
import { workspaceFolders } from './workspaces.js';
import { broadcastEvent } from './ws/events.js';

export const SETUP_STEP_IDS = ['provider', 'register', 'workspace', 'installations', 'password'] as const;
export const HOSTED_STEP_IDS = ['harness', 'workspace', 'team'] as const;
/** Self-hosted Setup is finished when these are ticked. */
export const SETUP_NEEDED = ['provider', 'workspace'] as const;
export type SetupStepId = typeof SETUP_STEP_IDS[number] | typeof HOSTED_STEP_IDS[number];

export interface SetupProgress {
  hosted: boolean;
  steps: Array<{ id: SetupStepId; number: number; answered: boolean }>;
  /** Self-hosted: provider and workspace ticked. Hosted: never asked (no gate), so false. */
  finished: boolean;
  /** The tailnet address, '' when this machine is not on Tailscale: the password step offers Tailscale only by it. */
  tailscale: string;
  no_password: boolean;
}

const numbered = (ticked: Record<string, boolean>, ids: readonly SetupStepId[]) =>
  ids.map((id, index) => ({ id, number: index + 1, answered: ticked[id] === true }));

/** Hosted Setup's three ticks, read from the facts. */
export async function hostedTicks(): Promise<Record<typeof HOSTED_STEP_IDS[number], boolean>> {
  const [harnesses, described, teams] = await Promise.all([ownHarnesses(), describedWorkspaces(), ledTeams()]);
  return { harness: harnesses.length > 0, workspace: described.length > 0, team: teams.length > 0 };
}

export async function readSetupProgress(): Promise<SetupProgress> {
  const office = await readOfficeRecord().catch(() => null);
  const access = await browserAccess();
  if (office?.hosting === 'office_unit') {
    return { hosted: true, steps: numbered(await hostedTicks(), HOSTED_STEP_IDS), finished: false, tailscale: access.tailscale, no_password: access.no_password };
  }
  const [providers, registered, folders, installed] = await Promise.all([
    activatedProviders(), registrationStatus(), workspaceFolders().catch(() => []), installedAnswer().catch(() => null),
  ]);
  const ticked: Record<string, boolean> = {
    provider: providers.length > 0,
    register: registered !== 'optional',
    workspace: folders.length > 0,
    installations: anythingInstalled(installed),
    password: access.password || access.no_password,
  };
  return {
    hosted: false,
    steps: numbered(ticked, SETUP_STEP_IDS),
    finished: SETUP_NEEDED.every((id) => ticked[id]),
    tailscale: access.tailscale,
    no_password: access.no_password,
  };
}

/** A fact written is the office changed: Setup's ticks go out again. */
export function startSetupProgress(): void {
  onFactWritten(() => { void readSetupProgress().then((progress) => broadcastEvent({ t: 'setup-progress', ...progress }), () => {}); });
}
