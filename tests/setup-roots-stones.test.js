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

test('roots stones reuse the real project-root blocks and preserve native button selection', async () => {
  const roots = await source('public/js/projectroots.js');
  assert.match(roots, /options\.presentation === 'stones'/);
  assert.match(roots, /button\.type = 'button'/);
  assert.match(roots, /button\.setAttribute\('aria-pressed'/);
  assert.match(roots, /detail\.append\(block\(current\)\)/);
  assert.match(roots, /detail\.append\(addCard\(\)\)/);
  assert.match(roots, /event\.key !== 'Escape'/);
  assert.match(roots, /createFolderPicker/);
  assert.match(roots, /\/api\/project-roots\/inspect/);
  assert.match(roots, /\/repo-profile/);
});

test('roots stones are square, smaller than presets, and adapt selected detail for phone', async () => {
  const [css, presetCss] = await Promise.all([
    source('public/style.css'),
    source('public/css/launch-forms.css'),
  ]);
  assert.match(presetCss, /--sp-stone: calc\(var\(--space-12\) \* 5\)/);
  assert.match(css, /--pr-stone: clamp\(var\(--setup-stone-min[^;]+var\(--setup-stone-fluid, 24cqi\)[^;]+var\(--setup-stone-size/);
  assert.match(css, /container: setup-roots \/ inline-size/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, var\(--setup-stone-size/);
  assert.match(css, /max-width: calc\(3 \* var\(--setup-stone-size[^;]+2 \* var\(--pr-stone-gap\)\)/);
  assert.match(css, /width: var\(--pr-stone\);\s*height: var\(--pr-stone\)/);
  assert.match(css, /aspect-ratio: 1/);
  assert.match(css, /\.pr-inner\[data-open='true'\] \.pr-list \{\s*grid-template-columns: var\(--pr-stone\)/);
  assert.doesNotMatch(css, /@container setup-roots \(max-width:/);
  assert.match(css, /\.pr-stone:focus-visible/);
});
