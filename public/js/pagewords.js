/* part of the ronin-cowork client — see js/README.md */
/**
 * PAGE WORDS — the one pass that puts index.html's static text through the lexicon.
 *
 * index.html is served as a file, so its words cannot call t(). Instead an element names
 * its key in an attribute and this pass, run once at boot after the desk profile has put
 * its lexicon up, reads the key and writes the word:
 *
 *   data-t="bar.new"            the element's text          (leading/trailing space kept)
 *   data-t-title="bar.new_title" its title (the tooltip)
 *   data-t-aria="bar.keys"       its aria-label
 *
 * The literal in the file is the floor's floor, exactly as the second argument of t() is:
 * with no lexicon up, nothing changes byte for byte. ONE mechanism for the page, and
 * scripts/check-lexicon.mjs reads these attributes as keys the client reads — a key the
 * floor lacks fails the build here as it would in a module.
 */
import { t } from './lexicon.js';

export function applyPageWords(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) {
    const literal = el.textContent;
    const lead = literal.match(/^\s*/)[0];
    const trail = literal.match(/\s*$/)[0];
    el.textContent = lead + t(el.dataset.t, literal.trim()) + trail;
  }
  for (const el of root.querySelectorAll('[data-t-title]')) el.title = t(el.dataset.tTitle, el.title);
  for (const el of root.querySelectorAll('[data-t-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.tAria, el.getAttribute('aria-label') || ''));
  }
}
