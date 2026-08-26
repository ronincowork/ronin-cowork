/* part of the ronin-cowork client — see js/README.md */
/**
 * CUSTOMIZE — the destination where a person discovers and authors the recipes that change
 * how Ronin works.
 *
 * THE LINE THIS DESTINATION IS BUILT ON is the glossary's: *you set a setting, you write a
 * recipe.* Settings are the Admin Desk's. Recipes are Customize's. It does not clone the
 * desk, it does not move the skin picker (choosing a skin is a setting), and it opens no
 * raw file editor onto the owner's disk — `PUT /api/file` is never called from here.
 *
 * IT IS ONE SURFACE, and its resource views are views. Under the owner's 2026-08-23
 * taxonomy a Surface is a coworkspace region; multiplying the ruled noun into every
 * sub-region would empty it. This destination hosts no Tile and no Channel service — it is
 * a rail and a content Surface, which is why the terminal never reaches it.
 *
 * COMPOSED ENTIRELY FROM THE FROZEN KIT (18d9b35). The rail's sections, counts, provenance
 * slot, collapse and states are the Kit's; this file supplies feature data and behaviour
 * and creates no geometry of its own. That is also why it ships no stylesheet: the Kit's
 * own rules already carry `wk-*`, and where feature CSS lives is an open question the
 * foundation owner has not ruled.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { byId, railSections, resources } from './customize-rail.js';
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
  const content = createSurface({ label: 'Customize' });
  const rail = createExplorerRail({
    label: 'Customize resources',
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
    title: () => 'Customize · ronin',
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
