import test from 'node:test';
import assert from 'node:assert/strict';
import { SETUP_SCENES, setupJourney } from '../public/js/setup-journey.js';

test('Scene 1 maps the selector door to its provider canvas and surface', () => {
  assert.deepEqual(setupJourney({ activated_count: 0 }), {
    id: 'provider', label: 'Model providers', type: 'setup.providers',
    canvas: 'library.setup.provider-welcome', number: 1,
  });
});

test('a ready provider opens the first unfinished developer step', () => {
  const scene = setupJourney({ activated_count: 1 });
  assert.equal(scene.id, 'workspace');
  assert.equal(scene.number, 3);
  assert.equal(scene.type, 'setup.roots');
});

test('the explicit scene selector can inspect every stable scene', () => {
  assert.equal(SETUP_SCENES.length, 7);
  assert.equal(new Set(SETUP_SCENES.map(({ id }) => id)).size, 7);
  assert.equal(setupJourney({ activated_count: 2 }, 1).id, 'provider');
  assert.equal(setupJourney({ activated_count: 0 }, 5).id, 'password');
  assert.equal(setupJourney({ activated_count: 0 }, 7).id, 'launch');
  assert.equal(setupJourney({ activated_count: 0 }, 99).id, 'provider');
});
