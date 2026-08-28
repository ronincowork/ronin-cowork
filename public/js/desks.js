/* part of the ronin-cowork client — see js/README.md */
/**
 * DESKS — one read of `/api/desks`, and the words every surface says about it.
 *
 * The control surface's visible half (Fable 4). A desk is one repository's branch and
 * the worktree on it; a session has one per repo it is changing. The server DERIVES
 * every fact here from git and the desk registry at the moment of asking — nothing an
 * agent maintains in prose — so a reading is never stale by more than one poll.
 *
 * THREE READERS, ONE FETCH. The tile head's ⑂ button, the roster's desk column and the
 * Team page's readings all ask on the same clock, so the fetch is shared and deduped:
 * concurrent callers ride one request, and a read younger than `FRESH_MS` is answered
 * from memory. The server memoises too; between the two, N tiles cost one git pass.
 *
 * The roll-up (`2 desks · 1 pending · 3 private`) keeps paths and SHAs OUT of the row
 * (WORKTREES.md "Surfaces that change": detail behind inspection). The tooltip carries
 * one line per desk: repo, branch, line, ahead/behind, dirt, pending, parked, blocked.
 */
import { request } from './request.js';
import { clampTip } from './shingo.js';
import { t } from './lexicon.js';

let data = new Map(); // session name -> { desks: [], rollup: {} }
let readAt = 0;
let inflight = null;
const FRESH_MS = 3000;

let seen = '';

/** Re-read every session's desks; shared and deduped. Resolves true when the answer changed. */
export async function refreshDesks(force = false) {
  if (inflight) return inflight;
  if (!force && Date.now() - readAt < FRESH_MS) return false;
  inflight = (async () => {
    const r = await request('/api/desks', { cache: 'no-store' });
    // A failed read keeps the last answer rather than blanking every ⑂ — the poll heals it.
    if (!r.ok || !r.data || typeof r.data !== 'object') return false;
    data = new Map(Object.entries(r.data));
    readAt = Date.now();
    const now = JSON.stringify(r.data);
    const changed = now !== seen;
    seen = now;
    return changed;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** One session's desks and roll-up, or null when nothing has been read for it. */
export const desksOf = (name) => (name && data.get(name)) || null;

/** The ⑂ label: one desk says its branch; several say how many; none says `?`. */
export function deskLabel(entry) {
  const desks = entry?.desks || [];
  if (desks.length === 1) return '⑂ ' + (desks[0].branch || t('desks.detached', '(detached)'));
  return desks.length ? '⑂ ' + desks.length : '⑂ ?';
}

/**
 * The roll-up sentence — only the parts that are non-zero, so a plain single checkout
 * reads `1 desk` and a busy assignment reads `2 desks · 1 pending · 3 private · 1 parked`.
 * Null when nothing is known, so a row can leave the column empty rather than say `0 desks`.
 */
export function deskReadout(entry) {
  const r = entry?.rollup;
  if (!r || !r.desks) return null;
  const parts = [r.desks === 1 ? t('desks.count_one', '1 desk') : t('desks.count_many', '{n} desks', { n: r.desks })];
  if (r.pending) parts.push(t('desks.pending_n', '{n} pending', { n: r.pending }));
  if (r.private) parts.push(t('desks.private_n', '{n} private', { n: r.private }));
  if (r.dirty) parts.push(t('desks.dirty_n', '{n} dirty', { n: r.dirty }));
  if (r.parked) parts.push(t('desks.parked_n', '{n} parked', { n: r.parked }));
  if (r.blocked) parts.push(t('desks.blocked_n', '{n} blocked', { n: r.blocked }));
  return parts.join(' · ');
}

/** One line per desk, for a tooltip. Paths and SHAs stay out; this is the inspection short of them. */
export function deskTip(entry) {
  const desks = entry?.desks || [];
  if (!desks.length) return t('desks.none', 'No desk listed yet. A coding launch opens one; the session lists its repos in TEGAMI.');
  return clampTip(desks.map((d) => {
    const bits = [`${d.short || d.repo} — ${d.branch || t('desks.detached', '(detached)')}`];
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

let teams = new Map(); // team -> the /api/teams/:name/desks answer

/** Re-read one team's desks view (lines, parked desks of gone sessions, promotion state). */
export async function refreshTeamDesks(team) {
  if (!team) return;
  const r = await request('/api/teams/' + encodeURIComponent(team) + '/desks', { cache: 'no-store' });
  if (r.ok && r.data) teams.set(team, r.data);
}

/**
 * THE TEAM PAGE'S ROWS, for its read-only configuration: the team line per repository
 * (`ronin-cowork → team/comp/dev` — one roster `branch` cannot name two repos' lines,
 * RONIN_CONTROL_SURFACE.md § 5), the promotion state off the ledger (the last complete
 * team promotion, or the receipt still blocking the team — an interrupted coordinated
 * advance is shown, never hidden), and the parked desks whose session is gone — the
 * lead's *hand in · inspect · reassign · discard* list (WORKTREES.md "Session loss").
 */
export function teamDeskRows(team) {
  const v = teams.get(team);
  if (!v) return [];
  const lines = Object.entries(v.lines || {}).map(([repo, line]) => `${repo} → ${line}`).join(' · ') || '—';
  const p = v.promotion || {};
  const promotion = p.blocking
    ? t('desks.promotion_blocking', '⚠ {state} — {summary} ({id})', { state: p.blocking.state, summary: p.blocking.summary, id: p.blocking.id })
    : p.last_good
      ? t('desks.promotion_last', 'last {summary} · {id} · by {who}', { summary: p.last_good.summary, id: p.last_good.id, who: p.last_good.by || '?' })
      : t('desks.promotion_none', 'none yet');
  const parked = (v.members || []).filter((m) => !m.live).map((m) => t('desks.parked_gone', '{name} · gone · {n} ahead', { name: m.session, n: m.rollup?.private || 0 })).join(' · ');
  return [
    [t('team.lines', 'Team lines'), lines],
    [t('team.promotion', 'Promotion'), promotion],
    [t('team.parked_desks', 'Parked desks'), parked || t('desks.parked_none', 'none')],
  ];
}
