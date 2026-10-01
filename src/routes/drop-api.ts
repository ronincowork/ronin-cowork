import express from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sessionDir, sessionKey } from '../session-dir.js';
import { typeAtPrompt } from '../send.js';
import { isValidName, listSessions } from '../tmux.js';

export const DROP_LIMIT_BYTES = 25 * 1024 * 1024;

/** A clean name: the file's own base, safe characters only, behind a sortable timestamp. */
export function dropName(original: string, at = new Date()): string {
  const base = path.basename(String(original || '')).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(-120) || 'file';
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  return `${stamp}-${base}`;
}

/** A file handed to an Agent from the browser: it lands in the session's own drop/, the
 * Docs tab lists it from there, and its path is typed into the Agent's input, no Enter. */
export function registerDrop(app: express.Express): void {
  const raw = express.raw({ type: () => true, limit: DROP_LIMIT_BYTES });
  app.post('/api/sessions/:name/drop', (req, res, next) => raw(req, res, (e?: unknown) => (e
    ? res.status(413).json({ error: 'Files are limited to 25 MB.' })
    : next())), async (req, res) => {
    const name = req.params.name;
    if (!isValidName(name) || !(await listSessions()).some((s) => s.name === name)) {
      return res.status(404).json({ error: 'No such session.' });
    }
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    try {
      const dir = path.join(sessionDir(await sessionKey(name)), 'drop');
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, dropName(String(req.query.name ?? '')));
      await writeFile(file, body, { flag: 'wx' });
      const typed = await typeAtPrompt(name, file).catch((e) => ({ delivered: false, reason: String((e as Error)?.message ?? e) }));
      res.json({ ok: true, path: file, bytes: body.length, typed: typed.delivered, reason: typed.reason });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
