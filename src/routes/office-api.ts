/* /api/office — the office record as this Ronin reads it: self-hosted, or an office on an
 * office_host with its record. Read-only; the browser's Office section and Agents' machine
 * reading both draw from the same reader (src/office-record.ts). */
import type express from 'express';
import { readOfficeRecord } from '../office-record.js';

export function registerOffice(app: express.Express): void {
  app.get('/api/office', async (_req, res) => {
    try { res.json(await readOfficeRecord()); }
    catch (error) { res.status(500).json({ error: String((error as Error)?.message ?? error) }); }
  });
}
