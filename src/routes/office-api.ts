/* /api/office — the office record as this Ronin reads it: self-hosted, or an office on an
 * office_park with its record. Read-only; the browser's Office section and Agents' machine
 * reading both draw from the same reader (src/office-record.ts). GET /api/office/read is the
 * `office read` tool's: the rig an Agent is on, assembled as it is asked (src/office-read.ts, KAN-712).
 * /api/office/status is the machine status file: GET reads it, POST writes it now (KAN-759). */
import type express from 'express';
import { readOfficeRecord } from '../office-record.js';
import { machineStatusFile, officeRead, writeMachineStatus } from '../office-read.js';
import fs from 'node:fs/promises';

export function registerOffice(app: express.Express): void {
  app.get('/api/office', async (_req, res) => {
    try { res.json(await readOfficeRecord()); }
    catch (error) { res.status(500).json({ error: String((error as Error)?.message ?? error) }); }
  });
  app.get('/api/office/read', async (req, res) => {
    try { res.json({ ok: true, text: await officeRead(String(req.query.workspace ?? '').trim()) }); }
    catch (error) { res.status(500).json({ ok: false, error: String((error as Error)?.message ?? error) }); }
  });
  // THE MACHINE STATUS FILE (KAN-759): GET is what was last written, and when; POST writes it now.
  app.get('/api/office/status', async (_req, res) => {
    const file = machineStatusFile();
    const [text, stat] = await Promise.all([fs.readFile(file, 'utf8').catch(() => ''), fs.stat(file).catch(() => null)]);
    res.json({ ok: true, path: file, text, written_at: stat ? stat.mtime.toISOString() : '' });
  });
  app.post('/api/office/status', async (_req, res) => {
    try { res.json({ ok: true, ...(await writeMachineStatus()) }); }
    catch (error) { res.status(500).json({ ok: false, error: String((error as Error)?.message ?? error) }); }
  });
}
