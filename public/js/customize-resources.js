/* part of the ronin-cowork client — see js/README.md */
/**
 * CUSTOMIZE — one resource, rendered into the content Surface.
 *
 * Every resource draws in the same order whatever its capability: what the shelf IS, then
 * the resolved list with provenance, then the write path or the sentence saying there is
 * not one. A read-only resource is NOT a degraded editor and must not look like one — it
 * ends with how the owner changes it, never with a disabled form.
 *
 * PROVENANCE COMES FROM js/provenance.js AND NOWHERE ELSE. The server puts `origin` and
 * `shadowed` on every catalog entry; that module is the single place they become a mark,
 * and a sixth surface inventing its own would be the drift it exists to stop.
 */
import { request } from './request.js';
import { addProvMark, isOwn } from './provenance.js';
import { WorkspaceKit } from './workspace-kit.js';
import { buildHandoff } from './customize-handoff.js';


const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
};

/** The rows a list route returns, normalised. Every catalog route answers an array; the
 *  definition routes answer one too. A non-array is a fault, not an empty shelf. */
const rows = (data) => (Array.isArray(data) ? data : null);

/**
 * Render one resource. Returns { count, mark } so the rail can show a resolved count and
 * a provenance rollup — both absent when the read could not answer, which is the whole
 * point: a count of zero and a count we could not take are different facts.
 */
export async function renderResource(resource, surface) {
  const { createCard, createNotice } = WorkspaceKit.primitives;
  surface.content.replaceChildren();
  const head = el('div', 'cz-head');
  head.append(el('h2', null, `${resource.mark} ${resource.label}`));
  head.append(el('p', 'cz-blurb', resource.blurb));
  surface.content.append(head);

  // No route: say so, name the missing prerequisite, and stop. An empty list here would
  // assert the owner's shelf is empty, which is a different and false claim.
  if (!resource.read) {
    surface.setState(resource.capability === 'deferred' ? 'inert' : 'unavailable', resource.why || 'Not available in this preview.');
    return { count: null, mark: null };
  }

  surface.setState('loading', 'reading…');
  const r = await request(resource.read);
  if (!r.ok) {
    surface.setState('failed', `could not read — ${r.message}`);
    return { count: null, mark: null };
  }
  const list = rows(r.data);
  if (!list) {
    surface.setState('failed', 'the route did not answer with a list');
    return { count: null, mark: null };
  }

  surface.setState(null, '');
  if (!list.length) {
    // A genuinely empty shelf is an ordinary state — a fresh install, or a directory the
    // house deliberately ships nothing into. Say which, rather than looking broken.
    surface.content.append(createNotice({ message: 'Nothing here yet. That is an ordinary state, not a fault.' }).el);
  }

  const grid = el('div', 'cz-grid');
  for (const entry of list) {
    const card = createCard({
      heading: entry.label || entry.name,
      summary: entry.blurb || '',
      metadata: [entry.name].filter(Boolean),
    });
    addProvMark(card.heading, entry);
    // Whole-document resources remain read-only, but genuinely readable. Native details
    // keeps the list compact and exposes the resolved text without a second editor or a
    // feature-local navigation foundation.
    if (typeof entry.content === 'string') {
      const details = el('details', 'cz-document');
      details.append(el('summary', null, resource.readLabel || 'Read entry'));
      details.append(el('pre', 'cz-document-text', entry.content));
      card.el.append(details);
    }
    grid.append(card.el);
  }
  surface.content.append(grid);

  // The write path, or the sentence saying there is not one.
  surface.content.append(buildHandoff(resource, list));

  const own = list.filter(isOwn);
  const shadowed = own.filter((e) => e.shadowed);
  return {
    count: list.length,
    mark: own.length ? (shadowed.length ? '◈' : '◆') : null,
  };
}
