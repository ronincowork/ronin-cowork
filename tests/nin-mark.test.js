import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Just enough DOM to render a kit action: nodes that record their tag, namespace and markup.
class FakeNode {
  constructor(tag, namespace = 'http://www.w3.org/1999/xhtml') { this.tagName = tag.toUpperCase(); this.namespaceURI = namespace; this.children = []; this.attributes = {}; this.dataset = {}; this.innerHTML = ''; this.textContent = ''; this.className = ''; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener() {}
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
}
globalThis.document = {
  createElement: (tag) => new FakeNode(tag),
  createElementNS: (namespace, tag) => new FakeNode(tag, namespace),
};

const { WorkspacePrimitives, ninMark } = await import('../public/js/workspace-primitives.js');

test('a Launch button carries the nin mark inline: no image to fetch, so no late frame', () => {
  const button = WorkspacePrimitives.createAction({ label: 'Launch', launch: true });
  const nodes = [...button.el.walk()];
  const mark = nodes.find((n) => n.tagName === 'SVG');
  assert.ok(mark, 'the mark is an inline svg');
  assert.equal(mark.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(mark.getAttribute('class'), 'wk-launch-mark', 'sized by the same class the image had');
  assert.equal(mark.getAttribute('aria-hidden'), 'true');
  assert.equal(nodes.some((n) => n.tagName === 'IMG'), false, 'no img with a brand src');
});

test('the inline copy is the master file\'s paths, exactly', async () => {
  const master = await readFile(new URL('../public/brand/nin-mark.svg', import.meta.url), 'utf8');
  const mark = ninMark();
  assert.equal(mark.getAttribute('viewBox'), '0 0 120 104');
  assert.match(master, /viewBox="0 0 120 104"/);
  const paths = (markup) => [...markup.matchAll(/<path [^>]*\/>/g)].map((m) => m[0]);
  assert.deepEqual(paths(mark.innerHTML), paths(master), 'when the mark moves, copy its paths here too');
  assert.doesNotMatch(mark.innerHTML, /id=/, 'no ids: the mark repeats on one page');
});

test('no client module paints the nin mark as an image', async () => {
  for (const file of ['workspace-primitives.js', 'cowork-view.js', 'phone.js', 'setup-surfaces.js', 'agent-view.js', 'tile.js']) {
    const source = await readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.src = 'brand\/nin-mark\.svg'/, file);
  }
});
