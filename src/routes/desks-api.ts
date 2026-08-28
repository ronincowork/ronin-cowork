/**
 * DESK STATE ROUTES — the visible half of the control surface (Fable 4).
 *
 *   GET /api/sessions/:name/desks   one session's desks, derived, plus its roll-up
 *   GET /api/teams/:name/desks      every member's desks rolled up under the team
 *
 * Both are READS with no store of their own: the letter names the desks (`repos[]`),
 * git answers the mechanical facts, and the desk registry — when Track 1 wires it into
 * `deskFacts` — answers pending / last hand-in / blocked. Nothing here asks an agent
 * to keep a fact current, and nothing here mutates a ref (RONIN_CONTROL_SURFACE.md § 5).
 *
 * The repository LOCATOR is the project-root catalog: a desk's `repo` is matched to a
 * root by remote or directory, and git is asked there. A repo no root knows is an
 * `unknown` desk in the answer, not a 500 — a session may legitimately list a repo this
 * box has never launched into.
 */
import type express from 'express';
import { listProjectRoots, repoFacts } from '../project-roots.js';
import { deriveDesks, locatorFrom, noDeskFacts, rollup, type DeskFacts, type DeskRollup, type DeskState, type LocateRepo } from '../desk-state.js';
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
  desks: DeskState[];
  rollup: DeskRollup;
}

export async function desksOf(session: string, locate: LocateRepo, facts: DeskFacts): Promise<SessionDesks> {
  const desks = await deriveDesks(session, await readRepos(session), locate, facts);
  return { session, desks, rollup: rollup(desks) };
}

function sum(rows: DeskRollup[]): DeskRollup {
  const r: DeskRollup = { desks: 0, private: 0, dirty: 0, pending: 0, parked: 0, blocked: 0, lined: 0 };
  for (const x of rows) for (const k of Object.keys(r) as (keyof DeskRollup)[]) r[k] += x[k];
  return r;
}

/** `facts` is the registry seam: Track 1 passes its registry/receipt reader once it exists. */
export function registerDesks(app: express.Express, facts: DeskFacts = noDeskFacts): void {
  app.get('/api/sessions/:name/desks', async (req, res) => {
    const { name } = req.params;
    if (!isValidName(name)) return res.status(400).json({ error: 'Invalid name.' });
    if (!(await sessionExists(name))) return res.status(404).json({ error: 'No such session.' });
    try {
      res.json(await desksOf(name, await locator(), facts));
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });

  /**
   * THE TEAM'S VIEW — members' desks rolled up, plus the team line seen per repository
   * (from the desks themselves: a single roster `branch` cannot name two repos' lines).
   */
  app.get('/api/teams/:name/desks', async (req, res) => {
    const { name } = req.params;
    try {
      const locate = await locator();
      const members = (await listSessions()).filter((s) => s.tags.includes(name));
      const rows = await Promise.all(members.map((s) => desksOf(s.name, locate, facts)));
      const lines: Record<string, string> = {};
      for (const r of rows) for (const d of r.desks) if (d.line && !lines[d.short]) lines[d.short] = d.line;
      res.json({ team: name, members: rows, rollup: sum(rows.map((r) => r.rollup)), lines });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
