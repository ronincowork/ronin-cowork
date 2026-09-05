import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-registration-'));
process.env.RONIN_CONFIG_DIR = path.join(root, 'config');
process.env.RONIN_SERVICES_SECRETS_DIR = path.join(root, 'secrets');

const { readRegistration, registrationAnswer, submitRegistration, updateCommunication } = await import('../src/activation/registration.js');

test('registration begins optional with communication explicitly off', async () => {
  const answer = await registrationAnswer();
  assert.equal(answer.status, 'optional');
  assert.equal(answer.services_entitled, false);
  assert.deepEqual(answer.communication, {
    newsletter: false, release_updates: false, follow_up: [], no_communication: true,
  });
});

test('registration records purpose fields but never stores the plain email', async () => {
  await submitRegistration({
    email: 'person@example.com', purpose: 'Build a product', kind: 'work',
    user_type: 'individual', own_words: 'Keep the setup small.',
  });
  const record = await readRegistration();
  assert.equal(record.email_masked, 'p*****@example.com');
  assert.equal(record.purpose, 'Build a product');
  assert.equal(record.user_type, 'individual');
  assert.equal(JSON.stringify(record).includes('person@example.com'), false);
  assert.equal((await registrationAnswer()).status, 'pending', 'submission is not entitlement');
});

test('communication remains independent and No communication clears other choices', async () => {
  let record = await updateCommunication({ newsletter: true, release_updates: true, follow_up: ['research'] });
  assert.equal(record.communication.newsletter, true);
  assert.equal(record.communication.no_communication, false);
  record = await updateCommunication({ newsletter: true, release_updates: true, follow_up: ['research'], no_communication: true });
  assert.deepEqual(record.communication, {
    newsletter: false, release_updates: false, follow_up: [], no_communication: true,
  });
});

test('registration rejects a missing or malformed email', async () => {
  await assert.rejects(submitRegistration({ email: 'not-an-email' }), /valid email/);
});

test('setup surface definitions keep all six ruled ids and gates only Library and Share', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  for (const id of ['setup.register', 'setup.providers', 'setup.roots', 'setup.services', 'setup.gbrain', 'setup.templates']) assert.match(source, new RegExp(id.replace('.', '\\.')));
  assert.match(source, /Loaded Templates/);
  assert.match(source, /Make Your Own Template/);
  assert.match(source, /Ronin Library/);
  assert.match(source, /Share Yours/);
  assert.match(source, /mode === 'library'[\s\S]*entitled/);
});
