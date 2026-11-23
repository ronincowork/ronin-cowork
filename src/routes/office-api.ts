/* /api/office — the office record as this Ronin reads it: self-hosted, or an office on an
 * office_park with its record. Read-only; the browser's Office section and Agents' machine
 * reading both draw from the same reader (src/office-record.ts).
 *
 * THE FACTS (src/facts.ts, KAN-768): the files are kept current by their store watchers, so a read
 * reads them, GitHub asked first (gh's sign-in is not a store Ronin watches). GET /api/office/read is
 * `office read`, the suite concatenated; GET /api/office/status is Settings' Machine status, the same
 * suite with MACHINE_STATUS.md's path and time; GET /api/facts/:name is one fact. */
import type express from 'express';
import fs from 'node:fs/promises';
import { readOfficeRecord } from '../office-record.js';
import { factFile, machineStatusFile, readFactNow, readSuite } from '../facts.js';

const fail = (res: express.Response, error: unknown, status = 500) => res.status(status).json({ ok: false, error: String((error as Error)?.message ?? error) });

export function registerOffice(app: express.Express): void {
  app.get('/api/office', async (_req, res) => {
    try { res.json(await readOfficeRecord()); }
    catch (error) { res.status(500).json({ error: String((error as Error)?.message ?? error) }); }
  });
  app.get('/api/office/read', async (_req, res) => {
    try { res.json({ ok: true, text: await readSuite() }); }
    catch (error) { fail(res, error); }
  });
  app.get('/api/office/status', async (_req, res) => {
    try {
      const text = await readSuite();
      const stat = await fs.stat(machineStatusFile()).catch(() => null);
      res.json({ ok: true, path: machineStatusFile(), text, written_at: stat ? stat.mtime.toISOString() : '' });
    } catch (error) { fail(res, error); }
  });
  app.get('/api/facts/:name', async (req, res) => {
    try { res.json({ ok: true, name: req.params.name, path: factFile(req.params.name), text: await readFactNow(req.params.name) }); }
    catch (error) { fail(res, error, 404); }
  });
}
