/* part of the ronin-cowork client — see js/README.md */
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
  presetData,
  projectData,
  savedLaunchData,
  showReceipt,
} from './home.js';
import { IS_TOUCH, S } from './state.js';
import { button, field, status } from './ui.js';
import { buildJobShelves, draggableJob } from './jobclasses.js';
import { addProvMark, addYourOwn } from './provenance.js';

/**
 * @param {object} tile  a launched session opens in this tile
 * @param {HTMLElement} host  the null pane (`.home-null`)
 * @returns {{render: () => void, open: (kind: string, prompt?: string) => void}}
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
  // Credit, when the kind runs on somebody else's work (`credit:` in the catalog): a REAL
  // anchor on the opened form — never inside the kind button, where an anchor nested in a
  // button is invalid HTML, an axe violation the smoke gate fails on, and a stolen tap on
  // the phone. Here it is its own line with its own tap target.
  const creditEl = document.createElement('a');
  creditEl.className = 'ks-credit';
  creditEl.target = '_blank';
  creditEl.rel = 'noopener noreferrer';
  creditEl.hidden = true;
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
  // Real accessible names, zero visual change (ui.field is display:contents; the
  // labels are screen-reader-only — placeholders keep carrying the visual).
  const nameField = field(nameInp, { label: 'session name' });
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
  const whatField = field(what, { label: 'what this session is told' });
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
  // MCP on/off for THIS session — a mechanical pick like the model, live in both
  // modes. On (default): the CLI's own config applies, untouched. Off: the session
  // launches with no MCP servers at all — no shared memory, no connectors — via the
  // provider's own declared flags (`mcp_off:` in the launch table). Ronin neither
  // knows nor cares what was disconnected; a provider declaring no flags is refused
  // at launch rather than launched connected.
  let mcpOn = true;
  // The label says gbrain — the owner's ruling: "MCP" means nothing to a person, the
  // brain is the thing being switched. The tooltip tells the whole truth: off means NO
  // MCP servers at all, so any other connector the CLI is wired with goes with it.
  const mcpBtn = button('gbrain on', { cls: 'ks-mcp' });
  const applyMcp = () => {
    mcpBtn.textContent = mcpOn ? 'gbrain on' : 'gbrain off';
    mcpBtn.classList.toggle('off', !mcpOn);
    mcpBtn.title = mcpOn
      ? 'This session can reach gbrain — and any other MCP servers the CLI is wired with. Click to launch it with none.'
      : 'This session launches with NO MCP servers — gbrain and every other connector off. Click to launch connected.';
  };
  mcpBtn.addEventListener('click', () => {
    mcpOn = !mcpOn;
    applyMcp();
  });
  applyMcp();
  const startBtn = button('Start', { cls: 'home-go' });
  const cancelBtn = button('Cancel');
  // WHERE A FAILURE LANDS: the form's own status line, under the controls it refers
  // to. The text you typed stays in the boxes — a failed launch must never cost the
  // brief. ui.status: announced, hidden while empty.
  const err = status();
  const sayErr = (msg) => err.say(msg, msg ? 'bad' : '');
  // ＋save was removed from this row (owner, 2026-08-16): a form should offer cancel and
  // start, and the button's meaning was opaque. Saved launches still exist — the catalog
  // is hand-editable and existing presets still render below; only the write-from-the-form
  // door is gone.
  formRow.append(whereSel, modelSel, groupSel, mcpBtn, cancelBtn, startBtn);
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
  const seedField = field(seedInp, { label: 'read first — paths, comma-separated' });
  const injectInp = document.createElement('input');
  injectInp.type = 'text';
  injectInp.placeholder = 'extra instruction (optional)';
  injectInp.autocapitalize = 'off';
  const injectField = field(injectInp, { label: 'extra instruction' });
  // A group says "these people"; this says "that one". Reviewing or forking is
  // usually about ONE session, so pointing at it should not require typing a name.
  const refSel = document.createElement('select');
  refSel.title = 'Point this session at ONE existing session (review it, fork from it, watch it)';
  extras.append(seedField.el, injectField.el, refSel);
  const fillRef = () => {
    const cur = refSel.value;
    refSel.innerHTML = '';
    refSel.add(new Option('— no session —', ''));
    for (const s of S.sessions) refSel.add(new Option('@' + s.name, s.name));
    refSel.value = [...refSel.options].some((o) => o.value === cur) ? cur : '';
  };
  form.append(formHead, creditEl, modeRow, modeSay, nameField.el, whatField.el, formRow, err.el, extrasHead, extras);
  const grid2 = document.createElement('div');
  grid2.className = 'ks-grid';
  /* ---- job classes: the owner's shelves over this board (js/jobclasses.js) ---- */
  const shelves = buildJobShelves({
    jobButton: (k) => jobButton(k),
    allJobs: () => presetData || [],
    onChange: () => buildBoard(),
  });
  /* ---- saved launches: this form, filled in ahead of time and named ---- */
  // NOT macros. A macro is a program an agent runs; this is the launcher with the
  // boxes already ticked (docs/shadowing.md §saved launches). User scope only, so an
  // empty list is the ordinary state and the row simply is not drawn.
  const savedRow = document.createElement('div');
  savedRow.className = 'ks-saved';

  // "START YOUR SETUP SESSION" — the reading list's offer (settei's needed[]),
  // shown when an agent CLI is found AND the list is non-empty. It FILLS THE FORM
  // and stops, like every button on this board — the owner still reads and presses
  // Start. Judged once per build: the condition moves at the pace of setup, not of
  // tiles, and the record read costs a login-shell probe not worth re-paying.
  const offer = document.createElement('button');
  offer.className = 'ks-saved-btn ks-offer';
  offer.hidden = true;
  void (async () => {
    const r = await request('/api/settei');
    const rec = r.ok ? r.data : null;
    if (!rec || !(rec.needed ?? []).length || !(rec.status?.agents?.usable ?? []).length) return;
    offer.textContent = '新 start your setup session';
    offer.title = rec.needed.map((n) => n.needs).join(' · ');
    offer.addEventListener('click', () => open(rec.schema.seat.job, rec.schema.seat.prompt));
    offer.hidden = false;
  })();
  board.append(boardHead, offer, savedRow, shelves.wrap, grid2, shelves.add, form);
  host.appendChild(board);

  let kind = null;
  const closeForm = () => {
    kind = null;
    sayErr('');
    form.classList.remove('open');
    board.classList.remove('picking');
  };
  cancelBtn.addEventListener('click', closeForm);
  const jobButton = (k) => {
    const b = document.createElement('button');
    b.className = 'ks-btn';
    b.dataset.kind = k.name;
    draggableJob(b, k.name); // dropping it on a shelf ADDS it there — the roster's grammar
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
      // `mcp: always` — born connected (owner's ruling, 2026-08-17): the toggle does
      // not apply, so it is not offered. The spawn refuses a contradicting launch;
      // this just keeps the form honest about there being no choice.
      if (k.mcpAlways) mcpOn = true;
      mcpBtn.hidden = !!k.mcpAlways;
      applyMcp();
      formHead.textContent = `${k.icon} ${k.label} — ${k.ask}`;
      // textContent + server-vetted http(s) URL only — a catalog line must never
      // become markup here.
      creditEl.hidden = !k.credit;
      if (k.credit) {
        creditEl.textContent = `powered by ${k.credit.text} ↗`;
        creditEl.href = k.credit.url;
        creditEl.title = k.credit.url;
      } else {
        // Belt and braces with the [hidden] CSS: a kind with no credit must never
        // wear the previous kind's.
        creditEl.textContent = '';
        creditEl.removeAttribute('href');
      }
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
      // Board-wide, not grid2: a shelved job's button lives in its class's fold.
      board.querySelectorAll('.ks-btn').forEach((x) => x.classList.toggle('on', x.dataset.kind === k.name));
      if (!IS_TOUCH) nameInp.focus(); // name first — it is the field you answer first
    });
    return b;
  };

  const buildBoard = () => {
    grid2.innerHTML = '';
    const all = presetData || [];
    // The shelves render themselves and answer who they hold; a job on no shelf sits
    // flat under them, the roster's own answer for the untagged (js/jobclasses.js).
    const shelved = shelves.render();
    for (const k of all.filter((x) => !shelved.has(x.name))) grid2.appendChild(jobButton(k));
    if (!all.length) grid2.textContent = 'no kinds in ronin_catalogs/SESSION_JOBS.md';
    grid2.dataset.n = String(all.length);
    // HIDDEN, not gone (owner, 2026-08-21, OPEN_THREADS 4.31): the tile's whole answer
    // is a file path popped at a person mid-launch — developer-shaped, not owner-shaped.
    // It stays a consumer so the affordance survives to be redesigned, and one deleted
    // line brings it back.
    const own = addYourOwn('SESSION_JOBS.md', 'session job');
    own.hidden = true;
    grid2.appendChild(own);
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
        board.querySelector(`.ks-btn[data-kind="${CSS.escape(k.name)}"]`)?.click();
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
  // NO per-root model sync: there is ONE default for new sessions and the form's own
  // picker (owner's ruling, 2026-08-18) — a root does not choose a model for you.
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
        // Mechanical like the cmd, so it rides in BOTH modes; meaningless without an
        // agent, so a bare kind sends nothing and the server default (on) applies.
        mcp: bare ? undefined : mcpOn,
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

  // Service-owned Commons rooms can hand a task to an existing kind without growing
  // a second launcher. It fills this form and stops; the owner still reads and presses
  // Start. Unknown kinds are silent because catalogs can be user-replaced at runtime.
  const open = (name, promptText = '') => {
    render();
    const b = board.querySelector(`.ks-btn[data-kind="${CSS.escape(name)}"]`);
    if (!b) return;
    b.click();
    assistBtn.click();
    what.value = promptText;
    what.focus();
  };

  return { render, open };
}
