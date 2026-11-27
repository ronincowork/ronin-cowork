/* WORKBENCHES FROM A FOLDER (KAN-954): each folder in ~/ronin/custom/workbenches/ is a workbench.
 * GET /api/workbenches lists them, read now (a folder dropped in shows on the next page load, one
 * removed is gone); /custom/workbenches/<name>/<path> serves the folder's files as they are, so its
 * page code loads and imports its own files. The shape is docs/architecture/workbench.md, Workbench
 * packages. Cowork knows no package by name. */
import express from 'express';
import type { IncomingMessage } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';
import { noCacheClient } from '../assets.js';
import { person } from '../office-people.js';

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

/* WHICH WORKBENCHES MEMBERS SEE (KAN-955): one office setting, ~/ronin/config/members_see.json,
 * {"workbenches":["appliance_counter"]}, the first where a member lands. It applies to every person
 * whose role is member (members.json, src/office-people.ts); the owner, and a local caller, is
 * shown everything. No file or an empty list: members are shown everything too. It decides what is
 * shown; nothing is refused. Settings writes it; a package's members_see is written into it once
 * when the package is first copied in. */
export const membersSeeFile = (): string => path.join(storeDir('config'), 'members_see.json');

export async function readMembersSee(): Promise<string[]> {
  try {
    const doc = JSON.parse(await fs.readFile(membersSeeFile(), 'utf8')) as { workbenches?: unknown };
    return (Array.isArray(doc.workbenches) ? doc.workbenches : []).filter((n): n is string => typeof n === 'string' && !!n);
  } catch { return []; }
}

/** What this request's person is shown: the list for a member when one is set, else null (everything). */
export async function shownTo(req: IncomingMessage): Promise<string[] | null> {
  if (person(req)?.role !== 'member') return null;
  const list = await readMembersSee();
  return list.length ? list : null;
}

export function registerWorkbenches(app: express.Express): void {
  app.get('/api/workbenches', async (req, res) => {
    res.json({ workbenches: await listFolderWorkbenches(), members_see: await readMembersSee(), shown: await shownTo(req) });
  });
  app.put('/api/workbenches/members-see', async (req, res) => {
    const list = (Array.isArray(req.body?.workbenches) ? req.body.workbenches : []).filter((n: unknown): n is string => typeof n === 'string' && !!n);
    await fs.mkdir(storeDir('config'), { recursive: true });
    const tmp = `${membersSeeFile()}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify({ workbenches: list }, null, 2)}\n`);
    await fs.rename(tmp, membersSeeFile());
    res.json({ ok: true, members_see: list });
  });
  const serve = express.static(storeDir('workbenches'), { setHeaders: noCacheClient, index: false });
  app.use('/custom/workbenches', serve);
}
