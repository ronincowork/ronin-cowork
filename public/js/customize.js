/* part of the ronin-cowork client — see js/README.md */
import { WorkspaceKit } from './workspace-kit.js';
import { byId, railSections, resources } from './customize-rail.js';
import { t } from './lexicon.js';
import { renderResource } from './customize-resources.js';


export function buildCustomize() {
  // Read the Kit inside the call, never at module top level: a top-level reference to an
  // imported binding reintroduces load-order fragility (public/js/README.md rule 4).
  const { createExplorerRail, createSurface } = WorkspaceKit.primitives;
  const { createExplorerLayout } = WorkspaceKit.layouts;
  const counts = {};
  const marks = {};
  let current = '';
  let generation = 0;

  let repainting = false;
  const content = createSurface({ label: t('customize.title', 'Customize') });
  const rail = createExplorerRail({
    label: t('customize.rail_label', 'Customize resources'),
    sections: railSections(counts, marks),
    onSelect: (id) => { if (!repainting) show(id); },
  });
  const layout = createExplorerLayout(rail.el, content.el);

  /**
   * Repaint the rail with resolved counts and provenance.
   *
   * SUPPRESSING onSelect HERE IS NOT OPTIONAL. The Kit's `setSections` ends by calling
   * `select()`, which fires `onSelect` — so a refresh triggered BY a render would start
   * another render, which would refresh again, and each turn of that loop fires an HTTP
   * request. The UI gate caught exactly that: the page never went idle and Playwright
   * timed out waiting for the session picker to settle. The flag makes a programmatic
   * repaint silent while leaving a real click on a rail item fully live.
   */
  const refreshRail = () => {
    const keep = rail.selected;
    repainting = true;
    try {
      rail.setSections(railSections(counts, marks));
      if (keep && keep !== rail.selected) rail.select(keep);
    } finally {
      repainting = false;
    }
  };

  async function show(id) {
    const resource = byId(id);
    if (!resource) return;
    current = id;
    // A read in flight must not paint over a later selection. The generation counter is
    // the whole guard: a stale answer returns to a surface the owner has already left.
    const mine = ++generation;
    const result = await renderResource(resource, content, () => show(id));
    if (mine !== generation) return;
    counts[id] = result.count;
    marks[id] = result.mark;
    refreshRail();
  }

  return {
    el: layout,
    title: () => t('customize.title', 'Customize') + ' · ronin',
    enter: () => { if (!current) show(resources()[0].id); },
    rail,
    content,
  };
}

/** Register the destination on the frozen shell. One id, one element; the shell owns
 *  routing, history and the document title. */
export function installCustomize(workspace) {
  const view = buildCustomize();
  workspace.register('customize', view);
  return view;
}
