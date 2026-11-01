/**
 * WHO IS WATCHING WHICH CONVERSATION.
 *
 * A browser tab says, on the event socket it already holds, every Agent and reading it is
 * showing: `{t:'watch', watches: [{session, reading}, …]}`, one entry per tile in Chat. The
 * owner's rule: *"a phone should not get hit by any msgs that are not for a tab in chat mode on
 * that phone."*
 *
 * A LIST PER CONNECTION, NOT ONE SLOT. A page holds several tiles. With one slot, any tile that
 * stopped showing its Chat (switched to Term, parked, closed) cleared the slot for the whole
 * tab, and another tile's Chat stopped hearing its Agent until it was reopened (owner,
 * 2026-11-01: "the balls stopped bouncing and then nothing"). Each message replaces the
 * connection's whole list, so there is still nothing to unsubscribe and nothing to leak.
 *
 * This module knows nothing about what a reading means. It holds connections; the transcript
 * part decides what each reading admits.
 */
import type { WebSocket } from 'ws';

export interface Watch { session: string; reading: string }

const watching = new Map<WebSocket, Watch[]>();

/** A tab said everything it is showing. Replaces what that connection watched before. */
export function watchFor(ws: WebSocket, watches: readonly Watch[]): void {
  const list = watches.filter((w) => w.session).map((w) => ({ session: w.session, reading: w.reading || '' }));
  if (list.length) watching.set(ws, list);
  else watching.delete(ws);
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
  const byReading = new Map<string, string | null>();
  const text = (reading: string): string | null => {
    if (!byReading.has(reading)) {
      const value = make(reading);
      byReading.set(reading, value == null ? null : JSON.stringify(value));
    }
    return byReading.get(reading) ?? null;
  };
  let sent = 0;
  for (const [ws, watches] of watching) {
    if (ws.readyState !== ws.OPEN) continue;
    // Two tiles on one Agent in one reading are one message: the page hands it to both.
    const readings = new Set(watches.filter((w) => w.session === session).map((w) => w.reading));
    for (const reading of readings) {
      const message = text(reading);
      if (message === null) continue;
      ws.send(message);
      sent += 1;
    }
  }
  return sent;
}
