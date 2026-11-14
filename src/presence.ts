/**
 * OFFICE PRESENCE — whether anyone is in the office (KAN-476), and in a hosted office who (KAN-478).
 *
 * `GET /api/health` carries `presence: { browsers, last_input_at, people }`. `browsers` is the
 * number of connected /events sockets; `last_input_at` is when a person last did something: the
 * last non-GET /api request from a browser, or null since this process started. Agents' tools
 * reach the server on the operator socket and are not people, so they never stamp it. On an
 * office_park the kohai reads it every 30 s.
 *
 * `people` is one entry per email with a connected /events socket, `{ email, role, last_input_at }`,
 * the email being the guard's X-Forwarded-Email on the socket's upgrade and the role from
 * members.json (src/office-people.ts). Self-hosted, or with no header, it is []. In memory only:
 * no body, no keystrokes.
 */
import type { IncomingMessage } from 'node:http';
import type express from 'express';
import type { WebSocket } from 'ws';
import { isOperatorPeer } from './operator-socket.js';
import { browserCount } from './ws/events.js';
import { person, roleOf } from './office-people.js';

let lastInputAt: string | null = null;
const personInputAt = new Map<string, string>();
const sockets = new Map<WebSocket, string>();

export function stampInput(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isOperatorPeer(req)) {
    lastInputAt = new Date().toISOString();
    const who = person(req);
    if (who) personInputAt.set(who.email, lastInputAt);
  }
  next();
}

/** An /events socket: who opened it, from its upgrade request, until it closes. */
export function joinPresence(ws: WebSocket, req: IncomingMessage): void {
  const who = person(req);
  if (!who) return;
  sockets.set(ws, who.email);
  const drop = () => { sockets.delete(ws); };
  ws.on('close', drop);
  ws.on('error', drop);
}

export const presence = () => ({
  browsers: browserCount(),
  last_input_at: lastInputAt,
  people: [...new Set(sockets.values())].map((email) => ({ email, role: roleOf(email), last_input_at: personInputAt.get(email) ?? null })),
});
