/* part of the tmux-ronin client — see js/README.md
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
 * it shouldn't be. Titles are nice; they are not the point, and nothing is being passed
 * through here. Everything on this side is read-only: no element built in this module can
 * touch a session. A gate is answered by typing into the pane, like everything else.
 */

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
 */
export function clampTip(s) {
  return s.length > 120 ? s.slice(0, 119) + '…' : s;
}

export function makeChip(onTap) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'shingo-chip';
  btn.hidden = true;
  // Position, then how long it has sat there. The age is the cheapest true thing on the
  // tile — nobody maintains it, it is just the file's mtime — and beside a gate it reads
  // as how long the session has been waiting on YOU.
  const pos = document.createElement('span');
  const age = document.createElement('span');
  age.className = 'age';
  btn.append(pos, age);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onTap();
  });

  const set = (t) => {
    // No ladder up = nothing to show. The torii button is always there to read the
    // letter, so an absent chip costs the owner nothing and stops a dash-plus-age
    // pretending to be a position.
    if (!t || !t.chip || !t.ladder?.length) {
      btn.hidden = true;
      return null;
    }
    btn.hidden = false;
    pos.textContent = t.chip.text;
    const quiet = t.quietMs >= 60000 ? humanAge(t.quietMs) : '';
    age.textContent = quiet;
    btn.classList.toggle('gate', !!t.chip.gate);
    btn.classList.toggle('side', !!t.ladder_state);
    const held = t.chip.gate ? 'Held at a gate' : 'Tap for the ladder';
    // The objective is AGENT-AUTHORED and unbounded; the help box is three lines.
    // Clamp here at the source, or any session that writes a long objective overflows
    // the box and fails check-tips for everyone (it measures the live DOM).
    const ob = t.objective ? clampTip(t.objective) + '\n' : '';
    btn.title = ob + held +
      (quiet ? ' · ladder unchanged for ' + quiet : '');
    return t;
  };
  return { el: btn, set };
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
export function buildLadder(t) {
  const box = document.createElement('div');
  box.className = 'shingo-ladder';
  if (!t || !t.ladder || !t.ladder.length) {
    const empty = document.createElement('div');
    empty.className = 'sl-empty';
    empty.textContent = 'no ladder up yet';
    box.appendChild(empty);
    return box;
  }

  // Parked, in the agent's own words. Sits above the objective because it changes what
  // the whole ladder below it means: those statuses are true, they are just not moving.
  if (t.ladder_state) {
    const sr = document.createElement('div');
    sr.className = 'sl-side';
    sr.textContent = '↳ ' + t.ladder_state.replace(/_/g, ' ') + ' — the ladder below is held, not stale';
    box.appendChild(sr);
  }

  if (t.objective || t.session_job) {
    const ob = document.createElement('div');
    ob.className = 'sl-obj';
    if (t.session_job) {
      // What this SESSION is doing. It migrates — riffing becomes planning becomes
      // cutting code — so it is kept current rather than stamped at birth.
      const job = document.createElement('span');
      job.className = 'sl-job';
      job.textContent = t.session_job;
      ob.appendChild(job);
    }
    ob.append(t.objective || '');
    box.appendChild(ob);
  }

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
    el.appendChild(span('sl-t', text));
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
  let frontier = t.ladder.findIndex((r) => !finished(r));

  // THE POINTER WINS WHEN THERE IS ONE. `at` is a monitor's observation of where the
  // session actually is — {rung} for a gate, {rung, leg} for a leg, positions in the
  // letter as written. The frontier below is only what we infer from the agent's own
  // statuses, used when nobody is pointing. Either way the checkmarks stay the agent's,
  // which is the whole reason `at` is its own key.
  let atRung = -1;
  let atLeg = -1;
  if (t.at && Number.isInteger(t.at.rung) && t.at.rung >= 1 && t.at.rung <= t.ladder.length) {
    atRung = t.at.rung - 1;
    atLeg = Number.isInteger(t.at.leg) ? t.at.leg - 1 : -1;
    frontier = atRung;
  }

  let phaseNo = 0;
  for (const [i, rung] of t.ladder.entries()) {
    const live = i === frontier;

    if (rung.gate !== undefined) {
      // A gate is told apart by being labelled a gate — no glyph of its own. A passed
      // gate carries no mark either: a check beside "go / no-go" reads like a completed
      // chore rather than a door you came through.
      const g = row({ kind: 'gate', here: live, text: rung.gate, cls: 'st-' + (rung.status || 'GATE') });
      const tag = document.createElement('span');
      tag.className = 'sl-tag';
      tag.textContent = 'GATE';
      g.querySelector('.sl-t').before(tag);
      box.appendChild(g);
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
        tail.textContent = ' — legs undetermined';
        head.querySelector('.sl-t').appendChild(tail);
      }
      box.appendChild(head);
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
      box.appendChild(
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

  // How long the file has been sitting still. Not a check on the agent and not a
  // judgement — just the mtime, which is the one reading nobody has to maintain. It is
  // how "stopped somewhere it shouldn't be" becomes visible instead of guessed.
  if (t.quietMs != null && t.quietMs > 10 * 60 * 1000) {
    const q = document.createElement('div');
    q.className = 'sl-quiet';
    q.textContent = 'quiet ' + humanAge(t.quietMs);
    box.appendChild(q);
  }
  return box;
}

/**
 * THE LETTER ITSELF — the file, verbatim, in a real scrollable, selectable block.
 *
 * The chip and the ladder are an interpretation; this is the source. Every session gets
 * the torii whether or not it has a ladder up, because "what does this session's letter
 * actually say" is a question you ask most often when the readout looks wrong.
 *
 * Read-only, like everything on this side. Nothing here writes, and the only way to
 * change a letter remains the agent that owns it.
 */
export function buildLetter({ file, text }, onClose) {
  const wrap = document.createElement('div');
  wrap.className = 'shingo-letter';

  const head = document.createElement('div');
  head.className = 'sletter-head';
  const path = document.createElement('span');
  path.className = 'sletter-path';
  path.textContent = file || '';
  path.title = file || '';
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'sletter-x';
  x.textContent = '✕';
  x.title = 'Close';
  x.addEventListener('click', onClose);
  head.append(path, x);

  const body = document.createElement('pre');
  body.className = 'sletter-body';
  // No ladder is a legitimate state, not an error — say so plainly rather than showing
  // an empty box the reader has to interpret.
  body.textContent = text == null ? 'No letter on disk for this session yet.' : text;

  wrap.append(head, body);
  return wrap;
}

/** `51m`, `3h`, `2d` — short enough to sit on a board row. */
export function humanAge(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}
