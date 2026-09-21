/** Resolve a Markdown link against the document being read, never the browser route. */
export function localDocumentLink(sourcePath, href, product = true) {
  if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return null;
  try {
    const base = new URL(sourcePath, 'https://ronin.local/');
    const target = new URL(href, base);
    const file = decodeURIComponent(target.pathname.slice(1));
    if ((product && !file.startsWith('docs/')) || !/\.md$/i.test(file) || target.search) return null;
    return { path: file, fragment: decodeURIComponent(target.hash.slice(1)) };
  } catch { return null; }
}
