/**
 * WHO IS WATCHING WHICH CONVERSATION.
 *
 * A browser tab showing an Agent's Chat says so once — `{t:'watch', session, reading}` on the
 * event socket it already holds — and from then on it is the only kind of tab that receives
 * that Agent's records. The owner's rule: *"a phone should not get hit by any msgs that are
 * not for a tab in chat mode on that phone."*
 *
 * One registration per connection, not a set: a tile shows one Agent in one reading at a
 * time, so a new `watch` REPLACES the old one. That is also what makes changing tile or
 * reading correct by construction — the tab re-registers and the previous interest is gone,
 * with nothing to unsubscribe and nothing to leak.
 *
 * This module knows nothing about what a reading means. It holds connections; the transcript
 * part decides what each reading admits.
 */
import type { WebSocket } from 'ws';

interface Watch { session: string; reading: string }

const watching = new Map<WebSocket, Watch>();

/** A tab said what it is showing. Replaces whatever that connection watched before. */
export function watchFor(ws: WebSocket, session: string, reading: string): void {
  if (!session) {
    watching.delete(ws);
    return;
  }
  watching.set(ws, { session, reading: reading || '' });
}

/** The socket went. Nothing is remembered for a tab that is not there. */
export function unwatch(ws: WebSocket): void {
  watching.delete(ws);
}

/** Diagnostic: how many connections are watching anything. */
export function watcherCount(): number {
  return watching.size;
}

/**
 * Hand a message to every connection watching this session.
 *
 * `make` is called once per distinct READING in play rather than once per connection, so
 * twenty tabs on one Agent cost one application of the reading. Returning null for a reading
 * sends those watchers nothing — which is how a Chat tab never receives a tool record.
 */
export function deliverToWatchers(session: string, make: (reading: string) => unknown | null): number {
  const byReading = new Map<string, { text: string | null }>();
  let sent = 0;
  for (const [ws, watch] of watching) {
    if (watch.session !== session) continue;
    if (ws.readyState !== ws.OPEN) continue;
    let made = byReading.get(watch.reading);
    if (!made) {
      const value = make(watch.reading);
      made = { text: value == null ? null : JSON.stringify(value) };
      byReading.set(watch.reading, made);
    }
    if (made.text === null) continue;
    ws.send(made.text);
    sent += 1;
  }
  return sent;
}
