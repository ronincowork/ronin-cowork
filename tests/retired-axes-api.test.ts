/**
 * THE RETIRED AXES REFUSE OUT LOUD — they do not merely fail to exist.
 *
 * Retired launch and identity axes died at this path, and each answers 410 naming what
 * replaced it (R35, 2026-08-23): `session_job` (split 2026-08-22), `family_role` /
 * `role_family` (the immutable session axis that split created — dismantled: identity
 * moved onto the TEAM's roster, contextual per team, never a session attribute), and
 * `session_task` (renamed `session_role`). A 404 reads as "Ronin is broken"; a model
 * the product deliberately moved has to SAY so.
 *
 * These assert the CONTRACT at the router, with no tmux and no live box: express is
 * mounted with only the routes under test, because what is being tested is which
 * answer each key gets rather than what a session is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';

process.env.BIND = '127.0.0.1'; // src/config.ts must not shell `tailscale` at import
const { registerSessions } = await import('../src/routes/sessions-api.js');

const app = express();
app.use(express.json());
registerSessions(app);
const server: Server = createServer(app);
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

/** A name that is valid but names no live session, so the handlers answer for themselves
 *  rather than depending on what happens to be running on this box. */
const NAME = 'zz_no_such_session';

test('every retired axis key answers 410 and points at what replaced it', async () => {
  for (const retired of ['session_job', 'family_role', 'session_task', 'role_family', 'team_role', 'campaign_kind', 'lifecycle']) {
    const r = await fetch(`${base}/api/sessions/${NAME}/${retired}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [retired]: 'CutCode' }),
    });
    assert.equal(r.status, 410, `${retired}: this door existed and is gone — not a typo`);
    const body = await r.json();
    assert.match(body.error, /retired/);
    assert.match(body.error, /session_role/, 'it names the axis that lives');
    assert.match(body.error, /team_role|team/, 'and where identity went');
  }
});

test('every verb gets the same 410 — a GET of a retired axis is as gone as a POST', async () => {
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
    const r = await fetch(`${base}/api/sessions/${NAME}/family_role`, { method });
    assert.equal(r.status, 410, `${method} must be told the same thing`);
  }
});

test('the live axis ignores retired and unknown body keys, then proceeds with the request', async () => {
  const r = await fetch(`${base}/api/sessions/${NAME}/session_role`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_role: 'CutCode', role_family: 'developer', unknown: true }),
  });
  assert.equal(r.status, 404, 'ignored body members do not answer before the ordinary session lookup');
  assert.match((await r.json()).error, /No such session/);
});

test.after(() => server.close());
