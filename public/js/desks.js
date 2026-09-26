/* part of the ronin-cowork client — see js/README.md */
/**
 * DESKS — one read of `/api/desks`, and the words every surface says about it.
 *
 * The control surface's visible half (Fable 4). A desk is one repository's branch and
 * the worktree on it; a session has one per repo it is changing. The server DERIVES
 * every fact here from git and the desk registry at the moment of asking — nothing an
 * agent maintains in prose — so a reading is never stale by more than one poll.
 *
 * THREE READERS, ONE RESOURCE. The tile head's ⑂ button, the roster's desk column and the
 * Team page's readings all read the store's `desks` (js/store.js), which the server pushes
 * on connect and on change. Before a connection has had that push, `refreshDesks` reads the
 * snapshot through the store: concurrent callers ride one request, and a read younger than
 * `FRESH_MS` is answered from memory.
 *
 * The roll-up (`2 desks · 1 pending · 3 private`) keeps paths and SHAs OUT of the row
 * (docs/architecture/worktrees.md "Surfaces that change": detail behind inspection). The tooltip carries
 * one line per desk: repo, branch, line, ahead/behind, dirt, pending, parked, blocked.
 */
import { get, snapshot } from './store.js';
import { clampTip } from './shingo.js';
import { t } from './lexicon.js';

let readAt = 0;
const FRESH_MS = 3000;

/** Re-read every session's desks through the store. Resolves true when the answer changed. */
export async function refreshDesks(force = false) {
  if (!force && Date.now() - readAt < FRESH_MS) return false;
  // A failed read keeps the last answer rather than blanking every ⑂.
  const read = await snapshot('desks');
  if (read.ok) readAt = Date.now();
  return read.changed;
}

/** One session's desks and roll-up, or null when nothing has been read for it. */
export const desksOf = (name) => (name && get('desks')?.[name]) || null; // session name -> { desks: [], rollup: {} }

const worktreeName = (worktree) => String(worktree || '').replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop() || '';

/** The ⑂ label: one worktree says its folder name; several say how many; none says `?`. */
export function deskLabel(entry) {
  const desks = entry?.desks || [];
  if (desks.length === 1) return '⑂ ' + (worktreeName(desks[0].worktree) || desks[0].branch || t('desks.detached', '(detached)'));
  return desks.length ? '⑂ ' + desks.length : '⑂ ?';
}

/**
 * The roll-up sentence — only the parts that are non-zero, so a plain single checkout
 * reads `1 worktree` and a busy assignment reads `2 worktrees · 1 pending · 3 private · 1 parked`.
 * Null when nothing is known, so a row can leave the column empty rather than say `0 worktrees`.
 */
export function deskReadout(entry) {
  const r = entry?.rollup;
  if (!r || !r.desks) return null;
  const parts = [r.desks === 1 ? t('desks.count_one', '1 worktree') : t('desks.count_many', '{n} worktrees', { n: r.desks })];
  if (r.pending) parts.push(t('desks.pending_n', '{n} pending', { n: r.pending }));
  if (r.private) parts.push(t('desks.private_n', '{n} private', { n: r.private }));
  if (r.dirty) parts.push(t('desks.dirty_n', '{n} dirty', { n: r.dirty }));
  if (r.parked) parts.push(t('desks.parked_n', '{n} parked', { n: r.parked }));
  if (r.blocked) parts.push(t('desks.blocked_n', '{n} blocked', { n: r.blocked }));
  return parts.join(' · ');
}

/** One line per worktree, for the expanded inspection. The worktree is the live coordinate. */
export function deskTip(entry) {
  const desks = entry?.desks || [];
  if (!desks.length) return t('desks.none', 'No managed worktree listed yet. A coding launch opens selected worktrees; the session lists its repositories in TEGAMI.');
  return clampTip(desks.map((d) => {
    const bits = [`${d.short || d.repo} — ${d.branch || t('desks.detached', '(detached)')}`];
    if (d.worktree) bits.push(t('desks.worktree', 'worktree {path}', { path: d.worktree }));
    if (d.line) bits.push(t('desks.line', '→ {line}', { line: d.line }));
    if (d.ahead) bits.push(t('desks.ahead', 'ahead {n}', { n: d.ahead }));
    if (d.behind) bits.push(t('desks.behind', 'behind {n}', { n: d.behind }));
    if (d.dirty) bits.push(t('desks.dirty_files', '{n} unsaved', { n: d.dirty_files?.length || 0 }));
    if (d.registry?.pending) bits.push(t('desks.pending_by', 'update pending, by {who}', { who: d.registry.pending.by || '?' }));
    if (d.readout === 'parked') bits.push(t('desks.parked', 'parked'));
    if (d.readout === 'unknown') bits.push(t('desks.unknown', 'not found on this box'));
    if (d.registry?.blocked) bits.push(t('desks.blocked', 'blocked: {why}', { why: d.registry.blocked }));
    return bits.join(' · ');
  }).join('\n'));
}
