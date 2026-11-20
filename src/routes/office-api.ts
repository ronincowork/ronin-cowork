/* /api/office — the office record as this Ronin reads it: self-hosted, or an office on an
 * office_park with its record. Read-only; the browser's Office section and Agents' machine
 * reading both draw from the same reader (src/office-record.ts). GET /api/office/read is the
 * `office read` tool's: the rig an Agent is on, assembled as it is asked (src/office-read.ts, KAN-712). */
import type express from 'express';
import { readOfficeRecord } from '../office-record.js';
import { officeRead } from '../office-read.js';

export function registerOffice(app: express.Express): void {
  app.get('/api/office', async (_req, res) => {
    try { res.json(await readOfficeRecord()); }
    catch (error) { res.status(500).json({ error: String((error as Error)?.message ?? error) }); }
  });
  app.get('/api/office/read', async (req, res) => {
    try { res.json({ ok: true, text: await officeRead(String(req.query.workspace ?? '').trim()) }); }
    catch (error) { res.status(500).json({ ok: false, error: String((error as Error)?.message ?? error) }); }
  });
}
