/**
 * JIKAN over HTTP — the Cron jobs tab's door, per team, and the tick on the house clock.
 *
 * Read `src/jikan.ts` first. This wears it as routes and starts the tick with the house's
 * real parts: tmux's session list, and the message queue (enqueue, then one safe attempt —
 * exactly what `tejun-send` does). The unit floor replaces both with fakes.
 */
import type express from 'express';
import { homedir } from 'node:os';
import { addJob, isValidJobId, isValidTeam, listJobs, nextRun, parseWhen, removeJob, setJob, startJikan, type Door } from '../jikan.js';
import { attemptMessage, enqueueMessage } from '../message-queue.js';
import { listSessions } from '../tmux.js';

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');

export const houseDoor: Door = {
  now: () => Date.now(),
  sessions: async () => (await listSessions()).map((s) => ({ name: s.name, tags: s.tags, leads: s.leads })),
  deliver: async (target, text) => ((await attemptMessage((await enqueueMessage(target, text, 'jikan')).id, 'safe')) ? 'queued' : 'delivered'),
};

export function registerJikan(app: express.Express): void {
  // Prove timing words before they are saved: the next three moments they mean.
  app.get('/api/jikan/when', (req, res) => {
    const spec = parseWhen(String(req.query?.words ?? '').slice(0, 120));
    if (!spec) return res.status(400).json({ error: 'Timing is `once 2026-09-04 08:00`, `daily 08:00`, `weekdays 08:00`, `weekly mon 08:00`, `monthly 1 09:00`, `hourly`, `every 30m`, or a five-field cron line.' });
    const next: string[] = [];
    for (let t = Date.now(), i = 0; i < 3; i++) { const n = nextRun(spec, t); if (n === null) break; next.push(new Date(n).toISOString()); t = n; }
    res.json({ next });
  });

  const team = (req: express.Request, res: express.Response): string | null => {
    const name = String(req.params.team ?? '');
    if (isValidTeam(name)) return name;
    res.status(400).json({ error: 'A team name is lowercase letters, digits, _ and -.' });
    return null;
  };
  const answer = async (res: express.Response, work: () => Promise<unknown>, status = 400) => {
    try { res.json(await work()); } catch (e) { res.status(status).json({ error: errMsg(e) }); }
  };

  app.get('/api/teams/:team/jikan', (req, res) => { const t = team(req, res); if (t) void answer(res, async () => ({ team: t, jobs: await listJobs(t) }), 500); });
  app.post('/api/teams/:team/jikan', (req, res) => {
    const t = team(req, res);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (t) void answer(res, async () => ({ ok: true, job: await addJob(t, { request: b.request, to: b.to, when: b.when, by: 'owner' }) }));
  });
  // `{ state: 'active' | 'paused' | 'now' }` — now means due at the next tick.
  app.put('/api/teams/:team/jikan/:id', (req, res) => {
    const t = team(req, res);
    const verb = String((req.body as { state?: unknown } | undefined)?.state ?? '');
    if (!t) return;
    if (!isValidJobId(String(req.params.id)) || !['active', 'paused', 'now'].includes(verb)) return res.status(400).json({ error: 'Send { state: active | paused | now }.' });
    void answer(res, async () => ({ ok: true, job: await setJob(t, String(req.params.id), verb as 'active' | 'paused' | 'now') }));
  });
  app.delete('/api/teams/:team/jikan/:id', (req, res) => { const t = team(req, res); if (t) void answer(res, async () => ({ ok: isValidJobId(String(req.params.id)) && await removeJob(t, String(req.params.id)) }), 500); });
}

/** The tick, on the house's parts. Called once from index.ts. */
export const startHouseJikan = (): (() => void) => startJikan(houseDoor);
