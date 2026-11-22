/* part of the ronin-cowork client — see js/README.md */
/**
 * EPIC-STAGE (owner, 2026-11-22; w898, KAN-780): where an Epic is in its life, read from its items,
 * never from the Epic's own Status (kept as Jira has it, never indexed on). Each level-0 item under
 * the Epic scores To Do 1, In Progress 2, In Review 3, Done 4; the Epic's score is their mean, and the
 * bands do not overlap: Empty (no items), Starter (< 1.5), Working (< 2.5), Maturing (< 3.25),
 * Aging (to 4: the work is in, the Epic waits to be marked Done). An Epic whose Status is Done is
 * Done; a Workspace's Icebox (held by the Workspace, KAN-352) has none.
 *
 * Counted from the pushed rows (the live index, work-items-index.ts) when a view is drawn: no
 * counters. Pure rules only, no page: epic-progress.js draws them as colour.
 */

/** The status's family, which picks a colour and a column: Jira's three, plus In Review. */
export function statusKey(status) {
  const s = String(status || '').toLowerCase();
  if (/done|closed|resolved|complete/.test(s)) return 'done';
  if (/review/.test(s)) return 'review';
  if (/progress|doing|active/.test(s)) return 'progress';
  return 'todo';
}

export const STAGE_KEYS = ['todo', 'progress', 'review', 'done'];
const SCORE = { todo: 1, progress: 2, review: 3, done: 4 };

/** A Workspace's Icebox: the Epic a Workspace holds (KAN-352). */
export const isIcebox = (epic) => String(epic?.holder || '').startsWith('workspace:');
/** An Epic still open: not Done, not an Icebox. */
export const isOpenEpic = (epic) => statusKey(epic?.status) !== 'done' && !isIcebox(epic);

/** The four counts over an Epic's level-0 items (a Subtask is a step of its Task, not counted). */
export function epicCounts(items) {
  const counts = { todo: 0, progress: 0, review: 0, done: 0 };
  for (const item of items || []) if (item.level === 0) counts[statusKey(item.status)] += 1;
  return counts;
}

/** The Epic's epic-stage, score and counts. */
export function epicStage(epic, items) {
  const counts = epicCounts(items);
  const n = STAGE_KEYS.reduce((sum, key) => sum + counts[key], 0);
  const score = n ? STAGE_KEYS.reduce((sum, key) => sum + counts[key] * SCORE[key], 0) / n : 0;
  const stage = isIcebox(epic) ? 'icebox'
    : statusKey(epic?.status) === 'done' ? 'done'
      : !n ? 'empty' : score < 1.5 ? 'starter' : score < 2.5 ? 'working' : score < 3.25 ? 'maturing' : 'aging';
  return { stage, score, counts, n };
}

/**
 * WHAT NEEDS THE PERSON under an Epic (w897): an item In Review, a flagged one, and open work no
 * Agent holds (only a Team, or nobody). Each a yes or no; the stone says it in words, no counts.
 */
export function epicAttention(items) {
  const open = (items || []).filter((item) => item.level === 0 && statusKey(item.status) !== 'done');
  return {
    review: open.some((item) => statusKey(item.status) === 'review'),
    flagged: (items || []).some((item) => item.flagged && statusKey(item.status) !== 'done'),
    unassigned: open.some((item) => !String(item.holder || '').startsWith('agent:')),
  };
}

/** When the Epic last moved: the newest `moved` of it and every item under it ('' when none). */
export function epicMoved(epic, items) {
  return [epic, ...(items || [])].map((row) => String(row?.moved || '')).filter(Boolean).sort().at(-1) || '';
}

/** The phalanx's order: those needing the person first, then the most progressed, then the newest moved. */
export function orderEpics(rows) {
  const needs = (row) => Number(row.attention.review || row.attention.flagged || row.attention.unassigned);
  return [...rows].sort((a, b) => (needs(b) - needs(a)) || (b.score - a.score) || b.moved.localeCompare(a.moved));
}
