/* /api/office — the office record as this Ronin reads it: self-hosted, or an office on an
 * office_park with its record. Read-only; the browser's Office section and Agents' machine
 * reading both draw from the same reader (src/office-record.ts).
 *
 * THE FACTS (src/facts.ts, KAN-768): GET /api/office/read is `office read`, the suite built now and
 * concatenated; /api/office/status is MACHINE_STATUS.md, the same suite in one file (GET reads it,
 * POST builds every fact now); GET /api/facts/:name is one fact built now, for any screen that draws it. */
import type express from 'express';
import fs from 'node:fs/promises';
import { readOfficeRecord } from '../office-record.js';
import { factFile, machineStatusFile, writeFact, writeFacts } from '../facts.js';

const fail = (res: express.Response, error: unknown, status = 500) => res.status(status).json({ ok: false, error: String((error as Error)?.message ?? error) });

export function registerOffice(app: express.Express): void {
  app.get('/api/office', async (_req, res) => {
    try { res.json(await readOfficeRecord()); }
    catch (error) { res.status(500).json({ error: String((error as Error)?.message ?? error) }); }
  });
  app.get('/api/office/read', async (_req, res) => {
    try { res.json({ ok: true, text: await writeFacts() }); }
    catch (error) { fail(res, error); }
  });
  app.get('/api/office/status', async (_req, res) => {
    const file = machineStatusFile();
    const [text, stat] = await Promise.all([fs.readFile(file, 'utf8').catch(() => ''), fs.stat(file).catch(() => null)]);
    res.json({ ok: true, path: file, text, written_at: stat ? stat.mtime.toISOString() : '' });
  });
  app.post('/api/office/status', async (_req, res) => {
    try { res.json({ ok: true, path: machineStatusFile(), text: await writeFacts(), written_at: new Date().toISOString() }); }
    catch (error) { fail(res, error); }
  });
  app.get('/api/facts/:name', async (req, res) => {
    try { res.json({ ok: true, name: req.params.name, path: factFile(req.params.name), text: await writeFact(req.params.name) }); }
    catch (error) { fail(res, error, 404); }
  });
}
