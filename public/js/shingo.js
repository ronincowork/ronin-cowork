/* part of the ronin-cowork client — see js/README.md
 *
 * SHINGO (信号) — the session's ladder, made visible.
 *
 * Three surfaces, one payload, no second data path:
 *   the chip    a fixed-width readout in the tile header — position, or held
 *   the ladder  tap the chip and the whole thing unrolls over the pane
 *   the roster  the same fields as a row per session, in the commons ⌂ Roster
 *
 * The chip is the indicator; the click is ALWAYS the ladder. There is no gate view and
 * no detail view — one behaviour, nothing to learn.
 *
 * This is an OUTLINE INDICATOR, not a channel. It says moving / held / stopped somewhere
 * it shouldn'letter be. Titles are nice; they are not the point, and nothing is being passed
 * through here. Everything on this side is read-only: no element built in this module can
 * touch a session. A gate is answered by typing into the pane, like everything else.
 */
import { t } from './lexicon.js';

/** ✓ done · □ not done. Two marks, no legend, and they belong to legs only.
 *  Statuses are PLANNED · ACTIVE · DONE; GATE is a rung KIND, never a status. */
const MARK = { DONE: '✓', ACTIVE: '□', PLANNED: '□' };

/** Ronin's gate — the you-are-here mark. Its own column, outside everything else. */
const HERE = '⛩';

/**
 * The header chip. Hidden until a ladder exists — a session that keeps no TEGAMI costs
 * nothing on screen, which is what keeps this optional in practice as well as in theory.
 */
/**
 * Clamp agent-authored text before it becomes a hover label. The help box is a fixed
 * three lines (~120 chars at its width); stock labels are guaranteed to fit by
 * check-tips at build time, but a session's own words arrive at runtime and are
 * unbounded — without this, one long objective overflows the box and fails the gate
 * for the whole install.
 *
 * THE BUDGET IS THE WHOLE LABEL, not this fragment of it, which is why `room` exists
 * (2026-08-17). The chip does not hover its objective alone: it appends "Held at a gate ·
 * ladder unchanged for 3h" underneath. Clamping the objective to the full 120 and THEN
 * adding 45 more characters spends the budget twice, and check-tips duly failed at 165
 * chars / 17px over on a real session — the exact overflow the clamp was written to
 * prevent, walked around by its own caller. A caller that adds a tail passes what is left.
 */
export function clampTip(s, room = 120) {
  return s.length > room ? s.slice(0, room - 1) + '…' : s;
}

/**
 * The ladder — the same data the chip reads, at full zoom.
 *
 * ONE RUNG IS LIVE. You are waiting at the gate, or you are doing leg four; you cannot be
 * at both, and the ladder must never suggest otherwise. So exactly one row wears the
 * torii and the band, every other row is quiet, and a gate that is not holding anything
 * yet is drawn as plainly as a planned leg — amber is reserved for where the work is.
 *
 * Four columns, always in the same places, so the eye can run straight down any of them:
 *
 *   ⛩   □   4   seed letters, gate the staged client
 *   │   │   │   └── the agent's own words
 *   │   │   └────── which leg (the number the chip counts in)
 *   │   └────────── done or not
 *   └────────────── you are here
 */
export function buildLadder(letter, deskEntry = null) {
  const box = document.createElement('div');
  box.className = 'shingo-ladder';
  if (!letter) return box;

  const section = (label, cls = '') => {
    const el = document.createElement('section');
    el.className = 'sl-section' + (cls ? ' ' + cls : '');
    const head = document.createElement('h4');
    head.textContent = label;
    el.appendChild(head);
    box.appendChild(el);
    return el;
  };

  const firstOpen = letter.ladder?.find((rung) => rung.status !== 'DONE' || rung.legs?.some((leg) => leg.status !== 'DONE'));
  const summaryText = letter.chip?.text || (firstOpen?.gate !== undefined ? '⛩ ' + t('ladder.gate', 'GATE') : firstOpen?.phase || '');
  if (summaryText) {
    const summary = document.createElement('div');
    summary.className = 'sl-summary' + (letter.chip?.gate || firstOpen?.gate !== undefined ? ' gate' : '');
    summary.textContent = summaryText;
    box.appendChild(summary);
  }

  const task = section(t('ladder.task_at_hand', 'Task at hand'), 'sl-task');
  const objective = document.createElement('p');
  objective.textContent = letter.objective || t('ladder.task_unstated', 'No task stated in this work record.');
  task.appendChild(objective);
  if (letter.session_role) {
    const action = document.createElement('p');
    action.className = 'sl-action';
    action.append(t('ladder.current_action', 'Current action'), ' · ', letter.session_role);
    task.appendChild(action);
  }

  // Parked, in the agent's own words. Sits above the objective because it changes what
  // the whole ladder below it means: those statuses are true, they are just not moving.
  if (letter.ladder_state) {
    const sr = document.createElement('div');
    sr.className = 'sl-side';
    sr.textContent = '↳ ' + t('ladder.side', '{state} — the work record below is held, not stale', { state: letter.ladder_state.replace(/_/g, ' ') });
    box.appendChild(sr);
  }

  const desks = deskEntry?.desks || [];
  if (desks.length || letter.repos?.length) {
    const checkout = section(t('ladder.worktrees', 'Worktrees'), 'sl-checkout');
    const rows = desks.length ? desks : letter.repos;
    for (const item of rows) {
      const line = document.createElement('div');
      line.className = 'sl-checkout-line';
      if (item.worktree) {
        const worktree = document.createElement('strong');
        worktree.className = 'sl-worktree';
        worktree.textContent = item.worktree;
        line.appendChild(worktree);
      }
      if (item.branch) {
        const branch = document.createElement('span');
        branch.className = 'sl-branch';
        branch.textContent = t('ladder.branch', 'Branch') + ' · ' + item.branch;
        line.appendChild(branch);
      }
      if (item.repo) {
        const repo = document.createElement('span');
        repo.className = 'sl-repo';
        repo.textContent = item.repo.replace(/^.*[/:]([^/]+\/[^/]+?)(\.git)?$/, '$1');
        repo.title = item.repo;
        line.appendChild(repo);
      }
      checkout.appendChild(line);
    }
  }

  if ((letter.teams ?? []).length) {
    const context = section(t('ladder.coworks', 'Coworks'), 'sl-context');
    for (const entry of letter.teams ?? []) {
      const team = document.createElement('p');
      team.textContent = entry.team;
      context.appendChild(team);
    }
  }

  const docs = section(t('ladder.tracked_documents', 'Tracked documents'), 'sl-docs');
  if (letter.docs?.length) {
    for (const item of letter.docs) {
      const row = document.createElement('p');
      row.textContent = typeof item === 'string' ? item : (item.path || item.file || item.title || '');
      row.title = row.textContent;
      docs.appendChild(row);
    }
  } else {
    const empty = document.createElement('p');
    empty.className = 'sl-empty';
    empty.textContent = t('ladder.docs_none', 'No tracked documents.');
    docs.appendChild(empty);
  }

  // Checkout facts remain useful before the session has drawn a ladder. The branch and
  // repo header buttons open this panel, so returning early above would make both buttons
  // open a panel that hid the very values they name.
  if (!letter.ladder?.length) {
    const empty = document.createElement('div');
    empty.className = 'sl-empty';
    empty.textContent = t('ladder.none', 'no work record yet');
    box.appendChild(empty);
    return box;
  }

  const progress = section(t('ladder.progress', 'Progress'), 'sl-progress');

  /**
   * One row. Only the torii column runs the whole ladder — the mark and the number
   * belong to legs, so a gate or a phase heading does not reserve them and sit indented
   * in front of columns it will never fill.
   *
   *   phase   Phase 1 · audit                          flush left, it is a heading
   *   gate    ⛩ [GATE] go / no-go …                    torii column only
   *   leg     ⛩  □  4  seed letters …                  all three
   */
  const row = ({ kind = 'leg', here = false, n = '', mark = '', text = '', cls = '' }) => {
    const el = document.createElement('div');
    el.className = 'sl-row sl-' + kind + (cls ? ' ' + cls : '') + (here ? ' now' : '');
    const span = (c, v) => {
      const x = document.createElement('span');
      x.className = c;
      x.textContent = v;
      return x;
    };
    // Column order, fixed: torii · done-or-not · leg # · description.
    if (kind !== 'phase') el.appendChild(span('sl-here', here ? HERE : ''));
    if (kind === 'leg') el.append(span('sl-m', mark), span('sl-n', n));
    el.appendChild(span('sl-letter', text));
    return el;
  };

  // THE FRONTIER — the first rung not finished. The same rule the chip counts by, so the
  // header and the ladder can never disagree about where the session is. Everything
  // before it is history; everything after it is a plan, including any gate down there.
  // A phase with NO legs is undetermined, not finished — `[].every()` is true, which
  // would quietly mark an empty phase complete and walk the torii past it.
  const finished = (r) =>
    r.gate !== undefined
      ? r.status === 'DONE'
      : (r.legs || []).length > 0 && r.legs.every((l) => l.status === 'DONE');
  let frontier = letter.ladder.findIndex((r) => !finished(r));

  // THE POINTER WINS WHEN THERE IS ONE. `at` is a monitor's observation of where the
  // session actually is — {rung} for a gate, {rung, leg} for a leg, positions in the
  // letter as written. The frontier below is only what we infer from the agent's own
  // statuses, used when nobody is pointing. Either way the checkmarks stay the agent's,
  // which is the whole reason `at` is its own key.
  let atRung = -1;
  let atLeg = -1;
  if (letter.at && Number.isInteger(letter.at.rung) && letter.at.rung >= 1 && letter.at.rung <= letter.ladder.length) {
    atRung = letter.at.rung - 1;
    atLeg = Number.isInteger(letter.at.leg) ? letter.at.leg - 1 : -1;
    frontier = atRung;
  }

  let phaseNo = 0;
  for (const [i, rung] of letter.ladder.entries()) {
    const live = i === frontier;

    if (rung.gate !== undefined) {
      // A gate is told apart by being labelled a gate — no glyph of its own. A passed
      // gate carries no mark either: a check beside "go / no-go" reads like a completed
      // chore rather than a door you came through.
      const g = row({ kind: 'gate', here: live, text: rung.gate, cls: 'st-' + (rung.status || 'GATE') });
      const tag = document.createElement('span');
      tag.className = 'sl-tag';
      tag.textContent = t('ladder.gate', 'GATE');
      g.querySelector('.sl-letter').before(tag);
      progress.appendChild(g);
      continue;
    }

    const legs = rung.legs || [];
    phaseNo++;
    if (rung.phase) {
      // Phases are NUMBERED to match the chip: it says "phase 3 · 3/4", so there must be
      // a Phase 3 with four legs and three checked, or the chip is a coordinate into a
      // map with no grid on it. Gates are never numbered — they are not phases.
      const done = legs.filter((l) => l.status === 'DONE').length;
      const head = row({ kind: 'phase', text: 'Phase ' + phaseNo + ' · ' + rung.phase });
      if (legs.length) {
        const frac = document.createElement('span');
        frac.className = 'sl-frac';
        frac.textContent = done + '/' + legs.length;
        head.appendChild(frac);
      } else {
        // The honesty rule: a phase whose legs are undetermined shows nothing under it.
        const tail = document.createElement('i');
        tail.className = 'sl-und';
        tail.textContent = ' ' + t('ladder.legs_undetermined', '— legs undetermined');
        head.querySelector('.sl-letter').appendChild(tail);
      }
      progress.appendChild(head);
    }

    // Inside the live phase the torii sits on the ACTIVE leg — or, if the agent marked
    // none, on the first leg still open. In every other phase, nothing is lit.
    let hereLeg = -1;
    if (live) {
      if (atLeg >= 0) hereLeg = atLeg;
      else {
        hereLeg = legs.findIndex((l) => l.status === 'ACTIVE');
        if (hereLeg < 0) hereLeg = legs.findIndex((l) => l.status !== 'DONE');
      }
    }
    legs.forEach((leg, j) => {
      progress.appendChild(
        row({
          here: j === hereLeg,
          n: String(j + 1),
          mark: MARK[leg.status] || MARK.PLANNED,
          text: leg.title,
          cls: 'st-' + leg.status,
        }),
      );
    });
  }

  return box;
}

/*
 * `buildLetter` stood here until 2026-08-17 — the TEGAMI file verbatim, in a selectable
 * <pre>, opened from a ⛩ in the tile header. The owner removed that button (the torii
 * now means "the Commons" everywhere), which left this with no caller, and an unreachable
 * renderer is a corpse check-dead is right to refuse.
 *
 * What went with it is worth naming, because the comment that stood here argued for it:
 * the chip and the ladder are an INTERPRETATION, and this was the source. If the raw view
 * is ever wanted again it belongs inside the ladder panel, where the reader already is.
 * `GET /api/sessions/:name/tegami/raw` still serves it — the route is michi's and stays.
 */

/** `51m`, `3h`, `2d` — short enough to sit on a board row. */
export function humanAge(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}
