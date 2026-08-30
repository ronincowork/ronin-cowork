/* part of the ronin-cowork client — see js/README.md */
/**
 * THE ARRANGEMENT — which slots a workbench shows, in what order, at what widths.
 *
 * Pure state. No DOM, no imports, and no idea what a slot holds: a destination declares
 * its slots by name and the Kit's frame and layout map render whatever this says. That
 * blindness is the contract (wip/buildouts/TEAM_WORKBENCH.md, leg 1): another destination
 * adopts the same machinery by declaring different names, and the team page puts its
 * commons on the left by reordering one array.
 *
 * A DECLARATION is what a destination hands the frame:
 *   { slots: [ { name, label, width, min, compact, composite }, ... ] }
 *   width    default share of the row, percent, summing to 100 across the declaration
 *   min      the floor a resize may reach, percent (the action column goes to 6)
 *   compact  a pixel width under which the frame marks the slot data-width="compact"
 *   composite the slot contains independently headed workspace seats; the outer frame
 *             must not add a second header above their permanent Kit headers
 * A bare string is a slot with defaults.
 *
 * The STATE it keeps and a destination persists:
 *   { order: [name...], hidden: [name...], widths: { name: percent } }
 * Widths are stored by NAME, not by position, so a moved slot carries its width and a
 * re-shown slot comes back at the width it had. Every operation returns a NEW state.
 */

const WIDTH_MAX = 70;
const MIN_DEFAULT = 15;

const isName = (value) => typeof value === 'string' && value.length > 0;
// null and '' are ABSENT, not zero: the shell's default state carries `widths: {left: null,
// right: null}`, and Number(null) is 0 — read as a width it clamps a workspace to its floor.
const finite = (value, fallback) => (value === null || value === '' || !Number.isFinite(Number(value)) ? fallback : Number(value));

export function declareArrangement(declaration = {}) {
  const raw = Array.isArray(declaration.slots) ? declaration.slots : [];
  const seen = new Set();
  const slots = [];
  for (const entry of raw) {
    const slot = typeof entry === 'string' ? { name: entry } : entry && typeof entry === 'object' ? entry : null;
    if (!slot || !isName(slot.name) || seen.has(slot.name)) continue;
    seen.add(slot.name);
    slots.push({
      name: slot.name,
      label: isName(slot.label) ? slot.label : slot.name,
      width: finite(slot.width, 0),
      min: Math.max(1, finite(slot.min, MIN_DEFAULT)),
      compact: Math.max(0, finite(slot.compact, 0)),
      composite: slot.composite === true,
    });
  }
  if (!slots.length) throw new Error('an arrangement needs at least one slot');
  const declared = slots.reduce((sum, slot) => sum + slot.width, 0);
  const unsized = slots.filter((slot) => slot.width <= 0);
  const remainder = Math.max(0, 100 - declared);
  for (const slot of unsized) slot.width = unsized.length ? remainder / unsized.length : 0;
  const total = slots.reduce((sum, slot) => sum + slot.width, 0) || 1;
  for (const slot of slots) slot.width = (slot.width / total) * 100;
  return Object.freeze({ slots: Object.freeze(slots.map((slot) => Object.freeze(slot))) });
}

export function defaultArrangement(declaration) {
  const { slots } = declareArrangement(declaration);
  return Object.freeze({
    order: Object.freeze(slots.map((slot) => slot.name)),
    hidden: Object.freeze([]),
    widths: Object.freeze(Object.fromEntries(slots.map((slot) => [slot.name, slot.width]))),
  });
}

const slotOf = (declaration, name) => declaration.slots.find((slot) => slot.name === name);

/** Drops unknown names, appends missing ones, and keeps every width inside its slot's bounds. */
export function normalizeArrangement(state, declaration) {
  const decl = declareArrangement(declaration);
  const names = decl.slots.map((slot) => slot.name);
  const known = new Set(names);
  const source = state && typeof state === 'object' ? state : {};
  const order = (Array.isArray(source.order) ? source.order : []).filter((name, i, all) => known.has(name) && all.indexOf(name) === i);
  for (const name of names) if (!order.includes(name)) order.push(name);
  const hidden = (Array.isArray(source.hidden) ? source.hidden : []).filter((name, i, all) => known.has(name) && all.indexOf(name) === i);
  if (hidden.length >= order.length) hidden.length = 0; // never an empty bench
  const widths = {};
  for (const slot of decl.slots) {
    const stored = source.widths && typeof source.widths === 'object' ? source.widths[slot.name] : undefined;
    widths[slot.name] = Math.min(WIDTH_MAX, Math.max(slot.min, finite(stored, slot.width)));
  }
  return Object.freeze({ order: Object.freeze(order), hidden: Object.freeze(hidden), widths: Object.freeze(widths) });
}

export const isHidden = (state, name) => state.hidden.includes(name);
export const visibleOrder = (state) => state.order.filter((name) => !state.hidden.includes(name));

/** The columns the frame draws: visible slots in order, widths rescaled to 100. */
export function visibleColumns(state, declaration) {
  const decl = declareArrangement(declaration);
  const names = visibleOrder(state);
  const total = names.reduce((sum, name) => sum + state.widths[name], 0) || 1;
  return names.map((name) => {
    const slot = slotOf(decl, name);
    return { name, width: (state.widths[name] / total) * 100, min: slot?.min ?? MIN_DEFAULT, compact: slot?.compact ?? 0 };
  });
}

/** Refuses to hide the last visible slot: a bench is never empty. */
export function toggleSlot(state, name) {
  if (!state.order.includes(name)) return state;
  if (isHidden(state, name)) return Object.freeze({ ...state, hidden: Object.freeze(state.hidden.filter((n) => n !== name)) });
  if (visibleOrder(state).length <= 1) return state;
  return Object.freeze({ ...state, hidden: Object.freeze([...state.hidden, name]) });
}

export function moveSlot(state, name, index) {
  const from = state.order.indexOf(name);
  if (from < 0) return state;
  const to = Math.max(0, Math.min(state.order.length - 1, Math.trunc(finite(index, from))));
  if (to === from) return state;
  const order = state.order.filter((n) => n !== name);
  order.splice(to, 0, name);
  return Object.freeze({ ...state, order: Object.freeze(order) });
}

/**
 * The visible neighbour that yields when `name` is resized: the one toward the middle
 * of the bench, so the leftmost slot takes from its right and the rightmost from its
 * left. That one rule is what makes the two workspaces behave alike (the old frame let
 * the left win and made the right yield, whichever was dragged).
 */
export function yieldingNeighbour(state, name) {
  const names = visibleOrder(state);
  const at = names.indexOf(name);
  if (at < 0 || names.length < 2) return '';
  if (at === names.length - 1) return names[at - 1];
  return names[at + 1];
}

/**
 * Sets `name` to `percent` of the VISIBLE row, taking or giving the difference to its
 * yielding neighbour (or the one passed). Both stay inside their floors and the 70 cap;
 * the request is trimmed, never refused, so a drag always moves as far as it may.
 */
export function resizeSlot(state, name, percent, declaration, neighbour = '') {
  const decl = declareArrangement(declaration);
  const other = neighbour || yieldingNeighbour(state, name);
  const me = slotOf(decl, name);
  const them = slotOf(decl, other);
  if (!me || !them || isHidden(state, name) || isHidden(state, other)) return state;
  const columns = visibleColumns(state, declaration);
  const mine = columns.find((c) => c.name === name).width;
  const theirs = columns.find((c) => c.name === other).width;
  const pair = mine + theirs;
  const wanted = Math.min(WIDTH_MAX, Math.max(me.min, finite(percent, mine)));
  const next = Math.max(me.min, Math.min(wanted, pair - them.min, WIDTH_MAX));
  if (Math.abs(next - mine) < 0.01) return state;
  // Store on the visible scale: visibleColumns rescales, so writing rescaled numbers
  // for every visible slot keeps the stored widths and the drawn widths the same.
  const widths = { ...state.widths };
  for (const column of columns) widths[column.name] = column.width;
  widths[name] = next;
  widths[other] = pair - next;
  return Object.freeze({ ...state, widths: Object.freeze(widths) });
}

/** The frame's word for a rendered width: compact under the slot's declared pixel threshold. */
export const widthClass = (pixels, compact) => (compact > 0 && finite(pixels, 0) < compact ? 'compact' : 'full');

/**
 * The pre-arrangement workbench state, `{ widths: {left, right}, surfaces: {name: hidden} }`,
 * read once into an arrangement. Positional: the first declared slot was the left
 * width, the last the right, and the surface flags are matched by declaration order
 * (terminalTile, kanban, channels were the three fixed names). Anything else falls back
 * to the declaration's defaults.
 */
export function migrateWorkbenchState(old, declaration) {
  const fresh = defaultArrangement(declaration);
  if (!old || typeof old !== 'object') return fresh;
  if (Array.isArray(old.order)) return normalizeArrangement(old, declaration);
  const names = [...fresh.order];
  const widths = { ...fresh.widths };
  const oldWidths = old.widths && typeof old.widths === 'object' ? old.widths : null;
  if (oldWidths && names.length >= 2) {
    const left = finite(oldWidths.left, widths[names[0]]);
    const right = finite(oldWidths.right, widths[names[names.length - 1]]);
    widths[names[0]] = left;
    widths[names[names.length - 1]] = right;
    const middle = names.slice(1, -1);
    for (const name of middle) widths[name] = Math.max(0, 100 - left - right) / middle.length;
  }
  const flags = old.surfaces && typeof old.surfaces === 'object' ? Object.values(old.surfaces) : [];
  const hidden = names.filter((_, i) => flags[i] === true);
  return normalizeArrangement({ order: names, hidden, widths }, declaration);
}
