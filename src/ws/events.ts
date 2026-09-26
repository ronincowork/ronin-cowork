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
 * listing and builds both messages from it: {t:'sessions', list} when names, Teams or leads
 * moved (or tmux said something did), and {t:'home', rows} when a painted field moved.
 * A fresh connection gets both whole, and that is a tab's snapshot: no browser asks
 * GET /api/home, which answers the same rows to anything that reads the route directly.
 */
export interface Feed {
  list: () => Promise<SessionInfo[]>;
  home: (sessions: SessionWithAxes[]) => Promise<unknown[]>;
}
let feed: Feed = { list: listSessions, home: async () => [] };
let lastSessionNames = '';
let lastHome = '';
// What every connected tab holds: a fresh connection is sent these when its own tick could
// not read them (a failed listing, or rows that did not change).
let heldSessions: SessionWithAxes[] | undefined;
let heldRows: unknown[] | undefined;
// A tick says who each broadcast reached, so a connection that joins one in flight is sent
// only what it missed.
type Tick = { reached: Map<string, ReadonlySet<WebSocket>> };
let ticking: Promise<Tick> | undefined;

// The fields the UI paints: a row's `activity` and its stance `at` move on every turn and
// nothing under public/ shows them, so they never make a push on their own.
export function homeSignature(rows: unknown): string {
  return JSON.stringify((rows as Array<Record<string, unknown>>).map(({ activity: _activity, at: _at, ...painted }) => painted));
}

export function feedEvents(next: Feed): void {
  feed = next;
  lastSessionNames = '';
  lastHome = '';
  heldSessions = undefined;
  heldRows = undefined;
}

export function tick(force: boolean): Promise<Tick> {
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
    const names = sessions.map((session) => `${session.name}\t${session.tags.join(',')}\t${session.leads.join(',')}`).join('\n');
    if (force || names !== lastSessionNames) {
      lastSessionNames = names;
      send({ t: 'sessions', list: sessions });
    }
    const rows = await feed.home(sessions).catch(() => undefined);
    const signature = rows && homeSignature(rows);
    if (rows && signature !== lastHome) {
      lastHome = signature!;
      heldRows = rows;
      send({ t: 'home', rows });
    }
    return { reached };
  })()
    .catch(() => ({ reached }))
    .finally(() => { ticking = undefined; });
  return ticking;
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
  // A fresh connection gets the session list and the home rows exactly once each: from the
  // tick's broadcast if it reached this socket, or else what every other connection holds.
  void tick(false).then(({ reached }) => {
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
  wireTmuxNotifications(tmux, () => { void tick(true); });
  onClock('sessions_broadcast', 2000, async () => {
    await tick(false);
  });
}
