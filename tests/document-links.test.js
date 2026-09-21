import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { localDocumentLink, productRepositoryHref } from '../public/js/document-links.js';
import { markdownHeadingId, renderMarkdownDocument } from '../public/js/markdown-reader.js';

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.textContent = ''; }
  append(child) { this.children.push(child); }
  addEventListener(name, callback) { this.listeners[name] = callback; }
}
const doc = { createElement: (tag) => new Node(tag), createTextNode: (text) => ({ textContent: text }) };

test('Assist resolves installed guide links from their source document', async () => {
  const source = 'docs/getting-started/agent-install.md';
  const sibling = localDocumentLink(source, 'get-started.md#prove-one-working-agent');
  assert.deepEqual(sibling, { path: 'docs/getting-started/get-started.md', fragment: 'prove-one-working-agent' });
  await access(sibling.path);
  const parent = localDocumentLink(source, '../architecture/model-providers.md');
  assert.equal(parent.path, 'docs/architecture/model-providers.md');
  await access(parent.path);
  assert.deepEqual(localDocumentLink(source, '#provider-sign-in'), { path: source, fragment: 'provider-sign-in' });
  assert.equal(localDocumentLink(source, 'https://github.com/ronincowork/ronin-cowork'), null);
  assert.equal(localDocumentLink(source, '../../KOTOBA.md'), null);
});

test('Markdown links call local navigation while external links retain browser behavior', () => {
  const opened = [];
  const article = renderMarkdownDocument('# Provider sign-in\n\n[Next](get-started.md#prove-one-working-agent) [Web](https://example.com)\n', doc,
    { onLink: (href) => { opened.push(href); return !href.startsWith('https:'); } });
  assert.equal(article.children[0].id, markdownHeadingId('Provider sign-in'));
  const links = article.children[1].children.filter((child) => child.tag === 'a');
  let prevented = false;
  links[0].listeners.click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(opened[0], 'get-started.md#prove-one-working-agent');
  prevented = false;
  links[1].listeners.click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(links[1].target, '_blank');
});

test('Assist sends the tile guide repository link to canonical GitHub with its fragment', () => {
  const source = 'docs/using-ronin/tile.md';
  const relative = '../../public/js/README.md#visible-surface-ownership-index';
  const canonical = 'https://github.com/ronincowork/ronin-cowork/blob/master/public/js/README.md#visible-surface-ownership-index';
  assert.equal(productRepositoryHref(source, '../../public/js/README.md'),
    'https://github.com/ronincowork/ronin-cowork/blob/master/public/js/README.md');
  assert.equal(localDocumentLink(source, relative), null);
  assert.equal(productRepositoryHref(source, relative), canonical);
  assert.equal(productRepositoryHref(source, '../workbench.md#setup'), null, 'docs Markdown stays local');
  assert.equal(productRepositoryHref(source, 'https://example.com/help'), null, 'external links stay external');
  const article = renderMarkdownDocument(`[UI ownership index](${relative})`, doc,
    { resolveHref: (href) => productRepositoryHref(source, href) });
  const link = article.children[0].children.find((child) => child.tag === 'a');
  assert.equal(link.href, canonical);
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
});
