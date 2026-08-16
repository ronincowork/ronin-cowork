/* part of the tmux-ronin client — see js/README.md */
/**
 * ＋ NEW SESSION — the koshidashi board: buttons that put a session out to work.
 *
 * Extracted from commons.js with the roster, for the same reason: starting work is a
 * room, and the shell mounts rooms. The board, the form, the saved launches and the
 * group picker moved together — they are one workflow with one piece of state (`kind`).
 *
 * A launch goes straight through with no confirm screen, which is only honest if the
 * result is visible and undoable at the same speed it fired — that is the receipt
 * (home.js showReceipt), with a kill button on it.
 *
 * Failures land on the form's own notice line and never close it: typed work survives
 * a recoverable failure, and a browser alert over a live terminal steals the keyboard.
 */
import { request } from './request.js';
import {
  launchSpecData,
  loadSavedLaunches,
  presetData,
  projectData,
  savedLaunchData,
  showReceipt,
} from './home.js';
import { IS_TOUCH, S } from './state.js';
import { addProvMark, addYourOwn } from './provenance.js';

/**
 * @param {object} tile  a launched session opens in this tile
 * @param {HTMLElement} host  the null pane (`.home-null`)
 * @returns {{render: () => void}}
 */
export function buildLauncher(tile, host) {
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
  const wireNewGroup = (sel) =>
    sel.addEventListener('change', () => {
      if (sel.value !== NEWGRP) return;
      const g = (prompt('New group name (letters, digits, - _):') || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (g) {
        sel.add(new Option(g, g), sel.options.length - 1);
        sel.value = g;
      } else {
        sel.value = '';
      }
    });

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
  modelSel.className = 'ks-model'; // hidden for an agentless kind — there is no session_launch_spec to pick
  modelSel.title = 'Which session_launch_spec to launch';
  const groupSel = document.createElement('select');
  groupSel.title = 'Group the new session joins (tag)';
  const startBtn = document.createElement('button');
  startBtn.className = 'home-go';
  startBtn.textContent = 'Start';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  // WHERE A FAILURE LANDS: the form's own line, under the controls it refers to.
  // The text you typed stays in the boxes — a failed launch must never cost the brief.
  const err = document.createElement('div');
  err.className = 'ks-err';
  err.hidden = true;
  const sayErr = (msg) => {
    err.hidden = !msg;
    err.textContent = msg || '';
  };
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
    sayErr('');
    const r = await request('/api/saved-launches', {
      method: 'POST',
      json: {
        name,
        label: raw.trim(),
        session_job: kind.name,
        project_root: whereSel.value,
        group: groupSel.value === NEWGRP ? '' : groupSel.value,
        mode,
        prompt: what.value.trim(),
      },
    });
    if (!r.ok) sayErr('could not save it — ' + r.message);
    else await loadSavedLaunches();
    saveBtn.disabled = false;
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
  form.append(formHead, modeRow, modeSay, nameInp, what, formRow, err, extrasHead, extras);
  const grid2 = document.createElement('div');
  grid2.className = 'ks-grid';
  /* ---- saved launches: this form, filled in ahead of time and named ---- */
  // NOT macros. A macro is a program an agent runs; this is the launcher with the
  // boxes already ticked (docs/shadowing.md §saved launches). User scope only, so an
  // empty list is the ordinary state and the row simply is not drawn.
  const savedRow = document.createElement('div');
  savedRow.className = 'ks-saved';

  board.append(boardHead, savedRow, grid2, form);
  host.appendChild(board);

  let kind = null;
  const closeForm = () => {
    kind = null;
    sayErr('');
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
        // `agent: none` (ronin_catalogs/SESSION_JOBS.md) — a plain terminal. No session_launch_spec to pick,
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
        sayErr('');
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
    if (!(presetData || []).length) grid2.textContent = 'no kinds in ronin_catalogs/SESSION_JOBS.md';
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
          sayErr(`"${l.label}" names session_job "${l.session_job}", which is not in the catalog.`);
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
  // Every session_launch_spec in the launch table, by its REAL model name
  // ("anthropic · opus") — never a cheap/mid/heavy euphemism. Table order, so the
  // first option is the provider's default (anthropic → opus) and that is what a
  // fresh form starts on.
  const fillModels = () => {
    const cur = modelSel.value;
    modelSel.innerHTML = '';
    const seen = new Set();
    for (const b of launchSpecData || []) {
      if (!b.cmd || seen.has(b.cmd)) continue;
      seen.add(b.cmd);
      modelSel.add(new Option(`${b.provider} · ${b.model}`, b.cmd));
    }
    if (!seen.size) modelSel.add(new Option('claude', 'claude'));
    modelSel.value = [...modelSel.options].some((o) => o.value === cur) ? cur : modelSel.options[0].value;
  };
  // Keep the session_launch_spec in step with the project unless you have chosen one yourself.
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
    sayErr('');
    // The server owns the spawn: it resolves the form against the catalogs,
    // assembles the brief, and sets the dial at birth. The browser only reports
    // what you picked — no briefing assembled here, no third catalog.
    const r = await request('/api/launch', {
      method: 'POST',
      json: {
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
      },
    });
    if (!r.ok) {
      // The brief stays in the box and the form stays open: a failed launch costs a
      // retry, never the words.
      sayErr('could not put a session out — ' + r.message);
    } else {
      closeForm();
      showReceipt(r.data.name, r.data.receipt);
      tile.connect(r.data.name); // watch it boot live — the pane is the truth
    }
    startBtn.disabled = false;
  });

  const render = () => {
    // The preset board is rebuilt only when the catalog first arrives (or changes
    // count) — never mid-pick, so an open form keeps its state. The count is recorded
    // rather than measured off the DOM: the grid also carries the "add your own" tile,
    // so childElementCount has not equalled the catalog length since provenance landed,
    // and comparing them rebuilt the board on every single refresh.
    if (presetData && grid2.dataset.n !== String(presetData.length)) buildBoard();
    if (savedRow.dataset.n !== String((savedLaunchData || []).length)) buildSaved();
  };

  return { render };
}
