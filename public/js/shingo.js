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

  const set = (letter) => {
    // No ladder up = nothing to show. The torii button is always there to read the
    // letter, so an absent chip costs the owner nothing and stops a dash-plus-age
    // pretending to be a position.
    if (!letter || !letter.chip || !letter.ladder?.length) {
      btn.hidden = true;
      return null;
    }
    btn.hidden = false;
    pos.textContent = letter.chip.text;
    const quiet = letter.quietMs >= 60000 ? humanAge(letter.quietMs) : '';
    age.textContent = quiet;
    btn.classList.toggle('gate', !!letter.chip.gate);
    btn.classList.toggle('side', !!letter.ladder_state);
    const held = letter.chip.gate ? 'Held at a gate' : 'Tap for the ladder';
    // The objective is AGENT-AUTHORED and unbounded; the help box is three lines.
    // Clamp here at the source, or any session that writes a long objective overflows
    // the box and fails check-tips for everyone (it measures the live DOM).
    //
    // THE TAIL IS BUILT FIRST because it is the part that must survive. It says whether
    // the session is stuck; the objective is context for that answer. Handing its length
    // to `clampTip` is what stops the two of them adding up past the box — they used to,
    // and check-tips caught it at 165 chars on a live session (2026-08-17). Clamping the
    // JOINED string instead would have trimmed the wrong end.
    const tail = held + (quiet ? ' · ladder unchanged for ' + quiet : '');
    const ob = letter.objective ? clampTip(letter.objective, 120 - tail.length - 1) + '\n' : '';
    btn.title = ob + tail;
    return letter;
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
export function buildLadder(letter) {
  const box = document.createElement('div');
  box.className = 'shingo-ladder';
  if (!letter) return box;

  // Parked, in the agent's own words. Sits above the objective because it changes what
  // the whole ladder below it means: those statuses are true, they are just not moving.
  if (letter.ladder_state) {
    const sr = document.createElement('div');
    sr.className = 'sl-side';
    sr.textContent = '↳ ' + letter.ladder_state.replace(/_/g, ' ') + ' — the ladder below is held, not stale';
    box.appendChild(sr);
  }

  // WHERE THIS WORK LANDS. Branch is first and visually strongest because it is the
  // coordinate that changes during ordinary work; repo is the stable context beneath it.
  if (letter.repos?.length) {
    const checkout = document.createElement('div');
    checkout.className = 'sl-checkout';
    for (const item of letter.repos) {
      const line = document.createElement('div');
      line.className = 'sl-checkout-line';
      if (item.branch) {
        const branch = document.createElement('strong');
        branch.className = 'sl-branch';
        branch.textContent = '⑂ ' + item.branch;
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
    box.appendChild(checkout);
  }

  if (letter.objective || letter.session_role || (letter.teams ?? []).length) {
    const ob = document.createElement('div');
    ob.className = 'sl-obj';
    for (const entry of letter.teams ?? []) {
      // The TEAMS this session is on — contextual identity, derived from the rosters
      // (R35): the team's name, and its team_role when the roster states one.
      const team = document.createElement('span');
      team.className = 'sl-role';
      team.textContent = entry.team_role ? `${entry.team} · ${entry.team_role}` : entry.team;
      ob.appendChild(team);
    }
    if (letter.session_role) {
      // What this SESSION is DOING. It migrates — riffing becomes planning becomes
      // cutting code — so it is kept current rather than stamped at birth.
      const job = document.createElement('span');
      job.className = 'sl-job';
      job.textContent = letter.session_role;
      ob.appendChild(job);
    }
    ob.append(letter.objective || '');
    box.appendChild(ob);
  }

  // Checkout facts remain useful before the session has drawn a ladder. The branch and
  // repo header buttons open this panel, so returning early above would make both buttons
  // open a panel that hid the very values they name.
  if (!letter.ladder?.length) {
    const empty = document.createElement('div');
    empty.className = 'sl-empty';
    empty.textContent = t('ladder.none', 'no ladder up yet');
    box.appendChild(empty);
    return box;
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
        tail.textContent = ' ' + t('ladder.legs_undetermined', '— legs undetermined');
        head.querySelector('.sl-letter').appendChild(tail);
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
  // how "stopped somewhere it shouldn'letter be" becomes visible instead of guessed.
  if (letter.quietMs != null && letter.quietMs > 10 * 60 * 1000) {
    const q = document.createElement('div');
    q.className = 'sl-quiet';
    q.textContent = t('ladder.quiet', 'quiet {age}', { age: humanAge(letter.quietMs) });
    box.appendChild(q);
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
