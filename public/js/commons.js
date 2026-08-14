/* part of the tmux-ronin client — see js/README.md */
import { humanAge } from './shingo.js';
import {
  STATUS_LABEL,
  brainData,
  homeData,
  loadSavedLaunches,
  presetData,
  projectData,
  refreshHome,
  savedLaunchData,
  showReceipt,
} from './home.js';
import { IS_TOUCH, S, serviceOff } from './state.js';
import { buildHotwords } from './hotwords.js';
import { buildKoshi } from './koshi.js';
import { buildProjectRoots } from './projectroots.js';
import { buildStats } from './stats.js';
import { buildWipeboard } from './wipeboard.js';
import { buildDocs } from './docs.js';
import { addProvMark, addYourOwn } from './provenance.js';

export function buildHome(tile) {
  const el = document.createElement('div');
  el.className = 'home';
  // Which admin pane is showing. Was a single `.browsing` class while there were only
  // two; with the wipeboard there are three, so the pane is named rather than toggled
  // (CSS matches on [data-pane]). Default = the session list, as before.
  el.dataset.pane = 'sessions';
  // Home is the SESSION LIST, full stop. It used to be two columns — sessions left,
  // macro forms right — and the forms were removed 2026-08-09 at the owner's word
  // ("it's in the way"): a form whose entire output is `+forkit: topic=x` duplicates
  // the line you can type into the session itself. Macros get their own tab; the
  // reference lives there and the prefill lives on the tile.
  // The column stays a CSS grid (auto-fit, never a media query) because a home panel
  // is sized by its TILE, not the window.
  // THREE PANES, one element, one showing at a time (CSS matches [data-pane]):
  // the null pane (koshidashi — buttons that put a session out to work), the home
  // pane (the session list and the launcher), and the wipeboard (one surface a set
  // of agents all read and write).
  // The admin panes live behind a tab strip, so you can get back to any of them at
  // any time — including while a session is connected. Before this, spawning a
  // session replaced the home panel and there was no way back to it.
  const tabs = document.createElement('div');
  tabs.className = 'home-tabs';
  const mkTab = (v, label, hint) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.pane = v;
    b.textContent = label;
    b.title = hint;
    b.addEventListener('click', () => showPane(v));
    tabs.appendChild(b);
    return b;
  };
  const homeTab = mkTab('sessions', '⌂ Roster', 'The running sessions');
  mkTab('new', '＋ New session', 'Put a session out to work');
  mkTab('wipe', '▤ Wipeboard', 'One surface a set of agents all read and write');
  // MDEDIT — kin to the wipeboard and next to it: both are files a session keeps, rendered
  // where the owner already is. The difference is ownership — a board is shared by a set of
  // sessions, a doc belongs to the one that listed it.
  mkTab('docs', '▧ Docs', 'The docs each session is working on — buildouts, handoffs, plans');
  // '▣ Roots' on the tab, '▣ Project root' everywhere it fits: the strip is 402px
  // wide on a phone and this was the label that ran off the end of it. The title
  // carries the full name, and so do the Commons menu and the Stats row.
  mkTab('proj', '▣ Roots', 'Project root — which directories on this machine are part of your Ronin');
  mkTab('hotwords', '▥ Hotwords', 'Words dictation keeps getting wrong — the glossary sent with your voice');
  mkTab('stats', '▦ Stats', 'How this install actually gets used — TOMODACHI');
  mkTab('koshi', '目 Koshi', 'Which model each Koshi job asks');
  // A tab owned by a service that is not registered is visible but opaque-and-inert —
  // the same treatment as the lock button on a build with no record service.
  tabs.querySelectorAll('button[data-pane]').forEach((b) => {
    if (serviceOff(b.dataset.pane)) {
      b.classList.add('off');
      b.disabled = true;
      b.title = 'Off — this service is not installed.';
    }
  });
  homeTab.classList.add('on'); // matches the panel's default pane (see el.dataset.pane)
  const closeTab = document.createElement('button');
  closeTab.className = 'home-x';
  closeTab.textContent = '✕';
  closeTab.title = 'Back to the terminal';
  tabs.appendChild(closeTab);
  const nullPane = document.createElement('div');
  nullPane.className = 'home-null';
  const mainPane = document.createElement('div');
  mainPane.className = 'home-main';
  const wipePane = document.createElement('div');
  wipePane.className = 'home-wipe';
  const docsPane = document.createElement('div');
  docsPane.className = 'home-docs';
  const projPane = document.createElement('div');
  projPane.className = 'home-proj';
  const hotwordsPane = document.createElement('div');
  hotwordsPane.className = 'home-hotwords';
  const statsPane = document.createElement('div');
  statsPane.className = 'home-stats';
  const koshiPane = document.createElement('div');
  koshiPane.className = 'home-koshi';
  el.append(tabs, nullPane, mainPane, wipePane, docsPane, projPane, hotwordsPane, statsPane, koshiPane);
  const showPane = (which) => {
    if (serviceOff(which)) return; // an inert tab's pane, asked for by any other route
    el.dataset.pane = which;
    tabs.querySelectorAll('button[data-pane]').forEach((b) => b.classList.toggle('on', b.dataset.pane === which));
    if (which === 'sessions') render();
    if (which === 'wipe') wipe.enter();
    if (which === 'docs') docs.enter();
    if (which === 'proj') proj.enter();
    if (which === 'hotwords') words.enter();
    if (which === 'koshi') koshi.enter();
    if (which === 'stats') stats.enter();
  };
  // ✕ only makes sense once a session is showing behind the panel.
  closeTab.addEventListener('click', () => tile.hideHome());
  const colL = document.createElement('div');
  colL.className = 'home-col';
  mainPane.append(colL);
  const sec = (title, col) => {
    const s = document.createElement('div');
    s.className = 'home-sec';
    const h = document.createElement('div');
    h.className = 'home-h';
    h.textContent = title;
    s.appendChild(h);
    (col || colL).appendChild(s);
    return s;
  };

  // -- sessions --
  const secList = sec('sessions');

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
  maxLab.htmlFor = 'sessionmax';
  const maxInp = document.createElement('input');
  maxInp.id = 'sessionmax';
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
    try {
      const r = await fetch('/api/session-max', { cache: 'no-store' });
      const d = await r.json();
      if (document.activeElement !== maxInp) maxInp.value = String(d.max ?? 0);
      maxLive = d.live ?? 0;
      paintMax();
    } catch {
      /* the roster still works without it — the field just shows what it last knew */
    }
  };
  maxInp.addEventListener('change', async () => {
    const n = Math.max(0, Math.floor(Number(maxInp.value) || 0));
    try {
      const r = await fetch('/api/session-max', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ max: n }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      // Echo what was STORED, not what was typed — the server floors and validates, and a
      // field showing a different number from the one in force is the worst of both.
      maxInp.value = String(d.max);
      maxLive = d.live ?? maxLive;
      paintMax();
    } catch (e) {
      alert('Could not set the session max:\n' + e.message);
      loadMax();
    }
  });
  maxRow.append(maxLab, maxInp, maxNow);
  secList.appendChild(maxRow);

  const list = document.createElement('div');
  list.className = 'home-list';
  secList.appendChild(list);

  // -- group picker, shared by the ＋ New session board --
  // There used to be a second, smaller launcher here: a "new session" row offering
  // claude / codex / shell plus a group, posting the launch_quick variant. Removed
  // 2026-08-12 at the owner's word — two ways to start a session that behave
  // differently (this one had no model choice and no project_root) is two kinds of
  // session start to maintain and a coin toss for whoever is looking at it.
  // ＋ New session is THE launcher. These helpers stay: the board's own group
  // picker is the remaining caller.
  // Which group the new session is born into. Tagging at birth is the only kind that
  // reliably happens — nobody goes back to label a session later.
  const NEWGRP = '\u0000new';
  const fillGroups = (sel) => {
    const cur = sel.value;
    sel.innerHTML = '';
    sel.add(new Option('— group —', ''));
    for (const g of [...new Set(S.sessions.flatMap((x) => x.tags || []))].sort()) sel.add(new Option(g, g));
    sel.add(new Option('＋ new group…', NEWGRP));
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : '';
  };
  const wireNewGroup = (sel) => sel.addEventListener('change', () => {
    if (sel.value !== NEWGRP) return;
    const g = (prompt('New group name (letters, digits, - _):') || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (g) {
      sel.add(new Option(g, g), sel.options.length - 1);
      sel.value = g;
    } else {
      sel.value = '';
    }
  });

  /* ---- the koshidashi board (null pane) ---- */
  const board = document.createElement('div');
  board.className = 'ks-board';
  const boardHead = document.createElement('div');
  boardHead.className = 'ks-head';
  boardHead.textContent = 'put a session out to work';
  // The spawn form: which kind you pressed, then the two things only you can answer —
  // what the work is, and where it happens. Hidden until a kind is chosen.
  const form = document.createElement('div');
  form.className = 'ks-form';
  const formHead = document.createElement('div');
  formHead.className = 'ks-form-h';
  // Two text blocks, in the order you answer them: what it's CALLED, then what it's
  // TOLD. The name is how you address the session afterwards (`+tag:`, tejun-send,
  // the tile header), so with a dozen of these running it is not a detail — in
  // manual mode it is required, because a name slugged off your first 28 characters
  // would be Ronin putting words in your mouth, which is the one thing manual isn't.
  const nameInp = document.createElement('input');
  nameInp.type = 'text';
  nameInp.className = 'ks-name';
  nameInp.autocapitalize = 'off';
  nameInp.autocomplete = 'off';
  nameInp.spellcheck = false;
  nameInp.maxLength = 40;
  nameInp.title = 'session name — how you address this session afterwards';
  // Show the REAL name as it is typed. The transform is character-for-character
  // (lowercase, anything else -> '_'), so the length never changes and the caret
  // stays where it was — safe to run on every keystroke, mid-string edits included.
  nameInp.addEventListener('input', () => {
    const clean = nameInp.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (clean === nameInp.value) return;
    const at = nameInp.selectionStart;
    nameInp.value = clean;
    nameInp.setSelectionRange(at, at);
  });
  const what = document.createElement('textarea');
  what.rows = 2;
  what.autocapitalize = 'off';
  what.spellcheck = false;
  const formRow = document.createElement('div');
  formRow.className = 'home-ctl';
  // The two universal axes, chosen independently: project_root (where) and
  // session_job (what for — the button you pressed — and therefore who the agent
  // is; the kind carries the posture, there is no separate role to pick).
  const whereSel = document.createElement('select');
  whereSel.title = 'project_root — where the work happens (sets the directory + reading list)';
  const modelSel = document.createElement('select');
  modelSel.className = 'ks-model'; // hidden for an agentless kind — there is no brain to pick
  modelSel.title = 'Which brain to launch';
  const groupSel = document.createElement('select');
  groupSel.title = 'Group the new session joins (tag)';
  const startBtn = document.createElement('button');
  startBtn.className = 'home-go';
  startBtn.textContent = 'Start';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  // Keep this form as a named tile. The other half of saved launches: without it the
  // catalog could only ever be written by hand, and a preset you cannot make from the
  // thing you are already looking at is a preset nobody makes.
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'ks-save';
  saveBtn.textContent = '＋ save';
  saveBtn.title = 'Save these choices as a named launch, in your own catalogs store';
  saveBtn.addEventListener('click', async () => {
    if (!kind) return;
    const raw = prompt('Name this launch (letters, digits, - _):', kind.name.toLowerCase());
    const name = (raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!name) return;
    saveBtn.disabled = true;
    try {
      const r = await fetch('/api/saved-launches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          label: raw.trim(),
          session_job: kind.name,
          project_root: whereSel.value,
          group: groupSel.value === NEWGRP ? '' : groupSel.value,
          mode,
          prompt: what.value.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'could not save it');
      await loadSavedLaunches();
    } catch (e) {
      alert(String(e.message || e));
    } finally {
      saveBtn.disabled = false;
    }
  });
  formRow.append(whereSel, modelSel, groupSel, saveBtn, cancelBtn, startBtn);
  // Two ways to start a session, toggled here.
  //  manual   — your text IS the prompt, sent byte for byte. Ronin does only the
  //             mechanical part (directory, CLI, dial, tags). No wording of ours.
  //  assisted — say it long-form up here, fix a few things below if you want, and
  //             the brief is composed (role posture, reading list, opening, ack).
  //             This is the seat Koshi will fill.
  const modeRow = document.createElement('div');
  modeRow.className = 'ks-mode';
  const mkMode = (v, label, hint) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mode = v;
    b.textContent = label;
    b.title = hint;
    return b;
  };
  const manualBtn = mkMode('manual', 'manual', 'Your text is the whole prompt — nothing added, nothing templated');
  const assistBtn = mkMode('assisted', 'assisted', 'Say it long-form; Ronin composes the brief around it');
  const modeNote = document.createElement('small');
  modeRow.append(manualBtn, assistBtn, modeNote);
  // A sentence under the toggle saying plainly what each mode does with your words.
  // Nobody should have to guess whether their text is being rewritten.
  const modeSay = document.createElement('p');
  modeSay.className = 'ks-say';
  let mode = 'manual'; // the honest default: what you type is what the agent gets
  const applyMode = () => {
    manualBtn.classList.toggle('on', mode === 'manual');
    assistBtn.classList.toggle('on', mode === 'assisted');
    form.classList.toggle('assisted', mode === 'assisted');
    modeNote.textContent = mode === 'manual' ? 'your words, untouched' : 'Koshi fills the rest';
    modeSay.textContent =
      mode === 'manual'
        ? 'Sent word for word — nothing added.'
        : 'Say it in plain terms and Koshi your AI admin will handle the rest; the below selections are optional.';
    what.placeholder =
      mode === 'manual'
        ? (kind && kind.ask) || 'exactly what you want said to the agent'
        : 'Describe in plain terms what this session should do and cover…';
    nameInp.placeholder =
      mode === 'manual' ? 'session name (required)' : 'session name (optional — named from your text)';
    nameInp.classList.toggle('req', mode === 'manual');
  };
  manualBtn.addEventListener('click', () => {
    mode = 'manual';
    applyMode();
  });
  assistBtn.addEventListener('click', () => {
    mode = 'assisted';
    applyMode();
  });
  // Optional extras — assisted only; in manual they would be wording we inject.
  const extrasHead = document.createElement('div');
  extrasHead.className = 'ks-extras-h';
  extrasHead.textContent = 'optional';
  const extras = document.createElement('div');
  extras.className = 'ks-extras';
  const seedInp = document.createElement('input');
  seedInp.type = 'text';
  seedInp.placeholder = 'read first (optional): paths, comma-separated';
  seedInp.autocapitalize = 'off';
  seedInp.spellcheck = false;
  const injectInp = document.createElement('input');
  injectInp.type = 'text';
  injectInp.placeholder = 'extra instruction (optional)';
  injectInp.autocapitalize = 'off';
  // A group says "these people"; this says "that one". Reviewing or forking is
  // usually about ONE session, so pointing at it should not require typing a name.
  const refSel = document.createElement('select');
  refSel.title = 'Point this session at ONE existing session (review it, fork from it, watch it)';
  extras.append(seedInp, injectInp, refSel);
  const fillRef = () => {
    const cur = refSel.value;
    refSel.innerHTML = '';
    refSel.add(new Option('— no session —', ''));
    for (const s of S.sessions) refSel.add(new Option('@' + s.name, s.name));
    refSel.value = [...refSel.options].some((o) => o.value === cur) ? cur : '';
  };
  form.append(formHead, modeRow, modeSay, nameInp, what, formRow, extrasHead, extras);
  const grid2 = document.createElement('div');
  grid2.className = 'ks-grid';
  /* ---- saved launches: this form, filled in ahead of time and named ---- */
  // NOT macros. A macro is a program an agent runs; this is the launcher with the
  // boxes already ticked (docs/shadowing.md §saved launches). User scope only, so an
  // empty list is the ordinary state and the row simply is not drawn.
  const savedRow = document.createElement('div');
  savedRow.className = 'ks-saved';

  board.append(boardHead, savedRow, grid2, form);
  nullPane.appendChild(board);

  let kind = null;
  const closeForm = () => {
    kind = null;
    form.classList.remove('open');
    board.classList.remove('picking');
  };
  cancelBtn.addEventListener('click', closeForm);
  const buildBoard = () => {
    grid2.innerHTML = '';
    for (const k of presetData || []) {
      const b = document.createElement('button');
      b.className = 'ks-btn';
      b.dataset.kind = k.name;
      // The kind's own name carries the mark: a job of yours, or one of ours you
      // replaced, is a fact about THIS tile and belongs on it (js/provenance.js).
      const kLabel = Object.assign(document.createElement('b'), { textContent: k.label });
      addProvMark(kLabel, k);
      b.append(
        Object.assign(document.createElement('i'), { textContent: k.icon }),
        kLabel,
        Object.assign(document.createElement('small'), { textContent: k.blurb }),
      );
      b.addEventListener('click', () => {
        kind = k;
        // `agent: none` (tejun_catalogs/SESSION_JOBS.md) — a plain terminal. No brain to pick,
        // no brief to compose, so the form drops to the two things that still mean
        // something: what it is called and where it opens. Manual is not a "mode" here,
        // it is the only truth available: nothing is sent at all.
        if (k.agent === false) mode = 'manual';
        form.classList.toggle('noagent', k.agent === false);
        formHead.textContent = `${k.icon} ${k.label} — ${k.ask}`;
        nameInp.value = '';
        what.value = '';
        seedInp.value = '';
        injectInp.value = '';
        fillWhere();
        fillModels();
        fillGroups(groupSel);
        fillRef();
        applyMode();
        form.classList.add('open');
        board.classList.add('picking');
        grid2.querySelectorAll('.ks-btn').forEach((x) => x.classList.toggle('on', x.dataset.kind === k.name));
        if (!IS_TOUCH) nameInp.focus(); // name first — it is the field you answer first
      });
      grid2.appendChild(b);
    }
    if (!(presetData || []).length) grid2.textContent = 'no kinds in tejun_catalogs/SESSION_JOBS.md';
    grid2.dataset.n = String((presetData || []).length);
    // The end of the list is where you find out the list is yours to extend.
    grid2.appendChild(addYourOwn('SESSION_JOBS.md', 'kind'));
  };

  const buildSaved = () => {
    savedRow.innerHTML = '';
    const saved = savedLaunchData || [];
    savedRow.dataset.n = String(saved.length);
    if (!saved.length) return; // nothing shipped, nothing saved: say nothing
    const head = document.createElement('div');
    head.className = 'ks-saved-h';
    head.textContent = 'saved launches';
    savedRow.appendChild(head);
    for (const l of saved) {
      const b = document.createElement('button');
      b.className = 'ks-saved-btn';
      b.textContent = l.label;
      addProvMark(b, l);
      b.title = [l.session_job, l.project_root && `▣ ${l.project_root}`, l.group && `🏷 ${l.group}`, l.mode]
        .filter(Boolean)
        .join(' · ');
      // It FILLS THE FORM and stops — the same discipline as the tile's ⚡ menu. A
      // saved launch that started a session on one tap would be a button that spawns
      // an agent by accident, and the form is where you check what you are about to do.
      b.addEventListener('click', () => {
        const k = (presetData || []).find((p) => p.name === l.session_job);
        if (!k) {
          alert(`"${l.label}" names session_job "${l.session_job}", which is not in the catalog.`);
          return;
        }
        grid2.querySelector(`.ks-btn[data-kind="${CSS.escape(k.name)}"]`)?.click();
        if (l.project_root) whereSel.value = l.project_root;
        if (l.group) {
          if (![...groupSel.options].some((o) => o.value === l.group)) groupSel.add(new Option(l.group, l.group), groupSel.options.length - 1);
          groupSel.value = l.group;
        }
        if (l.mode === 'assisted') assistBtn.click();
        if (l.prompt) what.value = l.prompt;
      });
      savedRow.appendChild(b);
    }
  };

  wireNewGroup(groupSel); // the board's own group picker gets the same "+ new group" flow
  const fillWhere = () => {
    const cur = whereSel.value;
    whereSel.innerHTML = '';
    if (!projectData || !projectData.length) {
      whereSel.add(new Option('— no project_roots —', ''));
      return;
    }
    for (const r of projectData) {
      const o = new Option(r.name, r.name);
      o.title = r.remit;
      whereSel.add(o);
    }
    whereSel.value = [...whereSel.options].some((o) => o.value === cur) ? cur : projectData[0].name;
  };
  // Every launchable brain in the launch table, by its REAL model name
  // ("anthropic · opus") — never a cheap/mid/heavy euphemism. Table order, so the
  // first option is the provider's default (anthropic → opus) and that is what a
  // fresh form starts on.
  const fillModels = () => {
    const cur = modelSel.value;
    modelSel.innerHTML = '';
    const seen = new Set();
    for (const b of brainData || []) {
      if (!b.cmd || seen.has(b.cmd)) continue;
      seen.add(b.cmd);
      modelSel.add(new Option(`${b.provider} · ${b.model}`, b.cmd));
    }
    if (!seen.size) modelSel.add(new Option('claude', 'claude'));
    modelSel.value = [...modelSel.options].some((o) => o.value === cur) ? cur : modelSel.options[0].value;
  };
  // Keep the brain in step with the project unless you have chosen one yourself.
  let modelTouched = false;
  modelSel.addEventListener('change', () => {
    modelTouched = true;
  });
  whereSel.addEventListener('change', () => {
    if (modelTouched) return;
    const proj = (projectData || []).find((r) => r.name === whereSel.value);
    if (proj && proj.cmd && [...modelSel.options].some((o) => o.value === proj.cmd)) modelSel.value = proj.cmd;
  });
  // Enter in the name moves to the prompt rather than launching a nameless session.
  nameInp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    what.focus();
  });
  // Enter sends; Shift+Enter is a newline — a long-form brief needs paragraphs.
  what.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      startBtn.click();
    }
  });
  startBtn.addEventListener('click', async () => {
    if (!kind || startBtn.disabled) return; // disabled == in flight: two taps, one session
    const wantName = nameInp.value.trim().replace(/^[_-]+|[_-]+$/g, '');
    if (mode === 'manual' && !wantName) {
      nameInp.focus(); // required in manual — see the SpawnForm.name note
      return;
    }
    const bare = kind.agent === false; // no agent: there is nothing to say to it
    const text = what.value.trim();
    if (!bare && !text) {
      what.focus();
      return;
    }
    startBtn.disabled = true;
    try {
      // The server owns the spawn: it resolves the form against the catalogs,
      // assembles the brief, and sets the dial at birth. The browser only reports
      // what you picked — no briefing assembled here, no third catalog.
      const r = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_job: kind.name,
          mode,
          prompt: text,
          name: wantName, // empty (assisted only) = derive it from the kind + prompt

          project_root: whereSel.value,
          // Manual sends only the mechanical picks. Seed and inject are all
          // WORDING — in manual mode they would be text we put in your mouth.
          // An agentless kind sends no command at all; the server refuses to
          // substitute one for it (src/spawn.ts resolveForm).
          cmd: bare ? '' : modelSel.value,
          tags: groupSel.value && groupSel.value !== NEWGRP ? [groupSel.value] : [],
          seed:
            mode === 'manual'
              ? []
              : seedInp.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
          inject: mode === 'manual' ? '' : injectInp.value.trim(),
          reference: mode === 'manual' ? '' : refSel.value,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      closeForm();
      showReceipt(d.name, d.receipt);
      tile.connect(d.name); // watch it boot live — the pane is the truth
    } catch (e) {
      alert('Could not put a session out:\n' + e.message);
    }
    startBtn.disabled = false;
  });


  // The wipeboard pane. Built last so it can ask whether it is the one on screen.
  const wipe = buildWipeboard(tile, wipePane, () => tile.homeVisible() && el.dataset.pane === 'wipe');
  const docs = buildDocs(tile, docsPane, () => tile.homeVisible() && el.dataset.pane === 'docs');
  // The Project Root pane: the inclusion_list, and the two verbs that maintain it.
  const proj = buildProjectRoots(projPane, () => tile.homeVisible() && el.dataset.pane === 'proj');
  // The dictation glossary. Built last with the other panes, same contract.
  // 'hotwords', not 'words' — the pane key was renamed with the feature and this
  // predicate was missed, so it answered false forever and the pane never counted
  // itself as showing.
  const words = buildHotwords(hotwordsPane, () => tile.homeVisible() && el.dataset.pane === 'hotwords');
  const koshi = buildKoshi(koshiPane, () => tile.homeVisible() && el.dataset.pane === 'koshi');
  const stats = buildStats(statsPane);

  // Re-render the LIVE parts (session list, target options); forms keep their state.
  const render = () => {
    if (!el.classList.contains('show')) return;
    // The max line rides the roster's own refresh — no second timer, and it never
    // overwrites the field while it has focus (see loadMax).
    void loadMax();
    // The preset board is rebuilt only when the catalog first arrives (or changes
    // count) — never mid-pick, so an open form keeps its state. The count is recorded
    // rather than measured off the DOM: the grid also carries the "add your own" tile,
    // so childElementCount has not equalled the catalog length since provenance landed,
    // and comparing them rebuilt the board on every single refresh.
    if (presetData && grid2.dataset.n !== String(presetData.length)) buildBoard();
    if (savedRow.dataset.n !== String((savedLaunchData || []).length)) buildSaved();
    const data = homeData || S.sessions.map((s) => ({ ...s, status: null, ctx: null }));
    list.innerHTML = '';
    const rowFor = (s, g) => {
      const r = document.createElement('button');
      r.type = 'button';
      r.className = 'home-row';
      // 人 (the *nin* of 浪人) = this session COORDINATES a group. Inside a group's list
      // the glyph is the SWITCH — tap it to make this session that group's leader, tap
      // again to stand it down (lit = leads, dim = doesn't). Outside a group listing it
      // is just the mark. Owner-set by construction: this is the only way to set it in
      // the UI, and no agent-facing tool writes @ronin-lead.
      const leadsThis = g && (s.leads || []).includes(g);
      // TOUCH: the mark becomes a COLOUR, not a character. 人 plus its tap padding is
      // ~30px on every row of a phone-width list, spent saying a thing one accent on
      // the name says as well. The leader's name is simply accent-coloured instead.
      //
      // The cost is real and deliberate: inside a group's list the glyph is also the
      // SWITCH (tap to promote / stand down), so on a phone there is now no way to
      // appoint a leader. Making the name itself the switch would fight the row, whose
      // whole job is to open the session. Appointing is a desktop verb for now.
      if (IS_TOUCH) {
        if (leadsThis || (!g && (s.leads || []).length)) r.classList.add('leads');
      } else if (g || (s.leads || []).length) {
        const ld = document.createElement('span');
        ld.className = 'home-lead' + (g ? ' btn' : '') + (g && !leadsThis ? ' off' : '');
        ld.textContent = '人';
        ld.title = g
          ? (leadsThis ? 'Leads ' + g + ' — tap to stand down' : 'Make ' + s.name + ' the leader of ' + g)
          : 'Leads: ' + (s.leads || []).join(' · ');
        if (g) {
          ld.addEventListener('click', async (e) => {
            e.stopPropagation(); // the glyph is the switch, the row is still the door
            const next = leadsThis
              ? (s.leads || []).filter((x) => x !== g)
              : [...(s.leads || []), g];
            try {
              const res = await fetch('/api/sessions/' + encodeURIComponent(s.name) + '/leads', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ leads: next }),
              });
              const d = await res.json().catch(() => ({}));
              const live = S.sessions.find((x) => x.name === s.name);
              const saved = Array.isArray(d.leads) ? d.leads : next;
              s.leads = saved;
              if (live) live.leads = saved;
              refreshHome(); // re-sorts: the leader jumps to the head of its group
            } catch (_) {}
          });
        }
        r.appendChild(ld);
      }
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
      // on a board that is meant to be a READ. The rule the phone board follows now:
      // the home board tells you where everything stands and its rows are doors;
      // anything you want to DO to a session, you do inside that session, where the
      // メ sheet's Groups row opens the same editor.
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
    // Sorted by group, with a heading per group. A session in two groups is listed
    // under BOTH — that's what multi-valued tags mean, and either row opens the same
    // session. Untagged sessions fall to the bottom under "no group". When nothing is
    // tagged at all the headings are skipped entirely, so an untagged setup looks
    // exactly as it did before.
    // A group exists if anyone is tagged into it OR leads it — a leader with an empty
    // group is still a group, and hiding it would hide the person running it.
    const groups = [...new Set(data.flatMap((s) => [...(s.tags || []), ...(s.leads || [])]))].sort();
    if (!groups.length) {
      for (const s of data) list.appendChild(rowFor(s, null));
    } else {
      const heading = (text, n) => {
        const h = document.createElement('div');
        h.className = 'home-grp';
        h.append(Object.assign(document.createElement('b'), { textContent: text }));
        h.append(Object.assign(document.createElement('span'), { textContent: String(n) }));
        list.appendChild(h);
      };
      for (const g of groups) {
        // 人 first: the session coordinating this group heads its own list, whether or
        // not it is also tagged into it (leading is not membership).
        const leads = data.filter((s) => (s.leads || []).includes(g));
        const rest = data.filter((s) => (s.tags || []).includes(g) && !leads.includes(s));
        heading(g, leads.length + rest.length);
        for (const s of [...leads, ...rest]) list.appendChild(rowFor(s, g));
      }
      const loose = data.filter((s) => !(s.tags || []).length && !(s.leads || []).length);
      if (loose.length) {
        heading('no group', loose.length);
        for (const s of loose) list.appendChild(rowFor(s, null));
      }
    }
    if (!data.length) {
      list.innerHTML = '<span class="home-empty">no sessions yet</span>';
    }
  };

  return { el, render, showPane };
}

/* ---------- WIPEBOARD — the third commons pane (tab: ▤ Wipeboard) ----------
 * One surface a set of agents all read and write, so several sessions working the same
 * problem talk to each other instead of every message routing through the owner. The
 * whole mechanism is a file (co-working/user_repo/wipeboards/<name>.md) and a tmux option
 * (@ronin-wipeboards) — this pane just renders it and lets the owner post and steer.
 *
 * Ronin never reaches into an agent: it announces a path and shows a file. That is why
 * this works for any CLI. See docs/wipeboards.md.
 */
/* ---------- KOSHI_DASHI — the receipt for a spawn ----------
 * A launch goes straight through with no confirm screen, which is only honest if
 * the result is visible and undoable at the same speed it fired. So the receipt
 * names what the session was actually born with — role, project, brain, dial —
 * and carries a kill next to it. Wrong fill: one tap, gone.
 */
