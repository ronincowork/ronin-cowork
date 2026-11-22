/* part of the ronin-cowork client — see js/README.md */
/**
 * EPIC-STAGE (owner, 2026-11-22; w898, KAN-780): where an Epic is in its life, read from its items,
 * never from the Epic's own Status (kept as Jira has it, never indexed on). The numbers, the mean and
 * the bands are the shared item lifecycle's (item-lifecycle.js, KAN-785); this names its bands: Empty (no items), Starter (< 1.5), Working (< 2.5), Maturing (< 3.25),
 * Aging (to 4: the work is in, the Epic waits to be marked Done). An Epic whose Status is Done is
 * Done; a Workspace's Icebox (held by the Workspace, KAN-352) has none.
 *
 * Counted from the pushed rows (the live index, work-items-index.ts) when a view is drawn: no
 * counters. Pure rules only, no page: epic-progress.js hands them to the shared drawing.
 */

import { attention, lifecycle, statusKey } from './item-lifecycle.js';

/** A Workspace's Icebox: the Epic a Workspace holds (KAN-352). */
export const isIcebox = (epic) => String(epic?.holder || '').startsWith('workspace:');
/** An Epic still open: not Done, not an Icebox. */
export const isOpenEpic = (epic) => statusKey(epic?.status) !== 'done' && !isIcebox(epic);

/** The lifecycle's band named as an epic-stage. */
const STAGE_OF_BAND = ['empty', 'starter', 'working', 'maturing', 'aging'];

/** The Epic's epic-stage over the shared lifecycle (item-lifecycle.js: counts, score, band): an
 * Icebox has none, an Epic whose Status is Done is Done, else its band's name. */
export function epicStage(epic, items) {
  const life = lifecycle(items);
  const stage = isIcebox(epic) ? 'icebox' : statusKey(epic?.status) === 'done' ? 'done' : STAGE_OF_BAND[life.band];
  return { ...life, stage };
}

/** What needs the person under an Epic: the shared rule (item-lifecycle.js `attention`). */
export const epicAttention = attention;

/** When the Epic last moved: the newest `moved` of it and every item under it ('' when none). */
export function epicMoved(epic, items) {
  return [epic, ...(items || [])].map((row) => String(row?.moved || '')).filter(Boolean).sort().at(-1) || '';
}

/** The phalanx's order: those needing the person first, then the most progressed, then the newest moved. */
export function orderEpics(rows) {
  const needs = (row) => Number(row.attention.review || row.attention.flagged || row.attention.unassigned);
  return [...rows].sort((a, b) => (needs(b) - needs(a)) || (b.score - a.score) || b.moved.localeCompare(a.moved));
}
