/**
 * SETUP'S TICKS (owner, 2026-11-22; KAN-768; samurai_lab/wip/FACTS.md): each step is ticked when
 * the office's facts say it is done, nothing recorded by Setup. One meaning each, the facts' own
 * (src/facts.ts). Every press is a real setting or nothing. Pushed as `setup-progress` whenever a
 * fact is written, so a change made anywhere ticks the step.
 *
 * ONE SETUP ON EVERY OFFICE (owner, 2026-11-24; w926; samurai_lab/wip/SETUP_SWEEP.md §7): three
 * steps, in any order, none a gate, and nothing decides onboarding is over:
 *   harness    one of the person's own CLI harnesses is Activated, never Ronin's house models (integrations_authentications)
 *   workspace  any Workspace is made, Ronin Lab included (workspaces; owner, 25 Nov)
 *   team       a Team has a live lead (teams_agents)
 * `tailscale` and `no_password` are for the Password card in Settings.
 *
 * CHANGED, BESIDE EACH TICK (owner, 25 Nov; w984): a write of a step's fact that changes its text
 * (the Harness one without its 'Last measured' line) turns that step's switch on. When the person
 * leaves a step whose switch is on, Irasshai gets one line naming the fact to read, and it goes off.
 * Off, a move tells her nothing. Held in memory, never recorded: a restart starts every switch off.
 */
import { browserAccess, madeWorkspaces, ledTeams, onFactWritten, ownHarnesses, readFact } from './facts.js';
import { enqueueMessage } from './message-queue.js';
import { broadcastEvent } from './ws/events.js';

/** Irasshai's session name, the same as the client's (public/js/setup-journey.js IRASSHAI). */
export const IRASSHAI = 'irasshai';

export const SETUP_STEP_IDS = ['harness', 'workspace', 'team'] as const;
export type SetupStepId = typeof SETUP_STEP_IDS[number];

export interface SetupProgress {
  steps: Array<{ id: SetupStepId; number: number; answered: boolean; changed: boolean }>;
  /** The tailnet address, '' when this machine is not on Tailscale: the Password card offers Tailscale only by it. */
  tailscale: string;
  no_password: boolean;
}

/** Setup's three ticks, read from the facts. A new office is one with none of them true. */
export async function setupTicks(): Promise<Record<SetupStepId, boolean>> {
  const [harnesses, made, teams] = await Promise.all([ownHarnesses(), madeWorkspaces(), ledTeams()]);
  return { harness: harnesses.length > 0, workspace: made.length > 0, team: teams.length > 0 };
}

export async function readSetupProgress(): Promise<SetupProgress> {
  const [ticked, access] = await Promise.all([setupTicks(), browserAccess()]);
  return {
    steps: SETUP_STEP_IDS.map((id, index) => ({ id, number: index + 1, answered: ticked[id], changed: changed.has(id) })),
    tailscale: access.tailscale,
    no_password: access.no_password,
  };
}

/** Each step's fact, and its name in her line. */
const STEP_FACT: Record<SetupStepId, { fact: string; label: string }> = {
  harness: { fact: 'integrations_authentications', label: 'Harness' },
  workspace: { fact: 'workspaces', label: 'Workspace' },
  team: { fact: 'teams_agents', label: 'Team' },
};
const changed = new Set<SetupStepId>();
const lastText = new Map<string, string>();
/** A fact's text as compared: the Harness fact's measuring stamp is not a change. */
const comparable = (text: string) => text.split('\n').filter((line) => !/Last measured /.test(line)).join('\n');

/** The first write seen since start is the baseline; after it, a different text turns the step on. */
async function noteWrite(name: string): Promise<boolean> {
  const step = SETUP_STEP_IDS.find((id) => STEP_FACT[id].fact === name);
  if (!step) return false;
  const now = comparable(await readFact(name));
  const before = lastText.get(name);
  lastText.set(name, now);
  if (before === undefined || before === now || changed.has(step)) return false;
  changed.add(step);
  return true;
}

/** The person left a step (selector, Next, Tour): with its switch on, she gets one line and it goes off. */
export async function leftSetupStep(left: string, to: string): Promise<boolean> {
  const step = SETUP_STEP_IDS.find((id) => id === left);
  if (!step || !changed.has(step)) return false;
  changed.delete(step);
  const { fact, label } = STEP_FACT[step];
  await enqueueMessage(IRASSHAI, `Moved to ${to}. ${label} changed while they were on it: office read ${fact}.`, 'house', 'Setup');
  broadcastEvent({ t: 'setup-progress', ...await readSetupProgress() });
  return true;
}

/** A fact written is the office changed: Setup's ticks (and changed switches) go out again. */
export function startSetupProgress(): void {
  for (const id of SETUP_STEP_IDS) void readFact(STEP_FACT[id].fact).then((text) => { if (!lastText.has(STEP_FACT[id].fact)) lastText.set(STEP_FACT[id].fact, comparable(text)); }, () => {});
  onFactWritten((name) => {
    void noteWrite(name).catch(() => false).then(() => readSetupProgress()).then((progress) => broadcastEvent({ t: 'setup-progress', ...progress }), () => {});
    // THE WORKSPACES MOVED (KAN-809): the fact is rebuilt from the workspaces store, whoever wrote it
    // (a page, Irasshai's workspace tool, an Agent), so every Workspaces list on every page reads again.
    if (name === 'workspaces') broadcastEvent({ t: 'workspaces-changed' });
  });
}
