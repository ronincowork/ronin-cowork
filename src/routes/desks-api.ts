import type express from 'express';
import { folderFacts } from '../folder-facts.js';
import { workspaceFolders } from '../workspaces.js';
import { deriveDesk, fromStatus, locatorFrom, rollup, sameDesk, type DeskRollup, type DeskState, type LocateRepo } from '../desk-state.js';
import { listDesks } from '../desks/registry.js';
import { readRepos } from '../tegami.js';
import { isValidName, sessionExists } from '../tmux.js';

async function locator(): Promise<LocateRepo> {
  const roots = await workspaceFolders().catch(() => []);
  const facts = await Promise.all(roots.map((r) => folderFacts(r.dir).catch(() => null)));
  return locatorFrom(
    facts.flatMap((f, i) => (f && f.exists ? [{ name: roots[i].name, dir: f.dir, remote: f.repo?.remote ?? '' }] : [])),
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
  // One session's desks, keyed by its name ({} when it is not live): what a Work Record
  // reads when it opens.
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
