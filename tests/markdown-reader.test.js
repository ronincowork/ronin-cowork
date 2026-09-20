import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { markdownBlocks, renderMarkdownDocument } from '../public/js/markdown-reader.js';

class FakeNode {
  constructor(tag = '#text') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.textContent = ''; }
  append(...children) { this.children.push(...children); }
}
const fakeDocument = {
  createElement: (tag) => new FakeNode(tag),
  createTextNode: (text) => Object.assign(new FakeNode(), { textContent: text }),
};

test('read-only Markdown separates the requested block forms', () => {
  assert.deepEqual(markdownBlocks('# Guide\n\nA **clear** [link](https://example.com).\n\n- one\n- two\n\n```js\nalert(1)\n```'), [
    { type: 'heading', level: 1, text: 'Guide' },
    { type: 'paragraph', text: 'A **clear** [link](https://example.com).' },
    { type: 'list', ordered: false, items: ['one', 'two'] },
    { type: 'code', language: 'js', text: 'alert(1)' },
  ]);
});

test('read-only Markdown creates nodes and never activates authored HTML or unsafe links', () => {
  const article = renderMarkdownDocument('<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert(1))\n\n[local](file:///etc/passwd)\n\n[safe](https://example.com)', fakeDocument);
  assert.equal(article.tagName, 'ARTICLE');
  assert.equal(article.children[0].children[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(article.children[1].children[0].tagName, '#TEXT');
  assert.equal(article.children[1].children[0].textContent, 'unsafe');
  assert.equal(article.children[2].children[0].tagName, '#TEXT');
  assert.equal(article.children[2].children[0].textContent, 'local');
  const safe = article.children[3].children[0];
  assert.equal(safe.tagName, 'A');
  assert.equal(safe.href, 'https://example.com');
  assert.equal(safe.rel, 'noopener noreferrer');
});

test('the document reader has focused desktop, mobile, and accessibility contracts', async () => {
  const [canvas, css] = await Promise.all([
    readFile(new URL('../public/js/garden-canvas.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/css/garden-canvas.css', import.meta.url), 'utf8'),
  ]);
  assert.match(canvas, /overlay\.setAttribute\('aria-label', view\.label \|\| 'Document'\)/,
    'the dialog is named by the document on desktop and mobile');
  assert.match(canvas, /renderMarkdownDocument\(view\.text\)/,
    'the visible reader uses the safe shared renderer');
  assert.match(css, /\.markdown-reader \{ max-width: 72ch;/,
    'desktop prose keeps a readable line length');
  assert.match(css, /@media \(max-width: 44rem\) \{[\s\S]*\.markdown-reader \{ max-width: none; \}/,
    'phone reading uses the available width');
  assert.match(css, /\.markdown-reader pre \{ overflow: auto;/,
    'long code scrolls within the reader instead of widening the page');
});
