import test from 'node:test';
import assert from 'node:assert/strict';
import { SETUP_SCENES, setupJourney } from '../public/js/setup-journey.js';

test('Scene 1 maps the selector door to its provider canvas and surface without reading readiness', () => {
  assert.deepEqual(setupJourney(), {
    id: 'provider', label: 'Model providers', type: 'setup.providers',
    canvas: 'library.setup.provider-welcome', number: 1,
  });
});

test('the explicit scene selector can inspect every stable scene', () => {
  assert.equal(SETUP_SCENES.length, 7);
  assert.equal(new Set(SETUP_SCENES.map(({ id }) => id)).size, 7);
  assert.equal(setupJourney(1).id, 'provider');
  assert.equal(setupJourney(5).id, 'password');
  assert.equal(setupJourney(7).id, 'launch');
  assert.equal(setupJourney(99).id, 'provider');
});
