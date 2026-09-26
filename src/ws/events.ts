import { onClock } from '../jikan.js';
import { type WebSocket } from 'ws';
import { listSessions } from '../tmux.js';
import { tmux, type TmuxClient } from '../tmux-client.js';
import { withAxes } from '../tegami.js';
import { unwatch, watchFor } from './watchers.js';
import { emitTranscriptWatch } from '../sockets.js';

const eventClients = new Set<WebSocket>();
let lastSessionNames = '';
let sessionsRefresh: Promise<void> | undefined;

/*
 * PUSHED RESOURCES — the browser store holds what arrives here; nothing polls for them.
 * Each rides the sessions triggers (tmux notifications, the 2s clock), is sent only when
 * its signature moved, and is sent whole to a fresh connection. GET /api/home and
 * /api/desks remain only as the snapshot a reconnecting tab asks for.
 */
interface Pushed {
  t: 'home' | 'desks';
  field: 'rows' | 'list';
  load: () => Promise<unknown>;
  signature: (value: unknown) => string;
  last: string;
  value?: unknown;
  refresh?: Promise<boolean>;
}
let pushed: Pushed[] = [];

// The fields the UI paints: a row's `activity` and its stance `at` move on every turn and
// nothing under public/ shows them, so they never make a push on their own.
export function homeSignature(rows: unknown): string {
  return JSON.stringify((rows as Array<Record<string, unknown>>).map(({ activity: _activity, at: _at, ...painted }) => painted));
}

export function feedPushedResources(loaders: { home: () => Promise<unknown[]>; desks: () => Promise<unknown> }): void {
  pushed = [
    { t: 'home', field: 'rows', load: loaders.home, signature: homeSignature, last: '' },
    { t: 'desks', field: 'list', load: loaders.desks, signature: (list) => JSON.stringify(list), last: '' },
  ];
}

// Resolves true when this refresh broadcast, so a connection already in the set has it.
function refreshPushed(resource: Pushed): Promise<boolean> {
  if (eventClients.size === 0) return Promise.resolve(false);
  if (resource.refresh) return resource.refresh;
  resource.refresh = resource.load()
    .then((value) => {
      const signature = resource.signature(value);
      if (signature === resource.last) return false;
      resource.last = signature;
      resource.value = value;
      broadcastEvent({ t: resource.t, [resource.field]: value });
      return true;
    })
    .catch(() => false)
    .finally(() => { resource.refresh = undefined; });
  return resource.refresh;
}

export async function refreshPushedResources(): Promise<void> {
  await Promise.all(pushed.map(refreshPushed));
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
  void listSessions()
    .then(withAxes)
    .then((list) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'sessions', list }));
    })
    .catch(() => {});
  // A fresh connection gets each pushed resource exactly once: the refresh either broadcast
  // it (this socket is already in the set) or found nothing new, and then it is sent the
  // value every other connection holds.
  for (const resource of pushed) {
    void refreshPushed(resource).then((broadcast) => {
      if (broadcast || resource.value === undefined || ws.readyState !== ws.OPEN) return;
      ws.send(JSON.stringify({ t: resource.t, [resource.field]: resource.value }));
    });
  }
}

export function broadcastEvent(msg: Record<string, unknown>): number {
  const text = JSON.stringify(msg);
  let sent = 0;
  for (const ws of eventClients) if (ws.readyState === ws.OPEN) { ws.send(text); sent += 1; }
  return sent;
}

async function refreshSessions(force: boolean): Promise<void> {
  if (eventClients.size === 0) return;
  if (sessionsRefresh) return sessionsRefresh;
  sessionsRefresh = listSessions()
    .then(withAxes)
    .then((list) => {
      const names = list.map((session) => `${session.name}\t${session.tags.join(',')}\t${session.leads.join(',')}`).join('\n');
      if (!force && names === lastSessionNames) return;
      lastSessionNames = names;
      broadcastEvent({ t: 'sessions', list });
    })
    .catch(() => {})
    .finally(() => { sessionsRefresh = undefined; });
  return sessionsRefresh;
}

export function wireTmuxNotifications(client: Pick<TmuxClient, 'on'>, refresh: () => void): () => void {
  const unsubscribes = SESSION_NOTIFICATIONS.map((kind) => client.on(kind, refresh));
  // Registering this listener also installs tmux's one per-client `activity`
  // subscription. B4 consumes its parsed values after A3 lands.
  unsubscribes.push(client.on('subscription', () => undefined));
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export function startSessionsBroadcast(loaders: Parameters<typeof feedPushedResources>[0]): void {
  feedPushedResources(loaders);
  wireTmuxNotifications(tmux, () => { void refreshSessions(true); void refreshPushedResources(); });
  onClock('sessions_broadcast', 2000, async () => {
    await Promise.all([refreshSessions(false), refreshPushedResources()]);
  });
}
