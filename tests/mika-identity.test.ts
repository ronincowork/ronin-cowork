import test from 'node:test';
import assert from 'node:assert/strict';
import { isMikaBirthReceipt, MIKA_SESSION } from '../src/mika-identity.js';
import { acceptedLaunchBody, mikaLaunchBody } from '../src/routes/launch.js';
import { readFile } from 'node:fs/promises';

test('Mika identity requires exact house seat, canonical session, and current conversation key', () => {
  const valid = { house_seat: 'mika', session: MIKA_SESSION, conversation: 'mika_agent-123' };
  assert.equal(isMikaBirthReceipt(valid, 'mika_agent-123'), true);
  assert.equal(isMikaBirthReceipt({ ...valid, house_seat: '' }, 'mika_agent-123'), false);
  assert.equal(isMikaBirthReceipt({ ...valid, session: 'mika' }, 'mika_agent-123'), false);
  assert.equal(isMikaBirthReceipt(valid, 'mika_agent-456'), false, 'a stale receipt cannot authenticate name reuse');
});

test('house identity is server-owned and naked mika remains ordinary', () => {
  const supplied = acceptedLaunchBody({ name: MIKA_SESSION, house_seat: 'mika' });
  assert.equal(supplied.body.house_seat, undefined);
  assert.ok(supplied.ignored.includes('house_seat'));
  assert.equal(acceptedLaunchBody({ name: 'mika' }).body.name, 'mika');
  assert.equal(mikaLaunchBody({}).name, MIKA_SESSION);
});

test('ordinary birth reserves mika_agent and the CLI uses verified ready/send only', async () => {
  const [launch, cli] = await Promise.all([
    readFile(new URL('../src/routes/launch.ts', import.meta.url), 'utf8'),
    readFile(new URL('../ronin_bin/mika', import.meta.url), 'utf8'),
  ]);
  assert.match(launch, /name === MIKA_SESSION && houseSeat !== MIKA_HOUSE_SEAT/);
  assert.match(launch, /code: 'reserved_house_session'/);
  assert.match(launch, /post\('\/api\/mika\/send'/);
  assert.match(cli, /\/api\/mika\/ready/);
  assert.match(cli, /\/api\/mika\/send/);
  assert.doesNotMatch(cli, /tmux has-session|tejun-send/);
});
