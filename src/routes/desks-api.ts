import type express from 'express';
import { listProjectRoots, repoFacts } from '../project-roots.js';
import { deriveDesk, fromStatus, locatorFrom, rollup, sameDesk, type DeskRollup, type DeskState, type LocateRepo } from '../desk-state.js';
import { listDesks } from '../desks/registry.js';
import { clearFunnel, diagnoseFunnel, listFunnelReceipts, preserveFunnel, readFunnelReceipt } from '../promotion/funnel-recovery.js';
import { readTeamRoster } from '../team-rosters.js';
import { readArrangement } from '../desks/arrangement.js';
import { teamLineBranch } from '../desks/schema.js';
import { readRepos } from '../tegami.js';
import { isValidName, sessionExists } from '../tmux.js';

async function locator(): Promise<LocateRepo> {
  const roots = await listProjectRoots().catch(() => []);
  const facts = await Promise.all(roots.map((r) => repoFacts(r).catch(() => null)));
  return locatorFrom(
    facts.flatMap((f) => (f && f.exists ? [{ name: f.name, dir: f.dir, remote: f.repo?.remote ?? '' }] : [])),
  );
}

interface SessionDesks {
  session: string;
  live: boolean;
  desks: DeskState[];
  rollup: DeskRollup;
}

async function desksOf(session: string, locate: LocateRepo): Promise<SessionDesks> {
  const recorded = (await listDesks({ session }).catch(() => [])).map(fromStatus);
  const desks = [...recorded];
  for (const entry of await readRepos(session)) {
    const at = await locate(entry.repo).catch(() => null);
    if (recorded.some((desk) => sameDesk(desk, entry, at))) continue;
    desks.push(await deriveDesk(entry, at, session));
  }
  return { session, live: true, desks, rollup: rollup(desks) };
}

export function registerDesks(app: express.Express): void {
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

  // One session's desks, keyed by its name ({} when it is not live): what a Work Record's
  // ladder reads when it opens.
  app.get('/api/desks', async (req, res) => {
    const session = String(req.query.session ?? '').trim();
    try {
      if (!isValidName(session)) return res.status(400).json({ error: 'Name one session: /api/desks?session=<name>.' });
      if (!(await sessionExists(session))) return res.json({});
      res.json({ [session]: await desksOf(session, await locator()) });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
