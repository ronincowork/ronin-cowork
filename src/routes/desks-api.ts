/**
 * DESK STATE ROUTES — the visible half of the control surface (Fable 4).
 *
 *   GET /api/sessions/:name/desks   one session's desks, derived, plus its roll-up
 *   GET /api/teams/:name/desks      every member's desks rolled up under the team
 *
 * All READS with no store of their own. The desk registry (`src/desks/`, Track 1) is the
 * first source: every desk it recorded for a session, with its derived `DeskStatus`.
 * The letter's `repos[]` is the second: an entry the registry has no row for (today's
 * shared checkout; a repo the session added by hand) is derived from git here. The
 * union is the session's desks. Nothing here asks an agent to keep a fact current, and
 * nothing here mutates a ref.
 *
 * The repository LOCATOR is the project-root catalog: a desk's `repo` is matched to a
 * root by remote or directory, and git is asked there. A repo no root knows is an
 * `unknown` desk in the answer, not a 500 — a session may legitimately list a repo this
 * box has never launched into.
 */
import type express from 'express';
import { listProjectRoots, repoFacts } from '../project-roots.js';
import { deriveDesk, fromStatus, locatorFrom, rollup, sameDesk, type DeskRollup, type DeskState, type LocateRepo } from '../desk-state.js';
import { listDesks } from '../desks/registry.js';
import { blockingReceipt, lastGoodPromotion, summarize } from '../promotion/receipts.js';
import { clearFunnel, diagnoseFunnel, listFunnelReceipts, preserveFunnel, readFunnelReceipt } from '../promotion/funnel-recovery.js';
import { readTeamRoster } from '../team-rosters.js';
import { readArrangement } from '../desks/arrangement.js';
import { teamLineBranch } from '../desks/schema.js';
import { readRepos } from '../tegami.js';
import { isValidName, listSessions, sessionExists } from '../tmux.js';

/** One locator per request: the roots' remotes are one git call each, paid once. */
async function locator(): Promise<LocateRepo> {
  const roots = await listProjectRoots().catch(() => []);
  const facts = await Promise.all(roots.map((r) => repoFacts(r).catch(() => null)));
  return locatorFrom(
    facts.flatMap((f) => (f && f.exists ? [{ name: f.name, dir: f.dir, remote: f.repo?.remote ?? '' }] : [])),
  );
}

export interface SessionDesks {
  session: string;
  /** False for a session the registry remembers (parked desks) that is not live. */
  live: boolean;
  desks: DeskState[];
  rollup: DeskRollup;
}

/** The registry's desks for a session, then the letter's entries it does not know. */
export async function desksOf(session: string, locate: LocateRepo, live = true): Promise<SessionDesks> {
  const recorded = (await listDesks({ session }).catch(() => [])).map(fromStatus);
  const desks = [...recorded];
  for (const entry of await readRepos(session)) {
    const at = await locate(entry.repo).catch(() => null);
    if (recorded.some((desk) => sameDesk(desk, entry, at))) continue;
    desks.push(await deriveDesk(entry, at, session));
  }
  return { session, live, desks, rollup: rollup(desks) };
}

function sum(rows: DeskRollup[]): DeskRollup {
  const r: DeskRollup = { desks: 0, private: 0, dirty: 0, pending: 0, parked: 0, blocked: 0, lined: 0 };
  for (const x of rows) for (const k of Object.keys(r) as (keyof DeskRollup)[]) r[k] += x[k];
  return r;
}

/**
 * EVERY LIVE SESSION'S DESKS, one call — what the roster and every tile head read on
 * their poll. Memoised for a few seconds: N tiles and the roster ask on the same clock,
 * and the answer is a handful of git subprocesses per desk that need not run N times.
 */
let memo: { at: number; value: Promise<Record<string, SessionDesks>> } | null = null;
const MEMO_MS = 4_000;

async function allDesks(): Promise<Record<string, SessionDesks>> {
  const locate = await locator();
  const rows = await Promise.all((await listSessions()).map((s) => desksOf(s.name, locate)));
  return Object.fromEntries(rows.map((r) => [r.session, r]));
}

export function registerDesks(app: express.Express): void {
  // The owner-facing half of dirty-funnel recovery. These routes use the same receipt
  // transaction as the Agent CLI; callers never send paths, refs, or Git commands.
  app.get('/api/funnel-recovery', async (_req, res) => {
    try { res.json(await listFunnelReceipts()); }
    catch (e) { res.status(500).json({ error: String((e as Error)?.message ?? e) }); }
  });

  app.get('/api/funnel-recovery/:id', async (req, res) => {
    try {
      const r = await readFunnelReceipt(req.params.id);
      if (!r) return res.status(404).json({ error: 'No such funnel recovery receipt.' });
      res.json(r);
    } catch (e) { res.status(500).json({ error: String((e as Error)?.message ?? e) }); }
  });

  app.post('/api/teams/:name/funnel/:repo/diagnose', async (req, res) => {
    try {
      const roster = await readTeamRoster(req.params.name);
      if (!roster) return res.status(404).json({ error: 'No such team.' });
      const root = (await listProjectRoots()).find((x) => x.name === req.params.repo);
      if (!root) return res.status(404).json({ error: 'No such project root.' });
      const names = roster.project_root ? [roster.project_root] : [];
      if (!names.includes(root.name)) return res.status(400).json({ error: 'That repository is not assigned to this team.' });
      const arr = await readArrangement(root.name, root.dir);
      if (arr.mode !== 'reviewed') return res.status(400).json({ error: 'Direct repositories have no reviewed funnel.' });
      res.json(await diagnoseFunnel({ repo: root.name, dir: root.dir, line: roster.branch || teamLineBranch(req.params.name), target: arr.working }, String(req.body?.by ?? 'owner')));
    } catch (e) { res.status(500).json({ error: String((e as Error)?.message ?? e) }); }
  });

  app.post('/api/funnel-recovery/:id/preserve', async (req, res) => {
    try { const r = await preserveFunnel(req.params.id); res.status(r.state === 'preserved' ? 200 : 409).json(r); }
    catch (e) { res.status(409).json({ error: String((e as Error)?.message ?? e) }); }
  });

  app.post('/api/funnel-recovery/:id/clear', async (req, res) => {
    try { const r = await clearFunnel(req.params.id); res.status(r.state === 'clean' ? 200 : 409).json(r); }
    catch (e) { res.status(409).json({ error: String((e as Error)?.message ?? e) }); }
  });

  app.get('/api/desks', async (_req, res) => {
    try {
      if (!memo || Date.now() - memo.at > MEMO_MS) memo = { at: Date.now(), value: allDesks() };
      res.json(await memo.value);
    } catch (e) {
      memo = null;
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  app.get('/api/sessions/:name/desks', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      res.json(await desksOf(name, await locator()));
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  /**
   * THE TEAM'S VIEW — members' desks rolled up, plus the team line seen per repository
   * (from the desks themselves: a single roster `branch` cannot name two repos' lines),
   * plus the registry's desks for this team whose session is GONE: a parked desk is the
   * lead's to hand in, inspect, reassign or discard (docs/worktrees.md "Session loss"), and
   * it shows here with `live: false` rather than vanishing with its session.
   */
  app.get('/api/teams/:name/desks', async (req, res) => {
    const { name } = req.params;
    try {
      const locate = await locator();
      const live = (await listSessions()).filter((s) => s.tags.includes(name));
      const rows = await Promise.all(live.map((s) => desksOf(s.name, locate)));
      const gone = new Map<string, DeskState[]>();
      for (const st of await listDesks({ team: name }).catch(() => [])) {
        if (live.some((s) => s.name === st.session)) continue;
        (gone.get(st.session) ?? gone.set(st.session, []).get(st.session)!).push(fromStatus(st));
      }
      for (const [session, desks] of gone) rows.push({ session, live: false, desks, rollup: rollup(desks) });
      const lines: Record<string, string> = {};
      for (const r of rows) for (const d of r.desks) if (d.line && !lines[d.short]) lines[d.short] = d.line;
      // THE PROMOTION STATE, off Track 2's ledger: the last complete team promotion, and
      // any receipt still blocking the team — advancing, or interrupted mid-advance, which
      // the roster must show as `landing: cowork done, services pending` rather than hide.
      const [good, blocking] = await Promise.all([lastGoodPromotion(name).catch(() => null), blockingReceipt(name).catch(() => null)]);
      const brief = (r: NonNullable<typeof good>) => ({ id: r.id, kind: r.kind, state: r.state, at: r.updated_at || r.at, by: r.by, summary: summarize(r) });
      res.json({
        team: name, members: rows, rollup: sum(rows.map((r) => r.rollup)), lines,
        promotion: { last_good: good ? brief(good) : null, blocking: blocking ? brief(blocking) : null },
      });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
