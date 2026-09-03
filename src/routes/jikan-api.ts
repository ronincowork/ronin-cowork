/**
 * JIKAN over HTTP — the Cron jobs tab's door, per team, and the clock that runs the lists.
 *
 * Read `src/jikan.ts` first: the list is the owner's file and every job is delivered
 * through the ordinary message door. This file only wears it as routes, and starts the
 * one clock with the house's real parts — tmux's session list, and the message queue —
 * which the unit floor replaces with fakes.
 */
import type express from 'express';
import { homedir } from 'node:os';
import { addJob, clockFace, describeWhen, editJob, isValidTeam, listJobs, nextRun, parseWhen, removeJob, runJob, startJikan, type Clock, type Job } from '../jikan.js';
import { attemptMessage, enqueueMessage } from '../message-queue.js';
import { listSessions } from '../tmux.js';

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');

/** The clock's real parts. Delivery is exactly what `tejun-send` does: enqueue, then one safe attempt. */
export const houseClock: Clock = {
  now: () => Date.now(),
  sessions: async () => (await listSessions()).map((s) => ({ name: s.name, tags: s.tags, leads: s.leads })),
  deliver: async (target, text, from) => {
    const item = await enqueueMessage(target, text, 'jikan', from);
    const retained = await attemptMessage(item.id, 'safe');
    return retained ? 'queued' : 'delivered';
  },
};

const face = (job: Job) => ({ ...job, when_words: describeWhen(job.when) });

export function registerJikan(app: express.Express): void {
  // Prove timing words before they are saved: the next three moments they mean.
  app.get('/api/jikan/when', (req, res) => {
    const words = String(req.query?.words ?? '').trim().slice(0, 120);
    const spec = parseWhen(words);
    if (!spec) return res.status(400).json({ error: 'Timing is `once 2026-09-04 08:00`, `daily 08:00`, `weekdays 08:00`, `weekly mon 08:00`, `monthly 1 09:00`, `hourly`, `every 30m`, or a five-field cron line.' });
    const next: string[] = [];
    let t = Date.now();
    for (let i = 0; i < 3; i++) {
      const n = nextRun(spec, t, t);
      if (n === null) break;
      next.push(new Date(n).toISOString());
      t = n;
    }
    res.json({ words: describeWhen(words), next });
  });

  const team = (req: express.Request, res: express.Response): string | null => {
    const name = String(req.params.team ?? '');
    if (!isValidTeam(name)) { res.status(400).json({ error: 'A team name is lowercase letters, digits, _ and -.' }); return null; }
    return name;
  };

  app.get('/api/teams/:team/jikan', async (req, res) => {
    const name = team(req, res);
    if (!name) return;
    try {
      res.json({ team: name, jobs: (await listJobs(name)).map(face), now: new Date().toISOString(), clock: clockFace().find((t) => t.name === 'jikan') ?? null });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.post('/api/teams/:team/jikan', async (req, res) => {
    const name = team(req, res);
    if (!name) return;
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      res.json({ ok: true, job: face(await addJob(name, { request: body.request, to: body.to, when: body.when, by: body.by ?? 'owner' })) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.put('/api/teams/:team/jikan/:id', async (req, res) => {
    const name = team(req, res);
    if (!name) return;
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const edit: Record<string, unknown> = {};
      for (const key of ['request', 'to', 'when', 'state']) if (body[key] !== undefined) edit[key] = body[key];
      res.json({ ok: true, job: face(await editJob(name, String(req.params.id), edit)) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });

  app.delete('/api/teams/:team/jikan/:id', async (req, res) => {
    const name = team(req, res);
    if (!name) return;
    try {
      res.json({ ok: await removeJob(name, String(req.params.id)) });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  // Run now — the same firing the clock would do, on a press; the outcome is the answer.
  app.post('/api/teams/:team/jikan/:id/run', async (req, res) => {
    const name = team(req, res);
    if (!name) return;
    try {
      res.json({ ok: true, outcome: await runJob(name, String(req.params.id), houseClock) });
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });
}

/** The clock, on the house's parts. Called once from index.ts. */
export const startHouseJikan = (): (() => void) => startJikan(houseClock);
