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
 *   - `null`       this launch gets no desk — plain terminal, a non-code role, or
 *                  a repository whose RONIN_REPO says direct or is absent. The brief says
 *                  nothing about desks, and nothing downstream pretends one exists.
 *   - assignment   desks derived and (at launch) opened; the session starts in `primary`.
 *   - a refusal    desks were wanted and could not be prepared. The launch does NOT fall
 *                  back to the shared checkout: a session told "you have a desk" that is
 *                  standing in `dev` is the exact failure the control surface exists for.
 *
 * THE ONE GATE IS THE REPOSITORY'S OWN FILE (owner, 2026-08-29). `RONIN_REPO` with
 * `desks=managed` gives a coding launch its desk, the contract, the actions and the
 * tools; `desks=none`, or no file, gives none of them. There is no install-wide switch:
 * two switches can only disagree. SETTEI's "new projects use desks?" is a default that
 * writes the file when a project root is added (src/desks/arrangement.ts), not a gate.
 */
import { arrangementOf, arrangementWorktreesInput } from './desks/arrangement.js';
import type { Assignment, RepoDesk } from './desks/schema.js';
import { deriveAssignment, writeAssignment } from './desks/registry.js';
import { resolveWorktrees } from './worktrees-resolution.js';

/** Compatibility input retained while launch forms stop sending the retired desk override. */
export type DeskChoice = 'own' | 'none';

/**
 * Derive the assignment — pure, opens nothing. An assignment with no desks (every repo
 * direct or undeclared) is the same honest `null` as not wanting one.
 */
export async function resolveLaunchDesks(input: {
  session: string;
  team: string;
  project_root: string;
  agent: boolean;
  control: boolean;
  desk?: DeskChoice;
}): Promise<Assignment | null> {
  if (!input.agent) return null;
  const assignment = await deriveAssignment({ session: input.session, team: input.team, project_root: input.project_root });
  const repositories = await Promise.all(assignment.desks.map(async (candidate) => {
    const arrangement = await arrangementOf(candidate.repo);
    return arrangementWorktreesInput(arrangement, {
      worktree: candidate.worktree,
      branch: candidate.branch,
      line: candidate.line,
    });
  }));
  const resolution = resolveWorktrees({
    capability: {
      worktrees: input.control ? 'enabled' : 'disabled',
      provenance: 'resolved_routines.ronin_worktrees',
    },
    repositories,
  });
  const managed = new Set(resolution.repositories.filter((repository) => repository.mode === 'managed').map((repository) => repository.repo));
  const desks = assignment.desks.filter((desk) => managed.has(desk.repo));
  if (!desks.length) return null;
  const primary = desks.some((desk) => desk.repo === assignment.project_root)
    ? assignment.project_root
    : desks[0]!.repo;
  return { ...assignment, primary, desks };
}

/** The desk the shell starts in. */
export function primaryDesk(a: Assignment): RepoDesk {
  return a.desks.find((d) => d.repo === a.primary) ?? a.desks[0]!;
}

/**
 * Open every resolved managed row before the CLI is spawned through Track 1's `openDesk`
 * operation (branch cut from the line, worktree mounted, upstream set, record written).
 * The candidate assignment is not re-derived here: doing so would reintroduce a second
 * applicability decision after `resolveWorktrees`. Imported at call time so this module
 * compiles before the desk implementation exists; at launch its absence, or any desk that
 * will not open, is a refusal with the reason in it — never a silent fallback. The
 * assignment handed back carries the worktree paths as opened.
 */
export async function prepareLaunchDesks(a: Assignment): Promise<Assignment> {
  let opener: { openDesk: (i: { repo: string; session: string; team: string; assignment?: string; branch?: string }) => Promise<RepoDesk> };
  try {
    opener = (await import('./desks/desk.js')) as typeof opener;
  } catch (e) {
    throw new Error(
      `Desk preparation is not available on this install (${(e as Error)?.message ?? e}). ` +
        'The launch was refused rather than started in the shared checkout: install the desk tools, or declare the repository direct (RONIN_REPO desks=none).',
    );
  }
  let opened: Assignment;
  try {
    const desks: RepoDesk[] = [];
    for (const candidate of a.desks) {
      const openedDesk = await opener.openDesk({
        repo: candidate.repo,
        session: a.session,
        team: a.team,
        assignment: a.id,
        branch: candidate.branch,
      });
      desks.push({
        repo: openedDesk.repo,
        root: openedDesk.root,
        branch: openedDesk.branch,
        worktree: openedDesk.worktree,
        line: openedDesk.line,
        mode: openedDesk.mode,
        session: openedDesk.session,
        team: openedDesk.team,
        assignment: openedDesk.assignment,
        state: openedDesk.state,
        opened_at: openedDesk.opened_at,
      });
    }
    opened = { ...a, desks };
    await writeAssignment(opened);
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
 * the line it hands in to, and one pointer. The contract itself is the Worktrees Routine's
 * page (routine/ronin_worktrees/WORKTREES.md), compiled into the README the brief names.
 */
export function renderDeskBlock(a: Assignment): string {
  const width = Math.max(...a.desks.map((d) => d.repo.length));
  const rows = a.desks.map((d) => `  ${d.repo.padEnd(width)}  ${d.worktree}  → ${d.line}${d.repo === a.primary ? '  (you start here)' : ''}`);
  const n = a.desks.length;
  return [
    `Your assignment has ${n} desk${n === 1 ? '' : 's'}:`,
    ...rows,
    'Work only in a desk; the desk contract is in your README.',
  ].join('\n');
}
