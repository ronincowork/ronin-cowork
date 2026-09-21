import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { localDocumentLink } from '../public/js/document-links.js';
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
