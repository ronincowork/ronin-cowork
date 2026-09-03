/**
 * THE TEAM PAGE TAKES INSTRUCTIONS (owner, 2026-08-26): an agent on a team may read the
 * page its team is showing and hand it a DRAFT of how it should look. Three verbs:
 *
 *   PUT  /api/teams/:team/page/:tab   a browser tab reports its view (on change, and
 *                                     every few seconds as a heartbeat)
 *   GET  /api/teams/:team/page        the views the team's tabs reported — `?session=x`
 *                                     marks which tab shows that session
 *   POST /api/teams/:team/page        { from, tokens } — a draft, pushed to the tabs
 *
 * THE SERVER HOLDS NO PAGE STATE OF ITS OWN. Views are what tabs said, kept in memory
 * for thirty seconds; a draft is validated by its keys and pushed over /events, and
 * the PAGE applies it — the same `arrange()` its own buttons call, so an agent can do
 * exactly what the owner can do by hand and nothing else. Two tabs may show one team
 * (the owner runs a team tab beside a league tab): a draft goes to the tab that shows
 * the asking session, else to every tab on the team.
 *
 * The dial applies as it does for tejun-send: a session at 👤 or 👁 may not arrange.
 * A session may arrange only a team it is on. Nothing here is a bypass.
 */
import type express from 'express';
import { isValidName, listSessions } from '../tmux.js';
import { broadcastEvent } from '../ws/events.js';

const VIEW_TTL_MS = 30_000;
const KEYS = new Set(['workspace1', 'workspace2', 'roster', 'order', 'hidden', 'shown']);

interface View { tab: string; at: number; view: unknown; sessions: string[] }
const views = new Map<string, Map<string, View>>(); // team -> tab -> view

const fresh = (team: string): View[] => {
  const tabs = views.get(team);
  if (!tabs) return [];
  const now = Date.now();
  for (const [tab, v] of tabs) if (now - v.at > VIEW_TTL_MS) tabs.delete(tab);
  return [...tabs.values()].sort((a, b) => b.at - a.at);
};

const sessionsIn = (view: unknown): string[] => {
  const w = (view as { workspaces?: Record<string, { session?: string }> })?.workspaces || {};
  return Object.values(w).map((x) => x?.session || '').filter(Boolean);
};

export function registerTeamPage(app: express.Express): void {
  app.put('/api/teams/:team/page/:tab', (req, res) => {
    const { team, tab } = req.params;
    if (!/^[\w.-]{1,64}$/.test(team) || !/^[\w-]{1,40}$/.test(tab)) return res.status(400).json({ error: 'Invalid team or tab.' });
    const view = req.body?.view;
    if (!view || typeof view !== 'object') return res.status(400).json({ error: 'A view is required.' });
    if (!views.has(team)) views.set(team, new Map());
    views.get(team)!.set(tab, { tab, at: Date.now(), view, sessions: sessionsIn(view) });
    res.json({ ok: true });
  });

  app.get('/api/teams/:team/page', async (req, res) => {
    const { team } = req.params;
    const session = String(req.query.session ?? '');
    const list = fresh(team).map((v) => ({ tab: v.tab, at: v.at, showsYou: !!session && v.sessions.includes(session), view: v.view }));
    // The roster rides along: which sessions are on this team, and who leads it — the
    // agent should not need a second tool to know who it can put in a workspace.
    let roster: { name: string; lead: boolean; control: string }[] = [];
    try {
      roster = (await listSessions()).filter((s) => s.tags.includes(team)).map((s) => ({ name: s.name, lead: s.leads.includes(team), control: s.control }));
    } catch { /* the view still answers without it */ }
    res.json({ team, roster, tabs: list });
  });

  app.post('/api/teams/:team/page', async (req, res) => {
    const { team } = req.params;
    const from = String(req.body?.from ?? '');
    const tokens = Array.isArray(req.body?.tokens) ? req.body.tokens.map(String) : [];
    if (!isValidName(from)) return res.status(400).json({ error: 'Say which session is asking (from).' });
    if (!tokens.length) return res.status(400).json({ error: 'An empty draft changes nothing.' });
    const bad = tokens.filter((t: string) => !KEYS.has(t.split('=')[0]) || !t.includes('='));
    if (bad.length) return res.status(400).json({ error: `Not a draft line: ${bad.join(' ')}. Keys: ${[...KEYS].join(', ')}.` });
    try {
      const me = (await listSessions()).find((s) => s.name === from);
      if (!me) return res.status(404).json({ error: `No such session: ${from}.` });
      if (!me.tags.includes(team)) return res.status(403).json({ error: `${from} is not on team ${team}.` });
      const mine = fresh(team).find((v) => v.sessions.includes(from));
      const sent = broadcastEvent({ t: 'team-page', team, from, tab: mine?.tab ?? null, tokens, at: Date.now() });
      res.json({ ok: true, team, tab: mine?.tab ?? null, pages: sent });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
