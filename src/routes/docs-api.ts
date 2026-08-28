/**
 * THE DOC SHELVES — `GET /api/docs?shelf=plans|docs` (owner, 2026-08-28).
 *
 * The ▧ Docs tab has three pills: Tracked (what agents listed with `write_tegami --doc`,
 * which needs no route — it is the letters), PLANS and DOCS. The last two are lists of
 * files under directories each project_root NAMES on its own record (`plans:` and
 * `docs:` in the catalogs store's PROJECT_ROOTS.md, `src/project-roots.ts`), with the
 * house conventions as the shipped defaults. Only `.md` and `.html`, only inside the
 * named places: this is a doc list, never a file browser (the owner's standing rule,
 * `public/js/docs.js`) — "this is not an IDE; this is just looking at documentation".
 */
import type express from 'express';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { listProjectRoots } from '../project-roots.js';

const DOC_EXT = /\.(md|html?)$/i;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.cache']);
const MAX_PER_ROOT = 400;

/** Every doc under `at` (a file names itself; a directory is walked, skipping code trees). */
async function docsUnder(at: string, out: string[]): Promise<void> {
  let s;
  try {
    s = await stat(at);
  } catch {
    return; // a named place that is not there is a root's business, not an error here
  }
  if (s.isFile()) {
    if (DOC_EXT.test(at)) out.push(at);
    return;
  }
  if (!s.isDirectory()) return;
  const names = (await readdir(at, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const d of names) {
    if (out.length >= MAX_PER_ROOT) return;
    if (d.name.startsWith('.') || SKIP.has(d.name)) continue;
    const p = path.join(at, d.name);
    if (d.isDirectory()) await docsUnder(p, out);
    else if (d.isFile() && DOC_EXT.test(d.name)) out.push(p);
  }
}

export function registerDocs(app: express.Express): void {
  app.get('/api/docs', async (req, res) => {
    const shelf = String(req.query.shelf ?? '');
    if (shelf !== 'plans' && shelf !== 'docs') return res.status(400).json({ error: 'shelf is "plans" or "docs".' });
    try {
      const roots = await listProjectRoots();
      const groups = [];
      for (const r of roots) {
        const files: string[] = [];
        for (const rel of r[shelf]) await docsUnder(path.resolve(r.dir, rel), files);
        groups.push({ root: r.name, dir: r.dir, archived: r.archived, files });
      }
      res.json({ shelf, groups });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
