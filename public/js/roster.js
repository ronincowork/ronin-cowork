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
import { IS_TOUCH, S } from './state.js';
import { humanAge } from './shingo.js';

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
    const nm = document.createElement('b');
    nm.textContent = s.name;
    const grow = document.createElement('span');
    grow.className = 'grow';
    r.append(nm, grow);
    // SHINGO on the roll call: position, or held. One amber row and you know where
    // to click through — which is the whole reason the board exists.
    if (s.tegami && s.tegami.chip && s.tegami.ladder?.length) {
      const sg = document.createElement('span');
      sg.className = 'home-shingo' + (s.tegami.chip.gate ? ' gate' : '');
      // TOUCH: the age without the word. "quiet" costs five characters on a row that
      // has none to spare, and a bare duration beside a position reads as one anyway.
      const age = s.tegami.quietMs >= 60000 ? humanAge(s.tegami.quietMs) : '';
      const quiet = age ? (IS_TOUCH ? ' · ' : ' · quiet ') + age : '';
      sg.textContent = s.tegami.chip.text + quiet;
      sg.title = s.tegami.objective || '';
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
    // 🏷 on the row: set THIS session's groups without opening it first. Its own
    // button, not the row's click, so tapping the row still just opens the session.
    // TOUCH: no 🏷 at all. The list is already SORTED INTO GROUPS under headings,
    // so the label repeated the heading you just read — and the button was a verb
    // on a board that is meant to be a READ.
    if (!IS_TOUCH) {
      const tg = document.createElement('span');
      tg.className = 'home-tag' + ((s.tags || []).length ? ' on' : '');
      tg.textContent = (s.tags || []).length ? '🏷 ' + s.tags.join(' · ') : '🏷';
      tg.title = 'Set groups for ' + s.name;
      tg.addEventListener('click', (e) => {
        e.stopPropagation(); // don't connect — this is the label, not the door
        if (S.tagPanel) S.tagPanel.open(s.name);
      });
      r.appendChild(tg);
    }
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
