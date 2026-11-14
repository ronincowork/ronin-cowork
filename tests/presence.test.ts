import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type express from 'express';
import type { WebSocket } from 'ws';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-presence-'));
process.env.RONIN_OFFICE_UNIT_DIR = dir;
const { presence, stampInput, joinPresence } = await import('../src/presence.js');
const people = await import('../src/office-people.js');

const req = (method: string, email?: string) => ({ method, headers: email ? { 'x-forwarded-email': email } : {} });
const hit = (method: string, email?: string) => stampInput(req(method, email) as unknown as express.Request, {} as express.Response, () => {});
const socket = (email?: string) => { const ws = new EventEmitter(); joinPresence(ws as unknown as WebSocket, req('GET', email) as unknown as IncomingMessage); return ws; };

test('presence counts browsers and stamps only a non-GET request as a person acting', () => {
  assert.deepEqual(presence(), { browsers: 0, last_input_at: null, people: [] });
  hit('GET'); hit('HEAD');
  assert.equal(presence().last_input_at, null, 'reading is not acting');
  hit('POST');
  const at = presence().last_input_at;
  assert.ok(at && !Number.isNaN(Date.parse(at)), 'an ISO time');
});

test('self-hosted: a forwarded email is not trusted, people stays []', async () => {
  await people.startOfficePeople();
  socket('a@x.com');
  assert.equal(people.person(req('GET', 'a@x.com') as unknown as IncomingMessage), null);
  assert.deepEqual(presence().people, []);
});

test('hosted office: people by email with role from members.json, re-read on change', async () => {
  await fs.writeFile(path.join(dir, 'office_record.json'), JSON.stringify({ office_id: 'o1', office_park: 'office-park-1', gateway_office: 'http://10.0.0.2:4912', provisioned_at: '2026-11-14T09:00:00Z' }));
  await fs.writeFile(people.membersFile(), JSON.stringify({ members: [{ email: 'a@x.com', role: 'owner' }, { email: 'b@y.com', role: 'member', name: 'Bo\nYu', organization: 'Y Ltd', later: 1 }], at: '2026-11-14T09:00:00Z' }));
  const unwatch = await people.startOfficePeople();

  assert.equal(people.person(req('GET') as unknown as IncomingMessage), null, 'no header is a local caller');
  assert.deepEqual(people.person(req('GET', 'A@X.com') as unknown as IncomingMessage), { email: 'a@x.com', role: 'owner' }, 'email only, the case today');
  assert.deepEqual(people.person(req('GET', 'b@y.com') as unknown as IncomingMessage), { email: 'b@y.com', role: 'member', name: 'Bo Yu', organization: 'Y Ltd' }, 'name and organization when present');

  const a1 = socket('a@x.com'); socket('a@x.com'); socket('b@y.com'); socket('c@z.com'); socket();
  hit('POST', 'b@y.com');
  const p = presence().people;
  assert.deepEqual(p.map((x) => [x.email, x.role]), [['a@x.com', 'owner'], ['b@y.com', 'member'], ['c@z.com', null]], 'one entry per email');
  assert.equal(p.find((x) => x.email === 'a@x.com')?.last_input_at, null);
  assert.ok(p.find((x) => x.email === 'b@y.com')?.last_input_at);

  await fs.writeFile(people.membersFile(), JSON.stringify({ members: [{ email: 'a@x.com', role: 'owner' }, { email: 'c@z.com', role: 'follower' }], at: '2026-11-14T10:00:00Z' }));
  for (let i = 0; i < 50 && people.roleOf('c@z.com') !== 'follower'; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(people.roleOf('c@z.com'), 'follower', 'a membership change is read back');
  assert.equal(people.roleOf('b@y.com'), null);

  a1.emit('close');
  assert.equal(presence().people.filter((x) => x.email === 'a@x.com').length, 1, 'a second socket keeps a@x.com in');
  unwatch();
});
