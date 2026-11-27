/* part of the ronin-cowork client — see js/README.md */
/**
 * A CANVAS ON THE WORKSURFACE (KAN-626; src/canvases.ts). Pressing a canvas's name opens it over
 * the surface it was pressed on, read fresh from GET /api/canvases/read (the reading `canvas read`
 * prints) and painted: a heading per block, its cards in a grid (KAN-630), other lines as a list,
 * links pressable. × puts the surface back as it was. Nothing is kept: every press reads again.
 */
import { request } from './request.js';
import { t } from './lexicon.js';
import { renderMarkdownDocument } from './markdown-reader.js';

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

/** A line from a reading as Markdown: its URLs as links; a `*` that marks the Workspace's own site
 * is a star, so the reader never takes it for emphasis. */
const mdLine = (line) => String(line).trim().replace(/\*/g, '★').replace(/\bhttps?:\/\/[^\s)]+/g, (url) => `[${url}](${url})`);

/** A card (KAN-630, KAN-633): its title, then each row: its words, a quieter detail line, what is
 * wrong with it, and its links, a `button` link as the kit's button. A card of links and detail
 * alone (the Draft and Live buttons, "n older drafts") is painted without a frame. */
function paintCard(card) {
  const rows = card.rows || [];
  const plain = !card.title && rows.every((row) => !row.text);
  const box = el('section', plain ? 'canvas-card canvas-card-plain' : 'canvas-card');
  if (card.title) box.append(el('h4', 'canvas-card-title', card.title));
  for (const row of rows) {
    const line = el('div', 'canvas-card-row');
    if (row.text) line.append(el('p', 'canvas-card-text', row.text));
    if (row.detail) line.append(el('p', 'canvas-card-detail', row.detail));
    if (row.warn) line.append(el('p', 'canvas-card-warn', row.warn));
    const links = row.links || [];
    if (links.length) {
      const bar = el('p', 'canvas-card-links');
      for (const link of links) {
        const a = el('a', link.button ? 'wk-action canvas-card-button' : 'canvas-card-link', link.text);
        a.href = link.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        bar.append(a);
      }
      line.append(bar);
    }
    box.append(line);
  }
  return box;
}

/** Cards in their sections: a heading where the section changes, each run of cards its own grid. */
function paintCards(cards) {
  const out = [];
  let grid = null; let at;
  for (const card of cards) {
    const section = card.section || '';
    if (!grid || section !== at) {
      if (section && section !== at) out.push(el('h4', 'canvas-section-title', section));
      grid = el('div', 'canvas-cards'); out.push(grid); at = section;
    }
    grid.append(paintCard(card));
  }
  return out;
}

/** The reading painted: a heading per block; its cards in a grid, its other lines as a list. */
export function paintReading(c) {
  const doc = el('article', 'canvas-reading');
  // No title or provenance: the surface's header names the canvas (KAN-634); the body is its blocks.
  for (const b of c.blocks) {
    if (!b.shown) continue;
    const block = el('section', 'canvas-block');
    block.append(el('h3', 'canvas-block-title', b.name));
    // A typed entry is a card like the rest: its name, its line, who wrote it and when.
    const typed = b.entries.map((e) => ({ title: e.name, rows: [{ text: e.line, detail: [e.by, e.at].filter(Boolean).join(' · ') }] }));
    const cards = [...b.reads.flatMap((r) => r.cards || []), ...(b.cards || []), ...typed];
    if (cards.length) block.append(...paintCards(cards));
    const lines = [
      ...b.lines.map(mdLine),
      ...(b.unavailable ? [`No reading: ${b.unavailable}`] : []),
      ...b.reads.flatMap((r) => r.lines.map(mdLine)),
    ];
    if (lines.length) block.append(renderMarkdownDocument(lines.map((l) => `- ${l}`).join('\n')));
    doc.append(block);
  }
  return doc;
}

/** Open `name`, a canvas of Workspace `workspace`, over `host`, else the surface that holds `from`. */
export async function openCanvas(from, workspace, name, host = null) {
  const surface = host || from.closest('.wk-surface-content') || from.parentElement;
  if (!surface) return;
  surface.querySelector(':scope > .canvas-view')?.remove();
  // Set aside, not `hidden`: a surface's own CSS may show a hidden child (the phalanx's stones and detail do).
  const kept = [...surface.children].map((child) => [child, child.style.display]);
  for (const [child] of kept) child.style.display = 'none';
  const view = el('div', 'canvas-view');
  const head = el('div', 'canvas-view-head');
  const close = el('button', 'canvas-view-close', '×'); close.type = 'button';
  close.title = t('canvas.close', 'Close the canvas');
  close.addEventListener('click', () => { view.remove(); for (const [child, was] of kept) child.style.display = was; });
  // The page has no surface header of its own here: the head names the canvas beside its ×.
  head.append(el('b', 'canvas-view-name', name), close);
  const body = el('div', 'canvas-view-body');
  view.append(head, body);
  surface.append(view);
  await paintCanvas(body, workspace, name);
}

/** Read `name` of `workspace` now and paint it into `into`: "Reading…" at once, then the canvas. */
export async function paintCanvas(into, workspace, name) {
  into.replaceChildren(el('p', 'fs-step-help', t('canvas.reading', 'Reading {name}: Netlify, repos, work items…', { name })));
  const query = new URLSearchParams({ workspace, name });
  const r = await request(`/api/canvases/read?${query}`, { cache: 'no-store' });
  if (!into.isConnected) return;
  if (!r.ok || !r.data?.canvas) { into.replaceChildren(el('p', 'fs-step-help', r.message || t('canvas.unread', 'The canvas could not be read.'))); return; }
  into.replaceChildren(paintReading(r.data.canvas));
}
