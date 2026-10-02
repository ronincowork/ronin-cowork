/* part of the ronin-cowork client — see js/README.md */
/**
 * WORK READINGS — what the work-item surfaces read off the store's items, pure and
 * DOM-free. The store is the authority (src/work-items.ts); these only arrange its answer.
 */

/** Boards an item can go under: the roots and every item with children, never itself. */
export const boardChoices = (items, id) => {
  const parents = new Set(items.map((item) => item.parent).filter(Boolean));
  return items.filter((item) => item.id !== id && (item.parent === null || parents.has(item.id)))
    .map((item) => ({ id: item.id, label: item.title }));
};

/** Every board (root item) with its tree under it: { item, items: [branch…], size }, where
 * size counts every descendant. Store order is kept at each level; the store refuses
 * cycles, so every walk ends. */
export const boardTree = (items) => {
  const children = new Map();
  for (const item of items) if (item.parent) children.set(item.parent, [...(children.get(item.parent) || []), item]);
  const branch = (item) => {
    const below = (children.get(item.id) || []).map(branch);
    return { item, items: below, size: below.reduce((sum, row) => sum + 1 + row.size, 0) };
  };
  return items.filter((item) => item.parent === null).map(branch);
};

/** The name a holder label shows: the Agent's or the Team's, nothing when nobody holds it. */
export const holderName = (holder) => String(holder || '').replace(/^(agent|team):/, '');

/** Every board with its items (every descendant) by stage, in the order `stages` gives,
 * keeping only the stages it has items at: { board, stages: [{ stage, items }], size }. */
export const boardStages = (items, stages) => boardTree(items).map((root) => {
  const under = [];
  const walk = (branch) => { for (const child of branch.items) { under.push(child.item); walk(child); } };
  walk(root);
  return {
    board: root.item, size: under.length,
    stages: stages.map((stage) => ({ stage, items: under.filter((item) => item.stage === stage) })).filter((row) => row.items.length),
  };
});
