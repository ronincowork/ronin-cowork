import type express from 'express';
import { homedir } from 'node:os';
import { addJob, isValidJobId, isValidTeam, listAllJobs, listJobs, nextRun, parseWhen, removeJob, setJob, startJikan, updateJob, type Door } from '../jikan.js';
import { attemptMessage, enqueueMessage } from '../message-queue.js';
import { listSessions } from '../tmux.js';

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');

export const houseDoor: Door = {
  now: () => Date.now(),
  sessions: async () => (await listSessions()).map((s) => ({ name: s.name, tags: s.tags, leads: s.leads })),
  deliver: async (target, text) => ((await attemptMessage((await enqueueMessage(target, text, 'jikan')).id, 'safe')) ? 'queued' : 'delivered'),
};

export function registerJikan(app: express.Express): void {
  app.get('/api/jikan/when', (req, res) => {
    const spec = parseWhen(String(req.query?.words ?? '').slice(0, 120));
    if (!spec) return res.status(400).json({ error: 'Choose a date and time, a daily or weekly time, or an interval. Advanced schedules accept the house grammar.' });
    const next: string[] = [];
    for (let t = Date.now(), i = 0; i < 3; i++) { const n = nextRun(spec, t); if (n === null) break; next.push(new Date(n).toISOString()); t = n; }
    res.json({ next });
  });
  app.get('/api/jikan', (_req, res) => { void answer(res, async () => ({ jobs: await listAllJobs() }), 500); });

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
    if (t) void answer(res, async () => ({ ok: true, job: await addJob(t, { request: b.request, to: b.to, when: b.when, expires: b.expires, by: 'owner' }) }));
  });
  app.put('/api/teams/:team/jikan/:id', (req, res) => {
    const t = team(req, res);
    const verb = String((req.body as { state?: unknown } | undefined)?.state ?? '');
    if (!t) return;
    if (!isValidJobId(String(req.params.id))) return res.status(400).json({ error: 'No such job.' });
    if (['active', 'paused', 'now'].includes(verb)) void answer(res, async () => ({ ok: true, job: await setJob(t, String(req.params.id), verb as 'active' | 'paused' | 'now') }));
    else void answer(res, async () => ({ ok: true, job: await updateJob(t, String(req.params.id), { request: (req.body as any)?.request, to: (req.body as any)?.to, when: (req.body as any)?.when, expires: (req.body as any)?.expires }) }));
  });
  app.delete('/api/teams/:team/jikan/:id', (req, res) => { const t = team(req, res); if (t) void answer(res, async () => ({ ok: isValidJobId(String(req.params.id)) && await removeJob(t, String(req.params.id)) }), 500); });
}

export const startHouseJikan = (): (() => void) => startJikan(houseDoor);
