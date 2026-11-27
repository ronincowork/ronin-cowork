/* WORKBENCHES FROM A FOLDER (KAN-954): each folder in ~/ronin/custom/workbenches/ is a workbench.
 * GET /api/workbenches lists them, read now (a folder dropped in shows on the next page load, one
 * removed is gone); /custom/workbenches/<name>/<path> serves the folder's files as they are, so its
 * page code loads and imports its own files. The shape is docs/architecture/workbench.md, Workbench
 * packages. Cowork knows no package by name. */
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';
import { noCacheClient } from '../assets.js';

export interface WorkbenchSurface { type: string; seat?: number }
export interface FolderWorkbench { name: string; title: string; entry: string; surfaces: WorkbenchSurface[] }

/** Every folder with a workbench.json that reads; one that does not is left out with a warning. */
export async function listFolderWorkbenches(): Promise<FolderWorkbench[]> {
  const root = storeDir('workbenches');
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const found: FolderWorkbench[] = [];
  for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      const doc = JSON.parse(await fs.readFile(path.join(root, entry.name, 'workbench.json'), 'utf8')) as Record<string, unknown>;
      const surfaces = (Array.isArray(doc.surfaces) ? doc.surfaces : [])
        .map((s) => (typeof s === 'string' ? { type: s } : s) as WorkbenchSurface)
        .filter((s) => typeof s?.type === 'string' && s.type);
      found.push({
        name: entry.name,
        title: typeof doc.title === 'string' && doc.title ? doc.title : entry.name,
        entry: typeof doc.entry === 'string' && doc.entry ? doc.entry : 'page/main.js',
        surfaces: surfaces.map((s) => ({ type: s.type, ...(Number.isInteger(s.seat) ? { seat: s.seat } : {}) })),
      });
    } catch (e) {
      console.warn(`[workbenches] ${entry.name}: ${(e as Error).message}`);
    }
  }
  return found;
}

export function registerWorkbenches(app: express.Express): void {
  app.get('/api/workbenches', async (_req, res) => {
    res.json({ workbenches: await listFolderWorkbenches() });
  });
  const serve = express.static(storeDir('workbenches'), { setHeaders: noCacheClient, index: false });
  app.use('/custom/workbenches', serve);
}
