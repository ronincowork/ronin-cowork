import test from 'node:test';
import assert from 'node:assert/strict';
import { firstUnansweredSetupStep, setupIsComplete, setupSteps } from '../public/js/setup-progress.js';

test('Setup progress paints only the server-owned five-step payload', () => {
  const progress = { steps: [
    { id: 'provider', number: 1, answered: true }, { id: 'register', number: 2, answered: true },
    { id: 'workspace', number: 3, answered: true }, { id: 'installations', number: 4, answered: true },
    { id: 'password', number: 5, answered: true }, { id: 'unknown', number: 6, answered: true },
  ] };
  assert.deepEqual(setupSteps(progress).map(({ id, number, answered }) => ({ id, number, answered })), progress.steps.slice(0, 5));
  assert.equal(setupIsComplete(progress), true);
});

test('first unanswered follows the payload and never reads machine readiness', () => {
  const progress = { steps: [{ id: 'provider', answered: true }, { id: 'register', answered: true }] };
  assert.equal(firstUnansweredSetupStep(progress), 'workspace');
  assert.equal(setupIsComplete(progress), false);
  assert.equal(firstUnansweredSetupStep({ activated_count: 4 }), 'provider');
});
