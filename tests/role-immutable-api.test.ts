/**
 * THE ROLE AXIS REFUSES OUT LOUD — it does not merely fail to exist.
 *
 * `job_role` is fixed at birth: the seed is its only writer, no UI offers to change it,
 * and `write_tegami` carries it through untouched. That rule was enforced everywhere
 * EXCEPT at the one place somebody would go looking for it — there was no
 * `/api/sessions/:name/job_role` route at all, so an attempt to set one got Express's own
 * 404. The owner hit exactly that on 2026-08-22 while trying to set a role to
 * `quarterback`, which is wrong twice over: the axis is immutable, and `QuarterBack` is a
 * session_task rather than a role (R33).
 *
 * A 404 reads as "Ronin is broken". A rule the product means to enforce has to SAY so, so
 * the door exists and answers.
 *
 * These assert the CONTRACT at the router, with no tmux and no live box: express is
 * mounted with only the routes under test, and the session lookup is stubbed, because
 * what is being tested is which answer each verb gets rather than what a session is.
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

test('setting a job_role is refused with 405 and an explanation, never a bare 404', async () => {
  const r = await fetch(`${base}/api/sessions/${NAME}/job_role`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ job_role: 'developer' }),
  });
  assert.equal(r.status, 405, 'the resource exists; the verb does not');
  assert.equal(r.headers.get('allow'), 'GET', 'and the protocol says which verb does');
  const body = await r.json();
  assert.match(body.error, /fixed at birth/);
  assert.match(body.error, /new session rather than a new value/, 'it says what to do instead');
});

test('a session_task posted at the role axis is told which axis it belongs to', async () => {
  // The exact near-miss that prompted this: `QuarterBack` is a task, not a role.
  const r = await fetch(`${base}/api/sessions/${NAME}/job_role`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ job_role: 'QuarterBack' }),
  });
  assert.equal(r.status, 405);
  const body = await r.json();
  assert.match(body.error, /is a session_task in any case, not a job_role/);
  assert.match(body.error, /\/session_task/, 'and points at the axis that moves');
});

test('every write verb is refused, not just POST', async () => {
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const r = await fetch(`${base}/api/sessions/${NAME}/job_role`, { method });
    assert.equal(r.status, 405, `${method} must be refused the same way`);
  }
});

test('the retired session_job key is 410, so an old caller is told what replaced it', async () => {
  const r = await fetch(`${base}/api/sessions/${NAME}/session_job`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_job: 'CutCode' }),
  });
  assert.equal(r.status, 410, 'this door existed and is gone — not a typo');
  const body = await r.json();
  assert.match(body.error, /session_job is retired/);
  assert.match(body.error, /job_role/);
  assert.match(body.error, /session_task/);
});

test('the task axis still refuses a job_role in its body, with its own message', async () => {
  // The guard that already worked, kept honest: the two refusals must not disagree.
  const r = await fetch(`${base}/api/sessions/${NAME}/session_task`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_task: 'CutCode', job_role: 'developer' }),
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /fixed at birth/);
});

test.after(() => server.close());
