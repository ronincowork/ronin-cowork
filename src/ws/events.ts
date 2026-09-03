/**
 * Lifecycle events (one per BROWSER PAGE, not per tile): a tiny /events socket that
 * pushes `{t:'sessions', list}` whenever the session list's MEMBERSHIP changes —
 * birth and death are one event stream. Fed by one cheap `tmux list-sessions` every
 * 2s, skipped entirely while no browser is listening; attach/note flapping is
 * deliberately not an event. No new transport, no new dependency.
 */
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
  // Snapshot on connect so a fresh page starts current without a separate fetch.
  void listSessions()
    .then(withAxes)
    .then((list) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'sessions', list }));
    })
    .catch(() => {});
}

/** One message to every listening page. The team page's instructions ride this (src/routes/team-page-api.ts). */
export function broadcastEvent(msg: Record<string, unknown>): number {
  const text = JSON.stringify(msg);
  let sent = 0;
  for (const ws of eventClients) if (ws.readyState === ws.OPEN) { ws.send(text); sent += 1; }
  return sent;
}

/** The 2s membership poll, on JIKAN's clock (src/jikan.ts). Called once at boot — a timer is a choice index.ts makes, not an import side effect. */
export function startSessionsBroadcast(): void {
  let lastSessionNames = '';
  onClock({ name: 'sessions_broadcast', everyMs: 2000, run: async () => {
    if (eventClients.size === 0) return;
    await listSessions()
      .then(withAxes)
      .then((list) => {
        // The watched string carries the SESSION_TASK as well as the name. Membership is
        // not the only thing the client draws off this list any more: a session that
        // re-marks itself (`write_tegami`) changes its mark on every picker and tile
        // header, and a poll watching names alone would hold the old icon until something
        // was born or died. The `role_family` is deliberately NOT watched — it cannot change
        // while a session lives, so a change in it is not a thing that can happen. The
        // tags and the leads ARE watched: the Team page reads its membership and its 人
        // off this list live, and a tag-only join or leave was invisible until something
        // else moved (2026-08-26). Still a push only when something actually changed —
        // attach and note flapping stay deliberately unwatched.
        const names = list.map((s) => `${s.name}\t${s.tags.join(',')}\t${s.leads.join(',')}`).join('\n');
        if (names === lastSessionNames) return;
        lastSessionNames = names;
        const msg = JSON.stringify({ t: 'sessions', list });
        for (const ws of eventClients) if (ws.readyState === ws.OPEN) ws.send(msg);
      })
      .catch(() => {});
  } });
}
