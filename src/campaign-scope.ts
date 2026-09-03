/**
 * CAMPAIGN SCOPE — the compatibility read, the cross-Campaign refusals, and the migration
 * that stamps what existed before Campaigns did.
 *
 * `ronin-lab/wip/buildouts/CAMPAIGN_SCOPING.md` is the plan. `src/campaigns.ts` owns
 * the Campaign RECORD and is its only writer; this file owns the other half — the
 * `campaign_id` that every durable object and every live Agent points back with, and the
 * rules that keep those pointers honest.
 *
 * THE ONE COMPATIBILITY RULE, in one place. A record written before Campaigns has no id,
 * and every store reports that honestly as `''` rather than guessing. Resolving `''` onto
 * the Campaign the migration seeded happens HERE and nowhere else, through
 * `initialCampaignId()`. That is why the stores stayed dumb: a store that invented identity
 * it never stamped would be a second writer, and the fallback could then never be removed
 * with confidence because nobody could say where it had been applied.
 *
 * THE FALLBACK IS READ-ONLY AND TEMPORARY (the plan's migration step 8). Every WRITE emits
 * an explicit id; only reads fall back. When `migrateCampaignScope` has stamped everything
 * on a box, the fallback stops changing any answer, and removing it is leg 6.
 *
 * MEMBERSHIP AND ROOTS ARE REFUSED ACROSS CAMPAIGNS, never silently corrected. An Agent may
 * only join a Cowork in its own Campaign and may only serve a Project root in its own
 * Campaign. The plan's gate is "a cross-Campaign Agent move is refused" — refused, with the
 * two Campaigns named, because quietly rewriting the caller's intent is how a scoping bug
 * becomes invisible.
 */
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initialCampaign } from './campaigns.js';
import { listProjectRoots, upsertProjectRoot } from './project-roots.js';
import { listTeamRosters, teamRosterFile } from './team-rosters.js';
import { getCampaign, listSessions, setCampaign } from './tmux.js';

/**
 * The Campaign an unmarked record belongs to, or '' when this box has none yet.
 *
 * It is the earliest-created Campaign — provenance, not a settable default (the lead's
 * ruling, 2026-08-29) — and it is computed rather than stored so no surface can turn it
 * into a second mutable pointer.
 */
export async function initialCampaignId(): Promise<string> {
  return (await initialCampaign())?.id ?? '';
}

/**
 * The Campaign this running Cowork machine exposes.
 *
 * The current product has one machine Campaign. Keeping this name separate from
 * `initialCampaignId` makes the present rule explicit and leaves one seam for a future
 * owner-chosen switch; no screen may independently decide to show every Campaign.
 */
export async function machineCampaignId(): Promise<string> {
  return initialCampaignId();
}

/**
 * Resolve stored `campaign_id`s for READING: `''` becomes the initial Campaign, anything
 * already stamped is returned untouched. **The whole compatibility window is this function.**
 *
 * It hands back a resolver rather than resolving one value, because every caller is looking
 * at a list and asking for the initial Campaign once per row would be one store read per
 * Agent on a poll that already runs every two seconds.
 */
export async function campaignResolver(): Promise<(stored: string) => string> {
  const initial = await initialCampaignId();
  return (stored: string) => stored || initial;
}

/**
 * Does this record belong to the Campaign being asked about? The compatibility rule applied
 * to a filter: an unmarked record answers yes for the initial Campaign and no for any other.
 * An empty `wanted` means "every Campaign" and is how a caller says it is not filtering.
 */
export async function campaignFilter(wanted: readonly string[]): Promise<(stored: string) => boolean> {
  const resolve = await campaignResolver();
  if (!wanted.length) return () => true;
  const set = new Set(wanted);
  return (stored: string) => set.has(resolve(stored));
}

/* --------------------------------------------------------------- the refusals */

/**
 * An Agent may only be tagged onto a Cowork in its OWN Campaign.
 *
 * Both sides go through the compatibility resolver first, so during the window an unmarked
 * Agent and an unmarked roster are both the initial Campaign and the ordinary single-Campaign
 * install never sees a refusal. After migration every side is stamped and this is exact.
 */
export async function assertSameCampaignTeams(session: string, teams: readonly string[]): Promise<void> {
  if (!teams.length) return;
  const resolve = await campaignResolver();
  const mine = resolve(await getCampaign(session));
  if (!mine) return; // no Campaign exists on this box yet — nothing to enforce against
  const rosters = await listTeamRosters();
  const wrong: string[] = [];
  for (const team of teams) {
    const roster = rosters.find((r) => r.name === team);
    if (!roster) continue; // a tag-only team has no roster and therefore no Campaign
    const theirs = resolve(roster.campaign_id);
    if (theirs && theirs !== mine) wrong.push(`${team} (${theirs})`);
  }
  if (wrong.length) {
    throw new Error(
      `This Agent is in Campaign "${mine}" and cannot join ${wrong.join(', ')}. ` +
        'A Cowork and its Agents belong to one Campaign; moving between Campaigns is a ' +
        'deliberate migration, not a membership change.',
    );
  }
}

/** An Agent or a Cowork may only reference a Project root in its own Campaign. */
export async function assertSameCampaignRoot(campaign_id: string, root: string): Promise<void> {
  if (!root) return;
  const resolve = await campaignResolver();
  const mine = resolve(campaign_id);
  if (!mine) return;
  const found = (await listProjectRoots()).find((r) => r.name === root);
  if (!found) return; // an unknown root is the resolver's refusal to make, not this one's
  const theirs = resolve(found.campaign_id);
  if (theirs && theirs !== mine) {
    throw new Error(
      `Project root "${root}" belongs to Campaign "${theirs}", not "${mine}". ` +
        'A Cowork and an Agent may reference only a Project root in their own Campaign.',
    );
  }
}

/* --------------------------------------------------------------- the migration */

export interface CampaignScopeMigration {
  campaign_id: string;
  rosters: string[];
  roots: string[];
  sessions: string[];
}

/**
 * STAMP EVERYTHING UNMARKED INTO THE INITIAL CAMPAIGN — the plan's migration steps 3, 4
 * and 5, and the counterpart to `campaign-config.ts`'s steps 1 and 2.
 *
 * ADDITIVE AND IDEMPOTENT. It only ever writes an id onto a record that has none, so a
 * second run changes nothing and a record the owner has already placed is never moved. It
 * never guesses among several Campaigns: everything old belongs to the one Campaign that
 * existed before this feature, which is exactly what "earliest created_at" names.
 *
 * LIVE AGENTS ARE STAMPED WITHOUT RESTARTING, which is the point of holding the Campaign in
 * a tmux option: `set-option` on a running session, no kill, no relaunch, no lost scrollback.
 *
 * WIPEBOARDS ARE ABSENT FROM THIS LIST ON PURPOSE (step 6). Board addressing is solved by
 * allocating a free token when a Cowork is created, so no board directory has to move —
 * see `freeBoardToken` in src/team-rosters.ts. Nothing on disk needs migrating, which is
 * the strongest form of "without losing files or history".
 *
 * A ROSTER IS RE-HOMED, NOT JUST RE-WRITTEN. Its storage is nested by Campaign, so stamping
 * one means moving `team_rosters/<name>.md` to `team_rosters/<id>/<name>.md`. The move is
 * rename-based and skipped when the destination already exists, so a half-finished run
 * resumes rather than clobbering.
 */
export async function migrateCampaignScope(): Promise<CampaignScopeMigration> {
  const done: CampaignScopeMigration = { campaign_id: '', rosters: [], roots: [], sessions: [] };
  const campaign_id = await initialCampaignId();
  if (!campaign_id) return done; // nothing seeded yet; the next boot will have one
  done.campaign_id = campaign_id;

  for (const roster of await listTeamRosters()) {
    if (roster.campaign_id) continue;
    const from = teamRosterFile(roster.name, '');
    const to = teamRosterFile(roster.name, campaign_id);
    try {
      await mkdir(path.dirname(to), { recursive: true });
      // Already re-homed by an interrupted earlier run: leave the destination alone.
      if (await access(to).then(() => true, () => false)) continue;
      // The id line goes in beside the others so the file says what it is on its own. If
      // the heading does not match the shape, the text is written across unchanged and the
      // DIRECTORY still carries the identity — nesting is what makes the id authoritative.
      const raw = await readFile(from, 'utf8');
      await writeFile(to, raw.replace(/^(# .*\n\n)/m, `$1- **campaign_id:** ${campaign_id}\n`), 'utf8');
      await unlink(from);
      done.rosters.push(roster.name);
    } catch {
      // A roster that cannot be moved is left exactly where it is and read through the
      // compatibility fallback — a failed migration must never lose a record.
    }
  }

  for (const root of await listProjectRoots()) {
    if (root.campaign_id) continue;
    try {
      await upsertProjectRoot(root.name, { campaign_id });
      done.roots.push(root.name);
    } catch {
      /* left unmarked and read through the fallback */
    }
  }

  for (const session of await listSessions()) {
    if (session.campaign_id) continue;
    try {
      await setCampaign(session.name, campaign_id);
      done.sessions.push(session.name);
    } catch {
      /* a session that vanished mid-sweep is not an error */
    }
  }

  return done;
}
