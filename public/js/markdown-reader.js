/* Shared read-only Markdown presentation (headings, lists, code, pipe tables). Authored HTML stays text and unsafe links do not
 * become executable. Editing surfaces swap this DOM reading for their own source control. */
const safeHref = (value) => {
  const href = String(value || '').trim();
  return href && !href.startsWith('//') && (!/^[a-z][a-z0-9+.-]*:/i.test(href) || /^(?:https?|mailto):/i.test(href)) ? href : '';
};

export const markdownHeadingId = (text) => String(text).toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

const inline = (parent, text, doc, onLink, resolveHref) => {
  // An underscore inside a word is part of it (ronin_lab, snake_case), never emphasis: as in
  // CommonMark, `_` and `__` only open and close at a word's edge.
  const pattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|(?<!\w)__[^_]+__(?!\w)|\*[^*]+\*|(?<!\w)_[^_]+_(?!\w))/g;
  let cursor = 0;
  for (const match of String(text).matchAll(pattern)) {
    if (match.index > cursor) parent.append(doc.createTextNode(text.slice(cursor, match.index)));
    const token = match[0];
    if (token.startsWith('`')) { const node = doc.createElement('code'); node.textContent = token.slice(1, -1); parent.append(node); }
    else if (token.startsWith('[')) {
      const parts = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/); const href = safeHref(parts?.[2]);
      if (!href) parent.append(doc.createTextNode(parts?.[1] || token));
      else { const node = doc.createElement('a'); node.textContent = parts[1]; const destination = safeHref(resolveHref?.(href) || href); node.href = destination; if (/^https?:/i.test(destination)) { node.target = '_blank'; node.rel = 'noopener noreferrer'; } if (onLink && destination === href) node.addEventListener('click', (event) => { if (onLink(href)) event.preventDefault(); }); parent.append(node); }
    } else { const strong = token.startsWith('**') || token.startsWith('__'); const node = doc.createElement(strong ? 'strong' : 'em'); node.textContent = token.slice(strong ? 2 : 1, strong ? -2 : -1); parent.append(node); }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) parent.append(doc.createTextNode(text.slice(cursor)));
};

/* A pipe table: a row of cells, then a rule of dashes under the header (GitHub's markdown). */
const isRow = (line) => /^\s*\|.*\|\s*$/.test(line || '');
const isRule = (line) => /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*(:?-{3,}:?\s*)?\|?\s*$/.test(line || '');
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));

export function renderMarkdownDocument(source, doc = document, { onLink, resolveHref } = {}) {
  const article = doc.createElement('article'); article.className = 'markdown-reader';
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim()) { index++; continue; }
    const heading = lines[index].match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) { const node = doc.createElement(`h${heading[1].length}`); node.id = markdownHeadingId(heading[2]); inline(node, heading[2], doc, onLink, resolveHref); article.append(node); index++; continue; }
    const fence = lines[index].match(/^\s*```([^`]*)$/);
    if (fence) { const body = []; for (index++; index < lines.length && !/^\s*```\s*$/.test(lines[index]); index++) body.push(lines[index]); index++; const pre = doc.createElement('pre'); const code = doc.createElement('code'); code.textContent = body.join('\n'); pre.append(code); article.append(pre); continue; }
    if (isRow(lines[index]) && isRule(lines[index + 1])) {
      const table = doc.createElement('table'); const head = doc.createElement('thead'); const body = doc.createElement('tbody');
      const row = (line, tag) => { const tr = doc.createElement('tr'); for (const text of cells(line)) { const cell = doc.createElement(tag); inline(cell, text, doc, onLink, resolveHref); tr.append(cell); } return tr; };
      head.append(row(lines[index], 'th'));
      for (index += 2; index < lines.length && isRow(lines[index]); index++) body.append(row(lines[index], 'td'));
      table.append(head, body);
      // Wide tables scroll inside their own box rather than widening the page.
      const box = doc.createElement('div'); box.className = 'markdown-table'; box.append(table); article.append(box); continue;
    }
    const list = lines[index].match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
    if (list) { const ordered = /^\d/.test(list[1]); const node = doc.createElement(ordered ? 'ol' : 'ul'); while (index < lines.length) { const item = lines[index].match(/^\s*([-+*]|\d+[.)])\s+(.+)$/); if (!item || /^\d/.test(item[1]) !== ordered) break; const li = doc.createElement('li'); inline(li, item[2], doc, onLink, resolveHref); node.append(li); index++; } article.append(node); continue; }
    const body = []; while (index < lines.length && lines[index].trim() && !/^\s{0,3}#{1,6}\s+/.test(lines[index]) && !/^\s*```/.test(lines[index]) && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[index]) && !(isRow(lines[index]) && isRule(lines[index + 1]))) body.push(lines[index++].trim());
    const node = doc.createElement('p'); inline(node, body.join(' '), doc, onLink, resolveHref); article.append(node);
  }
  return article;
}
