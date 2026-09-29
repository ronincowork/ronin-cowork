/* part of the ronin-cowork client — see js/README.md */
/**
 * WORK READINGS — what the work-item surfaces read off the store's items, pure and
 * DOM-free. The store is the authority (src/work-items.ts); these only arrange its answer.
 */

/** Left a holder and nobody holds it now: the unassigned reading's parked items. */
const wasHeld = (item) => (item.trail || []).some((line) => line.op === 'release' || line.op === 'holder-ended');

export const NEW_WORK_GROUPS = Object.freeze([
  { id: 'issues', label: 'Open issues', stage: 'IDEA', about: 'Open issues from the issue source. No issue source is connected yet, so there are none to show.', pick: () => false },
  { id: 'ideas', label: 'Ideas', stage: 'IDEA', about: 'Unassigned items on the common board at Idea.', pick: (item) => !wasHeld(item) && item.stage === 'IDEA' },
  { id: 'plan', label: 'Plan', stage: 'PLAN', about: 'Unassigned items on the common board at Plan.', pick: (item) => !wasHeld(item) && item.stage === 'PLAN' },
  { id: 'parked', label: 'Parked', stage: 'IDEA', about: 'Items that left a Team or an Agent and are held by nobody now.', pick: wasHeld },
]);

/** The four groups over the unassigned reading, each with the items it reads. */
export const newWorkGroups = (items) => NEW_WORK_GROUPS.map((group) => ({ ...group, items: items.filter(group.pick) }));

/** Boards a stone can move under: the roots and every item with children, never itself. */
export const boardChoices = (items, id) => {
  const parents = new Set(items.map((item) => item.parent).filter(Boolean));
  return items.filter((item) => item.id !== id && (item.parent === null || parents.has(item.id)))
    .map((item) => ({ id: item.id, label: item.title }));
};
