/**
 * LAUNCH DESKS — the launch's side of the desk model (Track 3, Fable 3).
 *
 * A launch that will touch code on a reviewed repository is born AT A DESK: that repo's
 * private branch and worktree, opened before the CLI starts, with every desk of the
 * assignment named in the brief. This module decides WHETHER a launch gets desks, DERIVES
 * them through Track 1's registry, PREPARES them through Track 1's opener, and RENDERS the
 * concrete block the brief carries. It mutates no ref itself and holds no state.
 *
 * THREE HONEST ANSWERS, and no fourth:
 *   - `null`       this launch gets no desk — manual, plain terminal, a non-code role, a
 *                  direct or undeclared repository, or the switch is off. The brief says
 *                  nothing about desks, and nothing downstream pretends one exists.
 *   - assignment   desks derived and (at launch) opened; the session starts in `primary`.
 *   - a refusal    desks were wanted and could not be prepared. The launch does NOT fall
 *                  back to the shared checkout: a session told "you have a desk" that is
 *                  standing in `dev` is the exact failure the control surface exists for.
 *
 * THE SWITCH. `RONIN_DESKS=on` turns desk launches on; anything else is today's launch.
 * One flag, one place, read at launch: the rollout is one compatibility cutover (owner,
 * 2026-08-28), and until the tools, launch, prose and visible state all meet there, a
 * launch that opened desks would teach the new contract to a session with no `hand-in`
 * to perform it. Track 5's cutover checklist flips it; nothing else reads it.
 */
import type { Assignment, RepoDesk } from './desks/schema.js';
import { deriveAssignment } from './desks/registry.js';

/** The lifecycles that change code, and so get a desk: a plan, a review, a chat do not. */
export const DESK_LIFECYCLES: ReadonlySet<string> = new Set(['coding', 'debug']);

export const desksEnabled = (): boolean => (process.env.RONIN_DESKS ?? '').trim().toLowerCase() === 'on';

/** The launch box's one control, pre-answered: `own` forces a desk, `none` refuses one, absent = by lifecycle. */
export type DeskChoice = 'own' | 'none';

/**
 * Whether THIS launch wants desks at all. Manual launches never do (manual adds no
 * wording of ours, and a desk is wording); a plain terminal has no agent to brief.
 */
export function wantsDesk(input: { mode: 'manual' | 'assisted'; agent: boolean; lifecycle: string; desk?: DeskChoice }): boolean {
  if (!desksEnabled()) return false;
  if (input.mode === 'manual' || !input.agent) return false;
  if (input.desk === 'none') return false;
  if (input.desk === 'own') return true;
  return DESK_LIFECYCLES.has(input.lifecycle);
}

/**
 * Derive the assignment — pure, opens nothing. An assignment with no desks (every repo
 * direct or undeclared) is the same honest `null` as not wanting one.
 */
export async function resolveLaunchDesks(input: {
  session: string;
  team: string;
  project_root: string;
  mode: 'manual' | 'assisted';
  agent: boolean;
  lifecycle: string;
  desk?: DeskChoice;
}): Promise<Assignment | null> {
  if (!wantsDesk(input)) return null;
  const a = await deriveAssignment({ session: input.session, team: input.team, project_root: input.project_root });
  return a.desks.length ? a : null;
}

/** The desk the shell starts in. */
export function primaryDesk(a: Assignment): RepoDesk {
  return a.desks.find((d) => d.repo === a.primary) ?? a.desks[0]!;
}

/**
 * Open every desk of the assignment before the CLI is spawned — Track 1's seam
 * (`src/desks/desk.ts`, `resolveAssignmentDesks`): it derives the assignment again from the
 * same three facts and opens each desk (branch cut from the line, worktree mounted,
 * upstream set, record written). Imported at call time so this module compiles before it
 * exists; at launch its absence, or any desk that will not open, is a refusal with the
 * reason in it — never a silent fallback (RONIN_CONTROL_SURFACE.md §2: "launch may not
 * silently fall back to a funnel checkout"). The assignment handed back carries the
 * worktree paths as opened.
 */
export async function prepareLaunchDesks(a: Assignment): Promise<Assignment> {
  let opener: { resolveAssignmentDesks: (i: { session: string; team: string; project_root: string }) => Promise<Assignment> };
  try {
    opener = (await import('./desks/desk.js')) as typeof opener;
  } catch (e) {
    throw new Error(
      `Desk preparation is not available on this install (${(e as Error)?.message ?? e}). ` +
        'The launch was refused rather than started in the shared checkout: set RONIN_DESKS off, or install the desk tools.',
    );
  }
  let opened: Assignment;
  try {
    opened = await opener.resolveAssignmentDesks({ session: a.session, team: a.team, project_root: a.project_root });
  } catch (e) {
    throw new Error(`Could not open the desks for ${a.id} — ${(e as Error)?.message ?? e}. The launch was refused; nothing was started in a funnel checkout.`);
  }
  if (!opened.desks.length) {
    throw new Error(`The desks derived for ${a.id} could not be opened (none came back). The launch was refused; nothing was started in a funnel checkout.`);
  }
  return opened;
}

/**
 * The concrete block the brief carries — facts, not a Git lecture. Every desk, its path,
 * the line it hands in to, and the four words. The long reading (DESK_CONTRACT.md) rides
 * the `assignment` shelf level beside it.
 */
export function renderDeskBlock(a: Assignment): string {
  const width = Math.max(...a.desks.map((d) => d.repo.length));
  const rows = a.desks.map((d) => `  ${d.repo.padEnd(width)}  ${d.worktree}  → ${d.line}${d.repo === a.primary ? '  (you start here)' : ''}`);
  const n = a.desks.length;
  return [
    `Your assignment has ${n} desk${n === 1 ? '' : 's'}:`,
    ...rows,
    'Save changes in a desk. Commit preserves only that desk. `tejun-desk hand-in` publishes committed work to its team line; it is not `git push` and it runs no full BYOIN. The lead\'s team promotion runs full BYOIN and promotes the accepted team state to dev.',
  ].join('\n');
}
