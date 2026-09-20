/* Shared read-only Markdown presentation. It creates DOM nodes rather than inserting
 * generated HTML, so authored HTML and unsafe link schemes never become executable. */

const safeHref = (value) => {
  const href = String(value || '').trim();
  if (!href || (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^(?:https?|mailto):/i.test(href))) return '';
  return href;
};

export function markdownBlocks(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = line.match(/^\s*```([^`]*)$/);
    if (fence) {
      const body = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) body.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language: fence[1].trim(), text: body.join('\n') });
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }
    const list = line.match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
    if (list) {
      const ordered = /^\d/.test(list[1]);
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(item[2]);
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      const body = [];
      while (index < lines.length) {
        const next = lines[index].match(/^\s*>\s?(.*)$/);
        if (!next) break;
        body.push(next[1]);
        index += 1;
      }
      blocks.push({ type: 'quote', text: body.join(' ') });
      continue;
    }
    const body = [];
    while (index < lines.length && lines[index].trim()
      && !/^\s*```/.test(lines[index])
      && !/^\s{0,3}#{1,6}\s+/.test(lines[index])
      && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[index])
      && !/^\s*>/.test(lines[index])) body.push(lines[index++].trim());
    blocks.push({ type: 'paragraph', text: body.join(' ') });
  }
  return blocks;
}

const inlinePattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;

function appendInline(parent, text, documentRef) {
  let cursor = 0;
  for (const match of String(text).matchAll(inlinePattern)) {
    if (match.index > cursor) parent.append(documentRef.createTextNode(text.slice(cursor, match.index)));
    const token = match[0];
    if (token.startsWith('`')) {
      const code = documentRef.createElement('code'); code.textContent = token.slice(1, -1); parent.append(code);
    } else if (token.startsWith('[')) {
      const parts = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = safeHref(parts?.[2]);
      if (!href) parent.append(documentRef.createTextNode(parts?.[1] || token));
      else {
        const link = documentRef.createElement('a'); link.textContent = parts[1]; link.href = href;
        if (/^https?:/i.test(href)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        parent.append(link);
      }
    } else {
      const strong = token.startsWith('**') || token.startsWith('__');
      const node = documentRef.createElement(strong ? 'strong' : 'em');
      node.textContent = token.slice(strong ? 2 : 1, strong ? -2 : -1); parent.append(node);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) parent.append(documentRef.createTextNode(text.slice(cursor)));
}

export function renderMarkdownDocument(source, documentRef = document) {
  const article = documentRef.createElement('article');
  article.className = 'markdown-reader';
  for (const block of markdownBlocks(source)) {
    let node;
    if (block.type === 'heading') node = documentRef.createElement(`h${block.level}`);
    else if (block.type === 'paragraph') node = documentRef.createElement('p');
    else if (block.type === 'quote') node = documentRef.createElement('blockquote');
    else if (block.type === 'code') {
      node = documentRef.createElement('pre');
      const code = documentRef.createElement('code'); code.textContent = block.text;
      if (block.language) code.dataset.language = block.language;
      node.append(code); article.append(node); continue;
    } else {
      node = documentRef.createElement(block.ordered ? 'ol' : 'ul');
      for (const item of block.items) {
        const li = documentRef.createElement('li'); appendInline(li, item, documentRef); node.append(li);
      }
      article.append(node); continue;
    }
    appendInline(node, block.text, documentRef);
    article.append(node);
  }
  return article;
}
