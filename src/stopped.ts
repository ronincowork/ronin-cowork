/**
 * A STOP RONIN SENT (w414). A Stop that lands before the Agent's first reply leaves no line in
 * its log (Claude Code puts the prompt back in its input), so the log alone keeps reading
 * working. Ronin sent the Stop and knows it did: the Agent's home row says stopped (stance
 * interrupted, `stopped_at`) until one of two things Core already sees: the Agent writes a
 * line (its stance reading moves), or Ronin delivers it a message. No timer, no polling. Every
 * provider: one with no log keeps it until the next send.
 */
import { sockets } from './sockets.js';

// The newest line the Agent had written when the Stop went (its stance reading's `at`).
const stops = new Map<string, { at: string; line: string }>();

/** A Stop went to a working (or asking, or unread) Agent; an Agent already at a turn's end has nothing to stop. */
export function noteStop(session: string, reading: { stance?: unknown; at?: unknown }): void {
  if (['awaiting_you', 'interrupted', 'error'].includes(String(reading.stance))) return;
  stops.set(session, { at: new Date().toISOString(), line: String(reading.at ?? '') });
  sockets.rowChanged(session);
}

/** A message went to the Agent: it is working again. */
export function clearStop(session: string): void {
  if (stops.delete(session)) sockets.rowChanged(session);
}

/** When the row says stopped: the Stop's time, while the Agent has written nothing since. */
export function stoppedAt(session: string, readingAt: unknown): string | undefined {
  const stop = stops.get(session);
  if (!stop) return undefined;
  if (String(readingAt ?? '') !== stop.line) { stops.delete(session); return undefined; }
  return stop.at;
}
