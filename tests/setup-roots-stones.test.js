import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Setup opts into roots stones while Campaign keeps the existing project-root surface', async () => {
  const [setup, campaign] = await Promise.all([
    source('public/js/setup-surfaces.js'),
    source('public/js/campaign-view.js'),
  ]);
  assert.match(setup, /buildProjectRoots\([^;]+\{ presentation: 'stones' \}\)/);
  assert.doesNotMatch(campaign, /presentation: 'stones'/);
});

test('roots adapt the real project-root blocks and Add form to the shared stone work surface', async () => {
  const roots = await source('public/js/projectroots.js');
  assert.match(roots, /options\.presentation === 'stones'/);
  assert.match(roots, /import \{ createStoneWorkSurface \} from '\.\/stone-work-surface\.js'/);
  assert.match(roots, /stoneSurface = createStoneWorkSurface/);
  assert.match(roots, /if \(current\) host\.append\(block\(current\)\)/);
  assert.match(roots, /stoneSurface\.openDetail\(\{ id: NEW/);
  assert.match(roots, /stoneSurface\.refreshDetail\(\)/);
  assert.match(roots, /secondary: r\.remit \|\| r\.dir/);
  assert.match(roots, /createFolderPicker/);
  assert.match(roots, /\/api\/project-roots\/inspect/);
  assert.match(roots, /\/repo-profile/);
});

test('roots carry no parallel stone DOM or CSS presentation', async () => {
  const [roots, css] = await Promise.all([
    source('public/js/projectroots.js'),
    source('public/style.css'),
  ]);
  assert.doesNotMatch(roots, /className = 'pr-stone'/);
  assert.doesNotMatch(roots, /aria-pressed/);
  assert.doesNotMatch(css, /\.setup-roots-stones \.pr-stone/);
  assert.doesNotMatch(css, /--pr-stone/);
});

test('roots stones mount visible loading, empty, and failure output without changing Campaign roots', async () => {
  const roots = await source('public/js/projectroots.js');
  assert.match(roots, /messages\.className = 'pr-status'/);
  assert.match(roots, /messages\.setAttribute\('role', 'status'\)/);
  assert.match(roots, /root\.append\(head, messages, stoneSurface\.el\)/);
  assert.match(roots, /const output = stones \? messages : list/);
  assert.match(roots, /messages\.replaceChildren\(\)/, 'a successful render clears loading or failure output');
  assert.match(roots, /\(stones \? messages : list\)\.appendChild/, 'the zero-roots message uses the mounted status host');
  assert.match(roots, /else root\.append\(head, list\)/, 'ordinary Campaign roots retain their existing list mount');
  assert.match(roots, /say\(t\('roots\.loading'/, 'loading is emitted through the shared say path');
  assert.match(roots, /say\(t\('roots\.read_failed'/, 'catalog failures are emitted through the shared say path');
});
