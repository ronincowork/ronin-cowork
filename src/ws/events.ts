import { onClock } from '../jikan.js';
import { type WebSocket } from 'ws';
import { listSessions } from '../tmux.js';
import { withAxes } from '../tegami.js';

const eventClients = new Set<WebSocket>();

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

export function startSessionsBroadcast(): void {
  let lastSessionNames = '';
  onClock('sessions_broadcast', 2000, async () => {
    if (eventClients.size === 0) return;
    await listSessions()
      .then(withAxes)
      .then((list) => {
        const names = list.map((s) => `${s.name}\t${s.tags.join(',')}\t${s.leads.join(',')}`).join('\n');
        if (names === lastSessionNames) return;
        lastSessionNames = names;
        const msg = JSON.stringify({ t: 'sessions', list });
        for (const ws of eventClients) if (ws.readyState === ws.OPEN) ws.send(msg);
      })
      .catch(() => {});
  });
}
