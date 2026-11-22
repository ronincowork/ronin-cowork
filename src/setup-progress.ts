/**
 * SETUP'S TICKS (owner, 2026-11-22; KAN-768; samurai_lab/wip/FACTS.md): each step is ticked when
 * the office's facts say it is done, nothing recorded by Setup. One meaning each, the facts' own
 * (src/facts.ts):
 *   provider       a provider is Activated (integrations_authentications)
 *   register       registered with Ronin, by name or anonymously (machine)
 *   workspace      a Workspace has a folder (workspaces; machine-settings' needed says the same)
 *   installations  anything is installed: a Services part, or an installation switched on (machine)
 *   password       a password is set, or the owner's "Tailscale only, no password" setting is on (machine)
 * A self-hosted Setup is finished when provider and workspace are ticked; the other three are
 * optional (public/js/setup-progress.js SETUP_NEEDED). Every press is a real setting or nothing. Pushed as `setup-progress` whenever a fact
 * is written, so a change made anywhere ticks the step.
 */
import { activatedProviders, anythingInstalled, browserAccess, onFactWritten, registrationStatus } from './facts.js';
import { installedAnswer } from './routes/installed-api.js';
import { workspaceFolders } from './workspaces.js';
import { broadcastEvent } from './ws/events.js';

export const SETUP_STEP_IDS = ['provider', 'register', 'workspace', 'installations', 'password'] as const;
export type SetupStepId = typeof SETUP_STEP_IDS[number];

export interface SetupProgress {
  steps: Array<{ id: SetupStepId; number: number; answered: boolean }>;
  /** The tailnet address, '' when this machine is not on Tailscale: the password step offers Tailscale only by it. */
  tailscale: string;
  no_password: boolean;
}

export async function readSetupProgress(): Promise<SetupProgress> {
  const [providers, registered, folders, installed, access] = await Promise.all([
    activatedProviders(), registrationStatus(), workspaceFolders().catch(() => []), installedAnswer().catch(() => null), browserAccess(),
  ]);
  const ticked: Record<SetupStepId, boolean> = {
    provider: providers.length > 0,
    register: registered !== 'optional',
    workspace: folders.length > 0,
    installations: anythingInstalled(installed),
    password: access.password || access.no_password,
  };
  return {
    steps: SETUP_STEP_IDS.map((id, index) => ({ id, number: index + 1, answered: ticked[id] })),
    tailscale: access.tailscale,
    no_password: access.no_password,
  };
}

/** A fact written is the office changed: Setup's ticks go out again. */
export function startSetupProgress(): void {
  onFactWritten(() => { void readSetupProgress().then((progress) => broadcastEvent({ t: 'setup-progress', ...progress }), () => {}); });
}
