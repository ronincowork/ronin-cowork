/**
 * PREFLIGHT — the dry run, and the only honest way to ask "would this launch?".
 *
 * A Team is built by creating a roster and then raising one or many sessions onto it.
 * Every one of those steps can refuse, and the refusals live in three different places:
 * the cascade (`resolveLaunchProfile`), the resolver (`resolveForm`), and the box itself
 * (a taken name, a full session max). Before this route the only way to discover any of
 * them was to launch and find out — which on a multi-seat Team means learning that seat
 * four is illegal only after seats one through three exist.
 *
 * SO IT RUNS THE REAL RESOLVER. Not a copy of its rules, not a browser-side re-derivation
 * of the cascade: `resolveForm` itself, the same function `POST /api/launch` calls, so a
 * preflight that passes and a launch that fails is a bug rather than a difference of
 * opinion. New Team owns this route and Agent Configuration consumes its answer; neither
 * builds a second resolver (`wip/buildouts/NEW_TEAM.md` § Preflight).
 *
 * WHAT IT CREATES: no session, and no roster. What it DOES touch, said plainly rather
 * than glossed: `resolveForm` calls `ensureShelf`, which mkdirs one shelf directory per
 * project_root. That is idempotent, it is what the next real launch would do anyway, and
 * suppressing it would mean changing a shared file for a side effect nobody asked to
 * remove. "Creates no session and no roster" is the claim; "touches nothing" is not.
 *
 * EVERY REFUSAL COMES BACK AS DATA, never as a thrown 500. A caller must be able to draw
 * a message under the field that caused it, so each carries a `code`, the `field` it
 * belongs to, and the server's own words — the cascade names the FILE it refused from,
 * and paraphrasing that away would throw out the only part that helps. A non-2xx from
 * this route means the preflight itself broke, NOT that the draft is bad.
 *
 * SEAT-LOCAL AND BATCH-LEVEL ARE SEPARATED, because different surfaces show them:
 * per-seat reasons belong under the seat's own controls (Agent Configuration), while a
 * name collision or a full box belongs to the Team surface (New Team).
 *
 * IT IS ADVISORY AND NEVER AUTHORITATIVE. The server re-checks everything at launch; a
 * stale preflight must not be able to skip a check. That is the same reason `reference`
 * is re-validated inside `/api/launch` — the world moves between the dry run and the wet
 * one.
 */
import type express from 'express';
import { isValidName, listSessions } from '../tmux.js';
import { isCreatableTeamName, readTeamRoster, type TeamRoster } from '../team-rosters.js';
import { boardExists } from '../wipeboards.js';
import { liveCount, readMax } from '../user-config.js';
import { resolveForm, type SpawnForm } from '../spawn.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);

/** One thing wrong with one seat, addressed to the control that can fix it. */
interface Reason {
  code: string;
  /** The draft field this belongs under, or '' when it is about the seat as a whole. */
  field: string;
  message: string;
}

type Verdict = 'ok' | 'warn' | 'refuse';

/**
 * A name League reserves for its own holding projection. A roster may legally be called
 * `unassigned` (`isValidTeamName` allows it), which would collide with the derived area
 * League draws for sessions on no team. League defends itself with a sentinel key, so the
 * board stays correct either way; this refuses the collision at the one surface that can
 * create it. A guard in `isValidTeamName` would be better and is the standing ask — this
 * refusal holds whether or not that lands, because a client-side-only guard is the kind
 * that gets bypassed.
 */
/**
 * The seat as the draft holds it. `null` means UNSET and is not the same as empty: only
 * these four fields distinguish the two, because only for these does the server itself
 * treat an absent key differently from a stated one (`mcp` inherits the profile's
 * default, `cmd` falls to the model bias then the install default, `project_root` to the
 * team's then the top active root, `name` to a slug). Everywhere else `''` and `[]` are
 * STATED values — most sharply `session_role: ''`, which is a real blank-role launch and
 * never "the owner has not picked yet".
 */
interface DraftSeat {
  seat_id?: unknown;
  session_role?: unknown;
  mode?: unknown;
  prompt?: unknown;
  name?: unknown;
  cmd?: unknown;
  mcp?: unknown;
  project_root?: unknown;
  tags?: unknown;
  seed?: unknown;
  inject?: unknown;
  reference?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

/** null/undefined stay undefined — the wire body is DERIVED from the draft, and dropping
 *  an unset key is what makes an unedited round-trip byte-identical. */
const opt = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s || undefined;
};

/** A seat becomes exactly the body `/api/launch` would receive. Same shape in, same
 *  answer out — that is the whole point of running the real resolver. */
function formOf(seat: DraftSeat, team: string): SpawnForm {
  return {
    session_role: str(seat.session_role).trim(),
    team: team || undefined,
    prompt: str(seat.prompt).trim(),
    name: opt(seat.name),
    mode: seat.mode === 'manual' ? 'manual' : 'assisted',
    project_root: opt(seat.project_root),
    cmd: opt(seat.cmd),
    // Only an explicit boolean is an opinion. null/undefined hands the choice to the
    // resolved profile's own `mcp:` default rather than meaning "on".
    mcp: typeof seat.mcp === 'boolean' ? seat.mcp : undefined,
    tags: list(seat.tags),
    seed: list(seat.seed),
    inject: opt(seat.inject),
    reference: opt(seat.reference),
  };
}

export function registerLaunchPreflight(app: express.Express): void {
  /**
   * POST /api/launch/preflight — { team: TeamDefinition, seats: DraftSeat[] }
   *
   * Answers for a whole draft at once: the Team half, the capacity, and one verdict per
   * seat. Seats may be empty — a Team defined with no seats is a valid draft and a valid
   * save, so a preflight of one must succeed rather than complain about an absent roster.
   */
  app.post('/api/launch/preflight', async (req, res) => {
    try {
      const teamBody = (req.body?.team ?? {}) as Record<string, unknown>;
      const name = String(teamBody.name ?? '').trim();
      const seats: DraftSeat[] = Array.isArray(req.body?.seats) ? req.body.seats : [];

      // ---- THE TEAM HALF ----
      const nameValid = isCreatableTeamName(name);
      const existing = nameValid ? await readTeamRoster(name) : null;
      const live = await listSessions();
      // Membership is derived from tags, so a name that already has tag-holders arrives
      // BORN POPULATED the moment its roster exists. On any box built with today's
      // launcher that is the ordinary case, not an edge one — the launcher sends the team
      // as a plain tag and never the first-class `team:` key, so almost every live team is
      // tag-only and giving one a roster IS the migration path.
      const adoptsSessions = name ? live.filter((s) => s.tags.includes(name)).map((s) => s.name) : [];
      // "The team wins its name" (docs/wipeboards.md): naming a Team after an existing
      // custom board adopts that board's thread. Not an error — a surprise, unless shown.
      const wipeboardToken = String(teamBody.wipeboard ?? '').trim() || name;
      const adoptsWipeboard = wipeboardToken ? await boardExists(wipeboardToken) : false;

      const team = {
        name,
        name_valid: nameValid,
        /** No roster of this name yet. Creation refuses a duplicate; adoption REQUIRES
         *  this to be true, or the surface offering it would not be empty. One field,
         *  two readings — see NEW_TEAM.md § Adoption has two doors. */
        name_available: nameValid && !existing,
        adopts_sessions: adoptsSessions,
        adopts_wipeboard: adoptsWipeboard,
        wipeboard: wipeboardToken,
      };

      // ---- CAPACITY ----
      // `cap: exempt` seats are born even at the max, so they do not count toward the
      // headroom question — they still count once they exist.
      const max = await readMax();
      const liveNow = await liveCount();

      // ---- ONE VERDICT PER SEAT ----
      // Names are checked against the live box AND against the other seats in this draft:
      // two seats asking for one name is a collision the box cannot see yet.
      const taken = new Set(live.map((s) => s.name));
      const claimed = new Set<string>();
      let exemptSeats = 0;

      const out = [];
      for (let i = 0; i < seats.length; i++) {
        const seat = seats[i];
        const seatId = String(seat.seat_id ?? i);
        const reasons: Reason[] = [];
        let resolved: Awaited<ReturnType<typeof resolveForm>> | null = null;

        const form = formOf(seat, name);
        // A named team with no roster is refused by the resolver, which is correct for a
        // launch and wrong for a preflight of a draft whose roster has not been created
        // yet. Stage 1 always commits before any seat launches, so the preflight resolves
        // against the roster when it exists and against no team when it does not — the
        // team's CONTEXT (root default, team_role reading, objective) is the only thing
        // that differs, and it is reported as unresolved rather than faked.
        const proposedRoster: TeamRoster | undefined = nameValid && !existing ? {
          name,
          team_role: String(teamBody.team_role ?? '').trim(),
          objective: String(teamBody.objective ?? '').trim(),
          project_root: String(teamBody.project_root ?? '').trim(),
          repos: Array.isArray(teamBody.repos) ? teamBody.repos.map(String) : [],
          branch: String(teamBody.branch ?? '').trim(),
          wipeboard: wipeboardToken,
          state: 'active',
        } : undefined;
        const resolvable = { ...form, team: nameValid ? name : undefined };
        try {
          resolved = await resolveForm(resolvable as SpawnForm, new Set([...taken, ...claimed]), undefined, proposedRoster);
        } catch (e) {
          reasons.push({ code: 'resolve', field: '', message: errMsg(e) });
        }

        if (resolved) {
          if (resolved.capExempt) exemptSeats++;
          // The prompt IS the agent's first message, so an agent launch cannot start
          // without one. An `agent: none` seat (OpenShell) has nobody to tell and is
          // VALID with an empty prompt — the rule is the resolved profile's, not the
          // form's, which is why it is checked here and not in the shape parser.
          if (resolved.agent && !form.prompt) {
            reasons.push({ code: 'prompt_required', field: 'prompt', message: 'Say what the session is for.' });
          }
          if (form.mode === 'manual' && !form.name) {
            reasons.push({ code: 'name_required', field: 'name', message: 'Name the session.' });
          }
          if (!isValidName(resolved.name)) {
            reasons.push({ code: 'name_underivable', field: 'name', message: 'Could not derive a session name.' });
          } else if (form.name && (taken.has(resolved.name) || claimed.has(resolved.name))) {
            // A name you TYPED is used as typed and never de-duplicated: if it is taken
            // you are told, rather than quietly ending up in `foo-2` and addressing `foo`.
            // Only a derived name grows a suffix, which is why this checks `form.name`.
            reasons.push({
              code: 'name_taken',
              field: 'name',
              message: `Session "${resolved.name}" already exists — pick another name.`,
            });
          } else {
            claimed.add(resolved.name);
          }
          // A launch that ASKED for MCP off and cannot have it is a broken promise and is
          // refused at launch; the resolver reports what it actually resolved, so a seat
          // that asked for off and reads back connected is that case, surfaced early.
          if (seat.mcp === false && resolved.mcp) {
            reasons.push({
              code: 'mcp_off_undeliverable',
              field: 'mcp',
              message:
                'This launch command declares no `mcp_off:` flags in the launch table, so it cannot be launched with MCP off.',
            });
          }
          if (form.reference && !taken.has(form.reference)) {
            reasons.push({
              code: 'reference_gone',
              field: 'reference',
              message: `Session "${form.reference}" is gone — pick another.`,
            });
          }
        }

        out.push({
          seat_id: seatId,
          verdict: (reasons.length ? 'refuse' : 'ok') as Verdict,
          derived_name: resolved?.name ?? '',
          resolved: resolved
            ? {
                name: resolved.name,
                dir: resolved.dir,
                cmd: resolved.cmd,
                tags: resolved.tags,
                dial: resolved.dial,
                lifecycle: resolved.lifecycle,
                session_role: resolved.session_role,
                team: resolved.team,
                team_role: resolved.team_role,
                project_root: resolved.project_root,
                mode: resolved.mode,
                agent: resolved.agent,
                capExempt: resolved.capExempt,
                mcp: resolved.mcp,
                launchAgent: resolved.launchAgent,
                // The composed first message, so a seat can be previewed before it exists.
                // A proposed seat has no session and therefore no Tile: the honest preview
                // is this brief plus the resolved reading, which is the owner's ruling.
                brief: resolved.brief,
              }
            : null,
          reasons,
        });
      }

      const nonExempt = out.filter((s) => !s.resolved?.capExempt).length;
      const capacity = {
        max,
        live: liveNow,
        exempt_seats: exemptSeats,
        would_be: liveNow + nonExempt,
        // 0 means no limit at all, so it can never be over.
        over_by: max > 0 ? Math.max(0, liveNow + nonExempt - max) : 0,
      };

      if (!nameValid && name) {
        // Named and illegal is a refusal the Team surface shows; named and EMPTY is an
        // ordinary drafting state and says nothing at all.
      }

      res.json({
        ok: out.every((s) => s.verdict !== 'refuse') && capacity.over_by === 0,
        team,
        capacity,
        seats: out,
      });
    } catch (e) {
      // The preflight itself broke. A bad draft never lands here — it comes back as data.
      res.status(500).json({ error: errMsg(e) });
    }
  });
}
