/* part of the ronin-cowork client — see js/README.md */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { renderMarkdownDocument } from './markdown-reader.js';
import { localDocumentLink, productRepositoryHref } from './document-links.js';

// HOSTED PAGES, UNDERSTANDING, RUNNING AND HELP (w926): no tick; the page is its doc, as the docs
// have it (docs/getting-started/), read when shown. A link to another doc opens it in place.
export function createDocPage(label, page) {
  return () => {
    const out = WorkspaceKit.primitives.createSurface({ label, className: 'setup-surface setup-doc-page' });
    const body = document.createElement('div');
    body.className = 'setup-surface-body setup-doc-body';
    out.content.append(body);
    const open = async (path, fragment = '') => {
      const result = await request(`/api/file?${new URLSearchParams({ path, product: '1' })}`);
      body.replaceChildren(result.ok ? renderMarkdownDocument(result.data.text || '', document, {
        resolveHref: (href) => productRepositoryHref(path, href),
        onLink: (href) => {
          const linked = localDocumentLink(path, href, true);
          if (!linked) return false;
          if (linked.path === path && linked.fragment) body.querySelector(`[id="${CSS.escape(linked.fragment)}"]`)?.scrollIntoView({ block: 'start' });
          else void open(linked.path, linked.fragment);
          return true;
        },
      }) : Object.assign(document.createElement('p'), { className: 'setup-notice', textContent: result.message }));
      if (fragment) body.querySelector(`[id="${CSS.escape(fragment)}"]`)?.scrollIntoView({ block: 'start' });
    };
    return { el: out.el, show: () => open(page) };
  };
}
