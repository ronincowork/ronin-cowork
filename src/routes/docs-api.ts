import type express from 'express';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { listProjectRoots } from '../project-roots.js';

const DOC_EXT = /\.(md|html?)$/i;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.cache']);
const MAX_PER_ROOT = 400;

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
