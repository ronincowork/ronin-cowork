/* Coordinate a surface whose owning record arrives after the Workbench shell. */
export function progressiveSurface({ loading, paint }) {
  let pending = true;
  let shown = false;
  return {
    show: (...args) => {
      shown = true;
      return pending ? loading() : paint(...args);
    },
    begin: () => { pending = true; shown = false; },
    settle: (...args) => {
      pending = false;
      return shown ? paint(...args) : undefined;
    },
  };
}
