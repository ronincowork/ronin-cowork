import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('w451: a push updates the People rows that moved and never redraws an opened configuration', async () => {
  const [view, members, composition, newAgent] = await Promise.all([
    source('public/js/cowork-view.js'), source('public/js/team-members.js'),
    source('public/js/agent-composition.js'), source('public/js/new-agent.js'),
  ]);
  // The view keeps one list per seat and Team and updates it; it builds a new one only for a new Team.
  assert.match(view, /if \(held\?\.team === team\) held\.update\(\);/);
  // Each row redraws only its head line, and only when what it shows moved.
  assert.match(members, /if \(now === shown\) return;/);
  assert.match(members, /rows\.get\(member\.name\)\.update\(member\)/);
  assert.doesNotMatch(members, /content\.append\(\.\.\.members\.map\(memberRow\)\)/);
  // Re-laid only when the order moved, so a focused field is not blurred.
  assert.match(members, /if \(order\.some\(\(node, index\) => content\.children\[index\] !== node\)/);
  // Reopening a row with an unsent draft keeps it.
  assert.match(members, /if \(!asked \|\| !composition\.dirty\(\)\) void composition\.show\(\);/);
  assert.match(composition, /dirty: view\.dirty/);
  assert.match(newAgent, /dirty: \(\) => !!configure && loaded && JSON\.stringify\(configurationValue\(\)\) !== configured/);
  // Send answers the press.
  assert.match(newAgent, /t\('agent_composition\.sending', 'Sending…'\)/);
});
