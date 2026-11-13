/**
 * OFFICE PRESENCE — whether anyone is in the office, never who (KAN-476).
 *
 * `GET /api/health` carries `presence: { browsers, last_input_at }`. `browsers` is the number
 * of connected /events sockets; `last_input_at` is when a person last did something: the last
 * non-GET /api request from a browser, or null since this process started. Agents' tools reach
 * the server on the operator socket and are not people, so they never stamp it. In memory only:
 * no identity, no body, no keystrokes. On an office_park the kohai reads it every 30 s.
 */
import type express from 'express';
import { isOperatorPeer } from './operator-socket.js';
import { browserCount } from './ws/events.js';

let lastInputAt: string | null = null;

export function stampInput(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isOperatorPeer(req)) lastInputAt = new Date().toISOString();
  next();
}

export const presence = () => ({ browsers: browserCount(), last_input_at: lastInputAt });
