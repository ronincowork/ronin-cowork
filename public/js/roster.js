/* part of the tmux-ronin client — see js/README.md */
/**
 * ⌂ ROSTER — the session list, and the one number above it.
 *
 * Extracted from commons.js when buildHome() was reduced to the control-plane shell:
 * the roster is a room like Wipeboard or Docs, and the shell's job is mounting rooms,
 * not owning two of them. Same DOM, same classes, same behaviour — the move is
 * ownership, not redesign.
 *
 * The roster is a READ whose rows are doors: tap a row and that session fills the
 * tile. Anything you want to DO to a session you do inside it (the phone rule), with
 * the one desktop exception of 🏷 on a row, which opens the same group editor the
 * tile's own 🏷 opens.
 */
import { request } from './request.js';
import { STATUS_LABEL, homeData, homeFault, jobIcon } from './home.js';
import { S } from './state.js';
import { clampTip, humanAge } from './shingo.js';

/**
 * @param {object} tile  rows connect into this tile
 * @param {HTMLElement} host  the roster section inside the commons' main pane
 * @returns {{render: () => void}}
 */
export function buildRoster(tile, host) {
  // THE SESSION MAX — the top line, and the only place it is set.
  //
  // One number the owner types. It is not derived from RAM or anything else: a machine
  // that guesses your limit is a machine you have to argue with. 0 means no limit, which
  // is also what an install that has never touched this does.
  //
  // It sits above the list because it is a fact ABOUT the list — "4 / 6" reads as one
  // line with the roster under it. Saved on `change` (blur or Enter), never per keystroke:
  // typing "12" over "6" would otherwise briefly save "1" and refuse a launch for it.
  const maxRow = document.createElement('div');
  maxRow.className = 'home-maxrow';
  const maxLab = document.createElement('label');
  maxLab.textContent = 'session max';
  const maxInp = document.createElement('input');
  // Four tiles build four rosters, so a fixed id here was four elements wearing one
  // id — latent (label-for resolved to the first tile's input from every tile).
  // The tile's index keeps it unique and keeps the label honest.
  maxInp.id = `sessionmax-${tile.index}`;
  maxLab.htmlFor = maxInp.id;
  maxInp.type = 'number';
  maxInp.min = '0';
  maxInp.step = '1';
  maxInp.className = 'home-max';
  maxInp.title = 'How many sessions may run at once. 0 = no limit. The owner sets this; agents cannot.';
  const maxNow = document.createElement('span');
  maxNow.className = 'home-maxnow';
  let maxLive = 0;
  const paintMax = () => {
    // "4 / 6 running" when a limit is set; just the count when it is not, because
    // "4 / 0" reads as an error rather than as freedom.
    const m = Number(maxInp.value) || 0;
    maxNow.textContent = m > 0 ? `${maxLive} / ${m} running` : `${maxLive} running · no limit`;
    maxNow.classList.toggle('full', m > 0 && maxLive >= m);
  };
  const loadMax = async () => {
    const r = await request('/api/session-max', { cache: 'no-store' });
    // The roster still works without it — the field just shows what it last knew.
    if (!r.ok) return;
    if (document.activeElement !== maxInp) maxInp.value = String(r.data.max ?? 0);
    maxLive = r.data.live ?? 0;
    paintMax();
  };
  maxInp.addEventListener('change', async () => {
    const n = Math.max(0, Math.floor(Number(maxInp.value) || 0));
    const r = await request('/api/session-max', { method: 'PUT', json: { max: n } });
    if (!r.ok) {
      // The failure lands on the line that states the rule, not in a browser alert.
      maxNow.textContent = 'not saved — ' + r.message;
      maxNow.classList.add('full');
      setTimeout(loadMax, 2500);
      return;
    }
    // Echo what was STORED, not what was typed — the server floors and validates, and a
    // field showing a different number from the one in force is the worst of both.
    maxInp.value = String(r.data.max);
    maxLive = r.data.live ?? maxLive;
    paintMax();
  });
  maxRow.append(maxLab, maxInp, maxNow);
  host.appendChild(maxRow);

  // A refresh that failed must not look like a quiet roster: one line, above the list,
  // present only while the last /api/home read did not land (home.js keeps the fact).
  const stale = document.createElement('div');
  stale.className = 'home-stale';
  stale.hidden = true;
  host.appendChild(stale);

  const list = document.createElement('div');
  list.className = 'home-list';
  host.appendChild(list);

  // A ROW IS A FIXED GRID, NOT A FLOW (owner's ruling 2026-08-17). Every landmark on
  // the right — the SHINGO chip, the status word, the ⛽ reading — sits at the SAME x on
  // every row, so the eye runs straight down a column instead of hunting for where each
  // reading landed. A session with no ladder leaves the ladder's slot EMPTY; it does not
  // pull the context reading left. That was the whole complaint: right-aligned flow meant
  // no two rows agreed on where anything was, and a list you cannot scan down is a list
  // you have to read one row at a time.
  //
  // The columns are declared once in style.css (`.home-row`, the `--hr-*` tracks) and
  // each cell is placed by its class, so an ABSENT element leaves its track standing.
  // Nothing here builds a placeholder: a missing reading is a gap, which is the honest
  // drawing of "nobody has said", and a gap in a fixed column reads as one.
  const rowFor = (s) => {
    const r = document.createElement('button');
    r.type = 'button';
    r.className = 'home-row';
    // The session's MARK: the icon of the session_job in its LETTER, on every row. It
    // replaced the 人, which named only who was in charge, had to be set by hand, and
    // left every other row blank — the job is what actually differs between two
    // sessions on this board, and the coordinator is the one whose job is QuarterBack.
    //
    // READ-ONLY here, and that is the point: the session writes its own session_job
    // with write_tegami as it migrates, so the roster shows what the session says it is
    // doing. A click-to-change on this glyph would put the owner's hand on a field the
    // letter hands to the agent — and then two writers would race over one line.
    // Blank until the session has written its letter; nothing is guessed on its behalf.
    const jb = document.createElement('span');
    const mark = jobIcon(s);
    jb.className = 'home-job' + (mark ? '' : ' off');
    jb.dataset.job = s.session_job || ''; // so style can reach one mark — see style.css
    jb.textContent = mark;
    jb.title = mark ? s.session_job : 'has not said what it is doing yet';
    r.appendChild(jb);
    // The name takes the slack (`minmax(0, 1fr)`), so the spacer `.grow` that used to
    // shove the readings rightwards is gone with the flex row it existed to stretch —
    // pushing things apart is what made every row's landmarks land somewhere different.
    const nm = document.createElement('b');
    nm.textContent = s.name;
    r.appendChild(nm);
    // SHINGO on the roll call: position, or held. One amber row and you know where
    // to click through — which is the whole reason the board exists.
    if (s.tegami && s.tegami.chip && s.tegami.ladder?.length) {
      const sg = document.createElement('span');
      sg.className = 'home-shingo' + (s.tegami.chip.gate ? ' gate' : '');
      // THE AGE WITHOUT THE WORD, on every device now (owner's ruling 2026-08-17). It
      // was already the touch spelling — "quiet" costs five characters on a row that has
      // none to spare, and a bare duration beside a position reads as one anyway — and
      // the desktop had no better claim on the width. `phase 3 · leg 3/12 · 9h`.
      const age = s.tegami.quietMs >= 60000 ? humanAge(s.tegami.quietMs) : '';
      sg.textContent = s.tegami.chip.text + (age ? ' · ' + age : '');
      // Agent-authored and unbounded — clamped for the fixed help box (see shingo.js).
      sg.title = s.tegami.objective ? clampTip(s.tegami.objective) : '';
      r.appendChild(sg);
    }
    if (s.status) {
      const st = document.createElement('span');
      st.className = 'home-status st-' + s.status;
      st.textContent = STATUS_LABEL[s.status] || s.status;
      r.appendChild(st);
    }
    if (s.ctx != null) {
      const cx = document.createElement('span');
      cx.className = 'home-ctx';
      cx.textContent = '⛽ ' + s.ctx + '%';
      r.appendChild(cx);
    }
    // WHICH MODEL IS ANSWERING — that is the whole column (owner's ruling 2026-08-17).
    //
    // It shipped for an hour as `agent · provider · model` — `codex · openai · gpt-5.6-sol`
    // — and the owner cut it to the model alone: "showing just the model is fine, that
    // tells everyone what they need to know." He is right, and the other two were paying
    // for themselves twice over: `opus 5` already says Claude and `gpt-5.6-sol` already
    // says Codex, so the agent restated the model and the provider restated the agent.
    //
    // The width claim that came with the three-part version was WRONG, and it is recorded
    // here because it is the kind of wrong that survives if nobody measures. It said the
    // column cost the session name 116px of 237px. Measured in the browser afterwards, the
    // name track is 181px and the longest name on this board needs 81px — the names were
    // never close to starved. What the arithmetic missed is that a fixed track charges its
    // FULL width whether or not anything is in it, so a 140px column showing nothing on
    // every row was the actual cost. Sizing a track to the worst case its content can
    // reach is what eats a row, not the number of facts in it.
    //
    // SCRAPED, NOT STAMPED, and that is why it works at all today: js/../src/ctx.ts reads
    // it off the pane's own status line on the refresh that is already happening, so it is
    // right for sessions that predate every option this house has ever set, and it follows
    // a mid-session model switch instead of remembering the launch.
    //
    // A MISSING FACT IS SIMPLY ABSENT — no `undefined`, no `unknown`, no dash. The roster's
    // own rule, from the SHINGO chip (js/shingo.js): "an absent chip costs the owner
    // nothing and stops a dash-plus-age pretending to be a position". A dash here would
    // read as a state a session is IN rather than as a thing nobody has said.
    //
    // Lowercased as rendered and NOT mapped: `Opus 5` becomes `opus 5`, and that is the
    // whole transform. The owner turned down a three-letter-code registry.
    const stack = (s.model || '').toLowerCase();
    if (stack) {
      const sk = document.createElement('span');
      sk.className = 'home-stack';
      sk.textContent = stack;
      // The cell clips (see style.css), so the untruncated reading has to be reachable.
      sk.title = stack;
      r.appendChild(sk);
    }
    // 🏷 on the row: set THIS session's groups without opening it first. Its own
    // button, not the row's click, so tapping the row still just opens the session.
    // TOUCH: no 🏷 at all. The list is already SORTED INTO GROUPS under headings,
    // so the label repeated the heading you just read — and the button was a verb
    // on a board that is meant to be a READ.
    //
    // NO 🏷 ON A ROSTER ROW AT ALL (owner's ruling 2026-08-17, twice). The first pass
    // dropped the tag NAMES and kept the button, on the reasoning that it was the only
    // way to edit groups without opening the session. The owner's answer: that is not a
    // gap, it is the design — "the way you change the tag is by going into a particular
    // session and clicking on that session's tag button", which is the 🏷 in the tile
    // header (tilehead.js). A verb that already has a home does not need a second one on
    // a board whose whole job is to be READ, and the rows are already filed under the
    // very headings the button was there to edit.
    r.addEventListener('click', () => tile.connect(s.name));
    return r;
  };

  const render = () => {
    // The max line rides the roster's own refresh — no second timer, and it never
    // overwrites the field while it has focus (see loadMax).
    void loadMax();
    stale.hidden = !homeFault;
    if (homeFault) stale.textContent = '⚠ roster may be stale — ' + homeFault;
    const data = homeData || S.sessions.map((s) => ({ ...s, status: null, ctx: null }));
    list.innerHTML = '';
    // Sorted by group, with a heading per group. A session in two groups is listed
    // under BOTH — that's what multi-valued tags mean, and either row opens the same
    // session. Untagged sessions fall to the bottom under "no group". When nothing is
    // tagged at all the headings are skipped entirely, so an untagged setup looks
    // exactly as it did before.
    const groups = [...new Set(data.flatMap((s) => s.tags || []))].sort();
    if (!groups.length) {
      for (const s of data) list.appendChild(rowFor(s));
    } else {
      const heading = (text, n) => {
        const h = document.createElement('div');
        h.className = 'home-grp';
        h.append(Object.assign(document.createElement('b'), { textContent: text }));
        h.append(Object.assign(document.createElement('span'), { textContent: String(n) }));
        list.appendChild(h);
      };
      for (const g of groups) {
        const mem = data.filter((s) => (s.tags || []).includes(g));
        heading(g, mem.length);
        for (const s of mem) list.appendChild(rowFor(s));
      }
      const loose = data.filter((s) => !(s.tags || []).length);
      if (loose.length) {
        heading('no group', loose.length);
        for (const s of loose) list.appendChild(rowFor(s));
      }
    }
    if (!data.length) {
      list.innerHTML = '<span class="home-empty">no sessions yet</span>';
    }
  };

  return { render };
}
