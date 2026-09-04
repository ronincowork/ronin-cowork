import { onClock } from '../jikan.js';
import { type WebSocket } from 'ws';
import { listSessions } from '../tmux.js';
import { tmux, type TmuxClient } from '../tmux-client.js';
import { withAxes } from '../tegami.js';

const eventClients = new Set<WebSocket>();
let lastSessionNames = '';
let sessionsRefresh: Promise<void> | undefined;

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
  const drop = () => eventClients.delete(ws);
  ws.on('close', drop);
  ws.on('error', drop);
  void listSessions()
    .then(withAxes)
    .then((list) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'sessions', list }));
    })
    .catch(() => {});
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

export function startSessionsBroadcast(): void {
  wireTmuxNotifications(tmux, () => { void refreshSessions(true); });
  onClock('sessions_broadcast', 2000, async () => {
    await refreshSessions(false);
  });
}
