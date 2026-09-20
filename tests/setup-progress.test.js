import test from 'node:test';
import assert from 'node:assert/strict';
import { firstUnansweredSetupStep, setupAnswers, setupIsComplete } from '../public/js/setup-progress.js';

test('Setup progress is only the five explicit persisted Campaign answers', () => {
  const campaign = { config: { setup: { answers: {
    provider: 'acted', register: 'not_now', workspace: 'acted', installations: 'not_now',
    password: 'acted', launch: 'acted', unknown: 'acted',
  } }, providers: { activated_count: 0 } } };
  assert.deepEqual(setupAnswers(campaign), {
    provider: 'acted', register: 'not_now', workspace: 'acted', installations: 'not_now', password: 'acted',
  });
  assert.equal(setupIsComplete(campaign), true);
});

test('first unanswered is stable and never guessed from machine readiness', () => {
  const campaign = { config: { setup: { answers: { provider: 'acted', register: 'not_now' } } }, providers: { activated_count: 4 } };
  assert.equal(firstUnansweredSetupStep(campaign), 'workspace');
  assert.equal(setupIsComplete(campaign), false);
  assert.equal(firstUnansweredSetupStep({ config: {}, providers: { activated_count: 4 } }), 'provider');
});
