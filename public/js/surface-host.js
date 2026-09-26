/* One viewport, one named tenant. Navigation chooses; sibling surfaces only render. */
export function createSurfaceHost(root, names, initial) {
  const tenants = new Set(names);
  if (!tenants.has(initial)) throw new Error(`Unknown initial surface: ${initial}`);
  let active = initial;
  root.dataset.surface = active;
  return {
    select(name) {
      if (!tenants.has(name)) throw new Error(`Unknown surface: ${name}`);
      active = name;
      root.dataset.surface = name;
      return name;
    },
    is: (name) => active === name,
    get active() { return active; },
  };
}

export const TILE_SURFACES = Object.freeze(['term', 'tape', 'chat', 'docs']);
