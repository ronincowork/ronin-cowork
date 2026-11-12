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
  // The kit's keyed list (KAN-413): kept rows, laid out only where the order moved, so a focused field is not blurred.
  assert.match(members, /createKeyedList\(\{ key: \(member\) => member\.name/);
  assert.match(members, /rows\.set\(content, members\.length \? members : \[\{ name: '!empty', empty: true \}\]\)/);
  assert.doesNotMatch(members, /content\.replaceChildren|content\.append\(\.\.\.members\.map\(memberRow\)\)/);
  // Reopening a row with an unsent draft keeps it.
  assert.match(members, /if \(!asked \|\| !composition\.dirty\(\)\) void composition\.show\(\);/);
  assert.match(composition, /dirty: view\.dirty/);
  assert.match(newAgent, /dirty: \(\) => !!configure && loaded && JSON\.stringify\(configurationValue\(\)\) !== configured/);
  // Send answers the press.
  assert.match(newAgent, /t\('agent_composition\.sending', 'Sending…'\)/);
});
