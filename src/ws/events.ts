import { onClock } from '../jikan.js';
import { type WebSocket } from 'ws';
import { listSessions, type SessionInfo } from '../tmux.js';
import { tmux, type TmuxClient } from '../tmux-client.js';
import { withAxes, type SessionWithAxes } from '../tegami.js';
import { unwatch, watchFor } from './watchers.js';
import { emitTranscriptWatch } from '../sockets.js';

const eventClients = new Set<WebSocket>();

/*
 * THE PUSH — the browser store holds what arrives here; nothing polls for it. Each tick
 * (a tmux notification, or the 2s clock while a browser is connected) takes ONE session
 * listing and builds both messages from it: {t:'sessions', list} and {t:'home', rows}, each
 * sent only when a field the UI paints moved. {t:'teams', rosters} is the GET
 * /api/team-rosters answer, read once per roster write and sent when it moved. A fresh
 * connection gets all three whole, and that is a tab's snapshot: no browser asks GET
 * /api/home, which answers the same rows to anything that reads the route directly.
 */
export interface Feed {
  list: () => Promise<SessionInfo[]>;
  home: (sessions: SessionWithAxes[]) => Promise<unknown[]>;
  teams: () => Promise<unknown[]>;
}
let feed: Feed = { list: listSessions, home: async () => [], teams: async () => [] };
let lastSessions = '';
let lastHome = '';
let lastTeams = '';
// What every connected tab holds: a fresh connection is sent these when its own tick could
// not read them (a failed listing, or nothing that moved).
let heldSessions: SessionWithAxes[] | undefined;
let heldRows: unknown[] | undefined;
let heldRosters: unknown[] | undefined;
// A tick says who each broadcast reached, so a connection that joins one in flight is sent
// only what it missed.
type Tick = { reached: Map<string, ReadonlySet<WebSocket>> };
let ticking: Promise<Tick> | undefined;
// Roster reads run in write order, so an older read never lands after a newer one.
let teamsRead: Promise<void> = Promise.resolve();

// The fields the UI paints: `activity` moves on every keystroke and nothing under public/
// shows it, and a row's stance `at` is the same; neither makes a push on its own.
export function sessionsSignature(list: unknown): string {
  return JSON.stringify((list as Array<Record<string, unknown>>).map(({ activity: _activity, ...painted }) => painted));
}
export function homeSignature(rows: unknown): string {
  return JSON.stringify((rows as Array<Record<string, unknown>>).map(({ activity: _activity, at: _at, ...painted }) => painted));
}

export function feedEvents(next: Feed): void {
  feed = next;
  lastSessions = lastHome = lastTeams = '';
  heldSessions = heldRows = heldRosters = undefined;
  teamsRead = Promise.resolve();
}

export function tick(): Promise<Tick> {
  if (eventClients.size === 0) return Promise.resolve({ reached: new Map() });
  if (ticking) return ticking;
  const reached: Tick['reached'] = new Map();
  const send = (msg: { t: string } & Record<string, unknown>) => {
    broadcastEvent(msg);
    reached.set(msg.t, new Set(eventClients));
  };
  ticking = (async (): Promise<Tick> => {
    const sessions = await withAxes(await feed.list());
    heldSessions = sessions;
    const signature = sessionsSignature(sessions);
    if (signature !== lastSessions) {
      lastSessions = signature;
      send({ t: 'sessions', list: sessions });
    }
    const rows = await feed.home(sessions).catch(() => undefined);
    if (rows && homeSignature(rows) !== lastHome) {
      lastHome = homeSignature(rows);
      heldRows = rows;
      send({ t: 'home', rows });
    }
    return { reached };
  })()
    .catch(() => ({ reached }))
    .finally(() => { ticking = undefined; });
  return ticking;
}

// Called after every roster write: one read of the rosters for everybody, where each open
// tab used to re-read the route on a nudge.
export function pushTeams(): Promise<void> {
  teamsRead = teamsRead.then(async () => {
    const rosters = await feed.teams().catch(() => undefined);
    if (!rosters) return;
    const signature = JSON.stringify(rosters);
    if (signature === lastTeams) return;
    lastTeams = signature;
    heldRosters = rosters;
    broadcastEvent({ t: 'teams', rosters });
  });
  return teamsRead;
}

const SESSION_NOTIFICATIONS = [
  'sessions-changed',
  'session-renamed',
  'window-add',
  'window-close',
  'unlinked-window-add',
  'unlinked-window-close',
  'unlinked-window-renamed',
] as const;

export function handleEvents(ws: WebSocket): void {
  eventClients.add(ws);
  const drop = () => { eventClients.delete(ws); unwatch(ws); };
  ws.on('close', drop);
  ws.on('error', drop);
  // The one thing a browser says on this socket. Everything else it sends is ignored: this
  // is a feed, and an unknown message from a client is not a reason to drop the connection.
  ws.on('message', (raw) => {
    let msg: { t?: string; session?: unknown; reading?: unknown };
    try {
      msg = JSON.parse(String(raw)) as typeof msg;
    } catch {
      return;
    }
    if (msg?.t !== 'watch') return;
    const session = typeof msg.session === 'string' ? msg.session : '';
    watchFor(ws, session, typeof msg.reading === 'string' ? msg.reading : '');
    // Somebody is now looking at this Agent: a good moment for whoever follows journals to
    // make sure it is following this one. Already following is nothing at all; not following
    // means installing a watcher, which catches up what was missed.
    if (session) emitTranscriptWatch(session);
  });
  // A fresh connection gets each message exactly once. The rosters it is sent now, as every
  // other tab holds them; a later roster broadcast is a newer write. The session list and the
  // rows come from the tick's broadcast if it reached this socket, or else what the others hold.
  if (heldRosters) ws.send(JSON.stringify({ t: 'teams', rosters: heldRosters }));
  void tick().then(({ reached }) => {
    if (ws.readyState !== ws.OPEN) return;
    if (heldSessions && !reached.get('sessions')?.has(ws)) ws.send(JSON.stringify({ t: 'sessions', list: heldSessions }));
    if (heldRows && !reached.get('home')?.has(ws)) ws.send(JSON.stringify({ t: 'home', rows: heldRows }));
  });
}

export function broadcastEvent(msg: Record<string, unknown>): number {
  const text = JSON.stringify(msg);
  let sent = 0;
  for (const ws of eventClients) if (ws.readyState === ws.OPEN) { ws.send(text); sent += 1; }
  return sent;
}

export function wireTmuxNotifications(client: Pick<TmuxClient, 'on'>, refresh: () => void): () => void {
  const unsubscribes = SESSION_NOTIFICATIONS.map((kind) => client.on(kind, refresh));
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export function startSessionsBroadcast(next: Feed): void {
  feedEvents(next);
  void pushTeams();
  wireTmuxNotifications(tmux, () => { void tick(); });
  onClock('sessions_broadcast', 2000, async () => {
    await tick();
  });
}
