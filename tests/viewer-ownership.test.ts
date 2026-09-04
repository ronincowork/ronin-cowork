/**
 * Real-tmux regression for the viewer leak of 2026-09-04. A viewer is only
 * reclaimable if the ownership mark actually reaches tmux; a pure predicate test
 * cannot prove the target syntax was accepted by the installed tmux version.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeTestServer, openTestServer } from './helpers/testserver.js';
import { createViewer, VIEWER_OPT, viewerOwner } from '../src/viewer.js';
import { exactPane } from '../src/tmux.js';

test('a created viewer carries the ownership mark tmux cleanup reads back', async (t) => {
  const server = await openTestServer('viewer_ownership', { onPath: true });
  t.after(() => closeTestServer(server));
  await server.run('new-session', '-d', '-s', 'owner_target');

  const viewer = await createViewer('owner_target', 'probe');
  const mark = await server.run('show-option', '-qv', '-t', exactPane(viewer), VIEWER_OPT);

  assert.equal(mark, viewerOwner());
});
