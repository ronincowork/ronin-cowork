/* Shared read-only Markdown presentation. Authored HTML stays text and unsafe links do not
 * become executable. Editing surfaces swap this DOM reading for their own source control. */
const safeHref = (value) => {
  const href = String(value || '').trim();
  return href && (!/^[a-z][a-z0-9+.-]*:/i.test(href) || /^(?:https?|mailto):/i.test(href)) ? href : '';
};

const inline = (parent, text, doc) => {
  const pattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  let cursor = 0;
  for (const match of String(text).matchAll(pattern)) {
    if (match.index > cursor) parent.append(doc.createTextNode(text.slice(cursor, match.index)));
    const token = match[0];
    if (token.startsWith('`')) { const node = doc.createElement('code'); node.textContent = token.slice(1, -1); parent.append(node); }
    else if (token.startsWith('[')) {
      const parts = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/); const href = safeHref(parts?.[2]);
      if (!href) parent.append(doc.createTextNode(parts?.[1] || token));
      else { const node = doc.createElement('a'); node.textContent = parts[1]; node.href = href; if (/^https?:/i.test(href)) { node.target = '_blank'; node.rel = 'noopener noreferrer'; } parent.append(node); }
    } else { const strong = token.startsWith('**') || token.startsWith('__'); const node = doc.createElement(strong ? 'strong' : 'em'); node.textContent = token.slice(strong ? 2 : 1, strong ? -2 : -1); parent.append(node); }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) parent.append(doc.createTextNode(text.slice(cursor)));
};

export function renderMarkdownDocument(source, doc = document) {
  const article = doc.createElement('article'); article.className = 'markdown-reader';
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length;) {
    if (!lines[index].trim()) { index++; continue; }
    const heading = lines[index].match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) { const node = doc.createElement(`h${heading[1].length}`); inline(node, heading[2], doc); article.append(node); index++; continue; }
    const fence = lines[index].match(/^\s*```([^`]*)$/);
    if (fence) { const body = []; for (index++; index < lines.length && !/^\s*```\s*$/.test(lines[index]); index++) body.push(lines[index]); index++; const pre = doc.createElement('pre'); const code = doc.createElement('code'); code.textContent = body.join('\n'); pre.append(code); article.append(pre); continue; }
    const list = lines[index].match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
    if (list) { const ordered = /^\d/.test(list[1]); const node = doc.createElement(ordered ? 'ol' : 'ul'); while (index < lines.length) { const item = lines[index].match(/^\s*([-+*]|\d+[.)])\s+(.+)$/); if (!item || /^\d/.test(item[1]) !== ordered) break; const li = doc.createElement('li'); inline(li, item[2], doc); node.append(li); index++; } article.append(node); continue; }
    const body = []; while (index < lines.length && lines[index].trim() && !/^\s{0,3}#{1,6}\s+/.test(lines[index]) && !/^\s*```/.test(lines[index]) && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[index])) body.push(lines[index++].trim());
    const node = doc.createElement('p'); inline(node, body.join(' '), doc); article.append(node);
  }
  return article;
}
