/* part of the ronin-cowork client — see js/README.md */
import { macroData } from './home.js';
import { PAD_CONTROLS, PAD_KEYS, PAD_LAYOUT, PAD_WIDGETS, firePadSend, padBinds, savePadBinds } from './pad.js';
import { field, sheet, toast } from './ui.js';
import { toClipboard } from './panels.js';
import { S } from './state.js';
import { WL_COMBOS, WL_ENCODER, WL_JOYSTICK, WL_RONIN_KEYMAP, wlConnect, wlDownload, wlWriteFile } from './weblink.js';
import { t } from './lexicon.js';

/**
 * ASK-ON-PRESS — the prompt an `ask: true` binding pops so ONE physical key can carry
 * a different argument every time (⚡ buildout, then ⚡ buildout: mika, …). The popped
 * window IS the macro's args field: the macro name, a box, Enter.
 *
 * On ui.sheet since 2026-08-17, and every half it was missing is a half the primitive
 * already carried. It had no dialog semantics at all — no role, no name,
 * nothing for a screen reader to announce. Tab walked straight out of the card into
 * the page behind the scrim. And `close()` ended in `inp.blur()`, which parks keyboard
 * focus on <body>, so the next Tab restarted the page from the top — the exact bug
 * js/ui.js's header names. Escape was bound on the INPUT's keydown, so it stopped
 * working the moment focus left the box; the primitive answers on the sheet root and
 * keeps a document-level fallback for a sheet opened by pointer.
 *
 * IT IS BUILT AFTER buildPadPanel (js/layout.js) AND THAT ORDER IS LOAD-BEARING: both
 * surfaces are .ui-sheet at the same z-index, and a physical ask-key pressed while the
 * ▦ panel is open must pop the prompt OVER the board, not under it. Equal z-index means
 * DOM order decides, and DOM order here is build order.
 */
export function buildPadAsk() {
  let cur = null; // the binding being asked about
  const dlg = sheet({ id: 'padask', cls: 'pa-card', label: t('pad.ask_sheet', 'Macro arguments'), onClose: () => (cur = null) });
  const label = document.createElement('code');
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = t('pad.ask_placeholder', 'Enter sends · Esc cancels');
  inp.autocapitalize = 'off';
  inp.autocomplete = 'off';
  inp.spellcheck = false;
  // The placeholder tells you the KEYS, not what the box is for — so the box gets a
  // real name of its own. ui.field is display:contents and its message line is
  // :empty-hidden, so the row is the same two items it always was.
  const inpField = field(inp, { label: t('pad.ask_label', 'macro arguments') });
  dlg.card.append(label, inpField.el);

  const open = (bind) => {
    cur = bind;
    label.textContent = '+' + bind.macro + ':';
    inp.value = bind.args || '';
    dlg.open();
    // THE ONE SURFACE THAT OVERRIDES ui.sheet's "never focus a field on a coarse
    // pointer". That rule protects sheets you must READ before typing — the iOS
    // keyboard covers them. Here the sheet is nothing BUT the field: a pad press that
    // pops a box you then have to tap to type in is a press wasted. select() so the
    // remembered args are replaced by typing and kept by a bare ↵.
    inp.focus();
    inp.select();
  };
  inp.addEventListener('keydown', (e) => {
    // Escape and Tab are the SHEET's — ui.sheet dismisses and contains them on the
    // sheet root, which is the ancestor of this box, so those two alone are let out.
    // Every other keystroke stops here: this prompt floats over a live terminal and
    // over the document-level Escape listeners (the tile ⚡ menu, the touch drops, the
    // help box), and a character meant for the args must reach none of them.
    if (e.key === 'Escape' || e.key === 'Tab') return;
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    const b = cur;
    const args = inp.value.trim();
    dlg.close(); // closing first hands focus back to whatever the pad was pressed from
    if (b) firePadSend(b.macro, args, b.session);
  });
  S.padAsk = { open, isOpen: dlg.isOpen };
}

/**
 * Work Louder pad panel (▦ in the top bar): a picture of the Creator Micro 2.
 * A physical press lights the matching on-screen key and fires its binding —
 * panel open or not (the panel is the picture + binder, not the engine).
 * Tap an on-screen key to bind it: macro, args, target session.
 *
 * This block used to end "same modal pattern as the macro panel". The macro panel
 * became buildSessionPicker and moved onto ui.sheet, so that sentence pointed at a
 * pattern that no longer existed — the worst kind of comment, one that reads as a
 * cross-reference and leads nowhere. Since 2026-08-17 both pad surfaces are ui.sheet
 * consumers and the pattern is spelled in ONE place, js/ui.js. What went with the
 * hand-rolled version: a document-level Escape listener added at build and never
 * removed, no dialog semantics, and a Tab that walked out through the scrim.
 *
 * THE BINDING EDITOR STAYS AN IN-CARD DISCLOSURE (.pad-edit / .open), deliberately.
 * It is not a dialog: you tap a key, the key stays lit `.editing` under your finger
 * while you pick what it does, and a second scrim over the board would hide the one
 * thing you are pointing at. It is inside the card, so the primitive's Tab trap and
 * Escape already cover it, and its controls come and go from the trap by themselves
 * (ui.js's tabbable() skips anything display:none).
 */
export function buildPadPanel() {
  const dlg = sheet({
    id: 'padsheet',
    cls: 'pad-card',
    label: t('pad.sheet', 'Work Louder pad'),
    // The panel's teardown hangs HERE, not on the Close button, because Escape and a
    // backdrop tap now close through the primitive and they are the two routes that
    // used to skip it. Dismissing with Esc must still drop the WebHID connection.
    onClose: () => {
      closeEditor();
      stopCapture();
      progReset();
    },
  });
  const bar = document.createElement('div');
  bar.className = 'pad-bar';
  const title = document.createElement('span');
  title.className = 'pad-title';
  title.textContent = t('pad.title', '▦ Work Louder');
  // Live readout of the last physical chord seen — doubles as discovery: if a key
  // lights nothing, this shows what it actually emits so you can fix the mapping.
  const last = document.createElement('code');
  last.className = 'pad-last';
  last.textContent = t('pad.press_key', 'press a pad key…');
  // ⊕ Capture: bind whatever the pad actually emits — press the button, then the
  // physical key; its chord (F17, ⌥⌘1, whatever Input was told to send) opens the
  // editor. Keys outside the drawn layout land in the "captured" row below it.
  const capBtn = document.createElement('button');
  capBtn.textContent = t('pad.capture', '⊕ Capture');
  const closeBtn = document.createElement('button');
  closeBtn.textContent = t('pad.close', 'Close');
  bar.append(title, last, capBtn, closeBtn);
  const board = document.createElement('div');
  board.className = 'pad-board';
  const extras = document.createElement('div');
  extras.className = 'pad-extras';
  dlg.card.append(bar, board, extras);

  const cells = new Map(); // chord -> on-screen key button (the drawn layout)
  const extraCells = new Map(); // chord -> button for captured off-layout chords
  const widgets = new Map(); // 'enc' | 'joy' | … -> the drawn widget element
  const pretty = (chord) =>
    chord
      .replace('C-', '⌃')
      .replace('A-', '⌥')
      .replace('M-', '⌘')
      .replace('S-', '⇧')
      .replace('ScrollLock', 'ScrLk')
      .replace(/Digit|Key|Numpad/, '');

  // -- binding editor (below the board, opens on key tap) --
  const edit = document.createElement('div');
  edit.className = 'pad-edit';
  const editTitle = document.createElement('b');
  const row1 = document.createElement('div');
  row1.className = 'pad-erow';
  const macroSel = document.createElement('select');
  const argsInp = document.createElement('input');
  argsInp.type = 'text';
  argsInp.placeholder = t('pad.args_placeholder', 'args (k=v …) — optional');
  argsInp.autocapitalize = 'off';
  argsInp.autocomplete = 'off';
  argsInp.spellcheck = false;
  row1.append(macroSel, argsInp);
  const row2 = document.createElement('div');
  row2.className = 'pad-erow';
  const sessSel = document.createElement('select');
  const askLbl = document.createElement('label');
  askLbl.className = 'pad-asklbl';
  const askChk = document.createElement('input');
  askChk.type = 'checkbox';
  askLbl.append(askChk, document.createTextNode(' ' + t('pad.ask_on_press', 'ask on press')));
  askLbl.title = t('pad.ask_on_press_title', 'Every press pops a prompt for the args (e.g. buildout) — Enter fires');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = t('pad.save', 'Save');
  row2.append(sessSel, askLbl, saveBtn);
  edit.append(editTitle, row1, row2);
  dlg.card.appendChild(edit);

  // Macro bindings use args/target/ask; ⌨ key bindings need none of them.
  const syncEditor = () => {
    const isMacro = macroSel.value && !macroSel.value.startsWith('key:');
    argsInp.style.display = isMacro ? '' : 'none';
    sessSel.style.display = isMacro ? '' : 'none';
    askLbl.style.display = isMacro ? '' : 'none';
  };
  macroSel.addEventListener('change', syncEditor);

  let editing = null; // chord being edited
  const closeEditor = () => {
    editing = null;
    edit.classList.remove('open');
    cells.forEach((c) => c.classList.remove('editing'));
  };
  const openEditor = (chord) => {
    editing = chord;
    editTitle.textContent = t('pad.key_title', 'key {chord}', { chord: pretty(chord) });
    macroSel.innerHTML = '';
    macroSel.add(new Option(t('pad.unbound', '— unbound —'), ''));
    const gm = document.createElement('optgroup');
    gm.label = t('pad.group_macros', '⚡ macros');
    // An <option> holds no child element, so the provenance mark rides in the text
    // (js/provenance.js keeps the glyphs; this is the one surface that cannot use it).
    for (const m of macroData || [])
      gm.appendChild(new Option(m.origin === 'user' ? `${m.shadowed ? '◈' : '◆'} ${m.name}` : m.name, m.name));
    macroSel.appendChild(gm);
    const gk = document.createElement('optgroup');
    gk.label = t('pad.group_keys', '⌨ keys (to the active tile)');
    for (const [id, k] of Object.entries(PAD_KEYS())) gk.appendChild(new Option(k.label, 'key:' + id));
    macroSel.appendChild(gk);
    sessSel.innerHTML = '';
    sessSel.add(new Option(t('pad.active_tile', '▸ active tile'), ''));
    for (const s of S.sessions) sessSel.add(new Option(s.name, s.name));
    const b = padBinds[chord];
    const want = b ? (b.key ? 'key:' + b.key : b.macro) : '';
    macroSel.value = [...macroSel.options].some((o) => o.value === want) ? want : '';
    argsInp.value = (b && b.args) || '';
    askChk.checked = !!(b && b.ask);
    sessSel.value = b && [...sessSel.options].some((o) => o.value === b.session) ? b.session : '';
    syncEditor();
    edit.classList.add('open');
    cells.forEach((c, k) => c.classList.toggle('editing', k === chord));
  };
  saveBtn.addEventListener('click', () => {
    if (!editing) return;
    const v = macroSel.value;
    if (!v) delete padBinds[editing]; // "— unbound —" + Save clears the key
    else if (v.startsWith('key:')) padBinds[editing] = { key: v.slice(4) };
    else
      padBinds[editing] = {
        macro: v,
        args: argsInp.value.trim(),
        session: sessSel.value,
        ...(askChk.checked ? { ask: true } : {}),
      };
    savePadBinds();
    renderCaps();
    closeEditor();
  });

  // -- the board itself --
  for (const cell of PAD_LAYOUT.flat()) {
    if (cell.w) {
      const div = document.createElement('div');
      div.className = 'pad-widget pad-' + cell.w;
      div.textContent = PAD_WIDGETS[cell.w][0];
      div.title = PAD_WIDGETS[cell.w][1];
      board.appendChild(div);
      widgets.set(cell.w, div);
      continue;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pad-key';
    const cap = document.createElement('b');
    const code = document.createElement('small');
    code.textContent = pretty(cell.k);
    btn.append(cap, code);
    btn.addEventListener('click', () => openEditor(cell.k));
    board.appendChild(btn);
    cells.set(cell.k, btn);
  }

  const decorate = (btn, chord) => {
    const b = padBinds[chord];
    btn.classList.toggle('bound', !!b);
    const cap = b ? (b.key ? (PAD_KEYS()[b.key] || { label: b.key }).label : b.macro + (b.ask ? '…' : '')) : '·';
    btn.querySelector('b').textContent = cap;
    btn.title = !b
      ? 'unbound — tap to bind'
      : b.key
        ? cap + ' → active tile'
        : `+${b.macro}${b.ask ? ': (asks on press)' : b.args ? ': ' + b.args : ''} → ${b.session || 'active tile'}`;
  };
  const renderCaps = () => {
    cells.forEach((btn, chord) => decorate(btn, chord));
    // Captured chords that aren't part of the drawn layout get their own row.
    // Encoder / joystick bindings belong on their widget, not in the key row.
    for (const [w, el] of widgets) {
      const mine = Object.keys(PAD_CONTROLS).filter((c) => PAD_CONTROLS[c] === w && padBinds[c]);
      if (!mine.length) continue;
      const what = mine.map((c) => (PAD_KEYS()[padBinds[c].key] || { label: padBinds[c].macro || c }).label).join(' · ');
      el.title = PAD_WIDGETS[w][1] + ' — ' + what;
    }
    extraCells.clear();
    extras.innerHTML = '';
    for (const chord of Object.keys(padBinds).sort()) {
      if (cells.has(chord) || PAD_CONTROLS[chord]) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pad-key pad-extra';
      const cap = document.createElement('b');
      const code = document.createElement('small');
      code.textContent = pretty(chord);
      btn.append(cap, code);
      decorate(btn, chord);
      btn.addEventListener('click', () => openEditor(chord));
      extras.appendChild(btn);
      extraCells.set(chord, btn);
    }
  };
  renderCaps();

  // -- capture mode (⊕): the next physical chord opens the editor --
  let capturingNow = false;
  const stopCapture = () => {
    capturingNow = false;
    capBtn.classList.remove('armed');
    if (last.textContent === t('pad.press_to_capture', 'press the pad key to capture…')) last.textContent = t('pad.press_key', 'press a pad key…');
  };
  capBtn.addEventListener('click', () => {
    capturingNow = !capturingNow;
    capBtn.classList.toggle('armed', capturingNow);
    if (capturingNow) {
      closeEditor();
      last.textContent = t('pad.press_to_capture', 'press the pad key to capture…');
    } else stopCapture();
  });
  const capturing = () => isOpen() && capturingNow;
  const capture = (chord, usable) => {
    stopCapture();
    last.textContent = pretty(chord);
    if (!usable) {
      toast(`${pretty(chord)} — too plain to take over; use F13–F24 or a ⌃⌥⌘ chord`, false);
      return;
    }
    openEditor(chord);
  };

  // -- ⚙ program the pad itself: write the Ronin layout onto a layer over WebHID --
  const prog = document.createElement('div');
  prog.className = 'pad-prog';
  dlg.card.appendChild(prog);
  const progBtn = document.createElement('button');
  progBtn.textContent = t('pad.program', '⚙ Program pad…');
  const layerSel = document.createElement('select');
  const writeBtn = document.createElement('button');
  writeBtn.textContent = t('pad.write', 'Write');
  // ⧉ Config: copy the pad's current keymap.json to the clipboard — the debug
  // tap for learning how the Input app encodes things (macros, combos) so ⚙ can
  // reproduce them.
  const dumpBtn = document.createElement('button');
  dumpBtn.textContent = t('pad.config', '⧉ Config');
  dumpBtn.title = t('pad.config_title', "Copy the pad's current config JSON to the clipboard");
  const restoreBtn = document.createElement('button');
  restoreBtn.textContent = t('pad.restore', 'Restore backup…');
  const restoreInp = document.createElement('input');
  restoreInp.type = 'file';
  restoreInp.accept = '.json,application/json';
  restoreInp.hidden = true;
  const cleanLbl = document.createElement('label');
  cleanLbl.className = 'pad-asklbl';
  const cleanChk = document.createElement('input');
  cleanChk.type = 'checkbox';
  cleanLbl.append(cleanChk, document.createTextNode(' ' + t('pad.clean_write', 'clean write')));
  cleanLbl.title = t('pad.clean_write_title', 'Replace every key with the Ronin default, including keys set by hand in Input');
  const progMsg = document.createElement('span');
  progMsg.className = 'pad-progmsg';
  prog.append(progBtn, layerSel, writeBtn, cleanLbl, dumpBtn, restoreBtn, restoreInp, progMsg);

  let wl = null; // open device { device, rpc, close }
  let wlCfg = null; // parsed keymap.json
  let wlRaw = ''; // original file text (the backup)
  const activeProfile = (cfg) => cfg.profiles.find((p) => p.id === cfg.activeProfileId) || cfg.profiles[0];
  const progReset = () => {
    if (wl) wl.close();
    wl = null;
    wlCfg = null;
    wlRaw = '';
    layerSel.hidden = writeBtn.hidden = restoreBtn.hidden = cleanLbl.hidden = dumpBtn.hidden = true;
    cleanChk.checked = false;
    progBtn.hidden = false;
    progMsg.textContent = navigator.hid
      ? 'writes F13–F24 + 🎙 Wispr straight onto the pad — no Input app needed'
      : 'programming the pad needs Chrome/Edge on desktop (WebHID)';
  };
  if (!navigator.hid) progBtn.disabled = true;
  progReset();

  progBtn.addEventListener('click', async () => {
    try {
      progMsg.textContent = t('pad.pick_prompt', 'pick the pad in the browser prompt… (quit the Input app first)');
      wl = await wlConnect();
      progMsg.textContent = t('pad.reading', 'reading the pad…');
      const st = await wl.rpc('device.status');
      wlRaw = String((await wl.rpc('fs.read', { file: 'keymap.json' })).data);
      wlCfg = JSON.parse(wlRaw);
      const layers = activeProfile(wlCfg).layers;
      layerSel.innerHTML = '';
      layers.forEach((l, i) =>
        layerSel.add(new Option((l.name || t('pad.layer_n', 'Layer {n}', { n: i + 1 })) + (i === (st.layer_index || 1) - 1 ? ' ' + t('pad.layer_active', '• active') : ''), i)),
      );
      layerSel.value = String(Math.min(layers.length - 1, Math.max(0, (st.layer_index || 1) - 1)));
      progBtn.hidden = true;
      layerSel.hidden = writeBtn.hidden = restoreBtn.hidden = cleanLbl.hidden = dumpBtn.hidden = false;
      progMsg.textContent = t('pad.connected', "pad fw {version} — Write overwrites the chosen layer's keys (backup downloads first)", { version: st.version });
    } catch (e) {
      progReset();
      progMsg.textContent = t('pad.error', 'pad: {message}', { message: e.message });
    }
  });

  writeBtn.addEventListener('click', async () => {
    if (!wl || !wlCfg) return;
    const li = Number(layerSel.value);
    const layer = activeProfile(wlCfg).layers[li];
    if (!layer || !layer.layout) {
      progMsg.textContent = t('pad.no_layout', 'pad: that layer has no layout to write into');
      return;
    }
    const lname = layer.name || t('pad.layer_n_lower', 'layer {n}', { n: li + 1 });
    if (!confirm(t('pad.overwrite_confirm', 'Overwrite the 13 keys of "{layer}" with the Ronin layout?\nThe pad\'s current config downloads as a backup first.', { layer: lname }))) return;
    writeBtn.disabled = true;
    try {
      wlDownload('worklouder-keymap-backup-' + Date.now() + '.json', wlRaw);
      // Keys ONLY — encoders, joystick, lights, other layers stay as they are.
      const next = WL_RONIN_KEYMAP.map((r) => r.slice());
      // Resolve combo: placeholders into device-side Actions — find-or-create in
      // the config's "macros" array by name, register in the profile's
      // macrosUsed, bind the slot as KA_A<id>.
      wlCfg.macros = Array.isArray(wlCfg.macros) ? wlCfg.macros : [];
      const prof = activeProfile(wlCfg);
      prof.macrosUsed = Array.isArray(prof.macrosUsed) ? prof.macrosUsed : [];
      const resolveCombo = (token) => {
        const combo = WL_COMBOS[token];
        if (!combo) return token;
        let m = wlCfg.macros.find((x) => x && x.name === combo.name);
        if (!m) {
          const id = wlCfg.macros.reduce((a, x) => Math.max(a, Number(x && x.id) || 0), 0) + 1;
          m = { id, name: combo.name, color: null, actions: combo.steps.map(([act, kc]) => ({ act, delay: 10, kc })) };
          wlCfg.macros.push(m);
        }
        if (!prof.macrosUsed.includes(m.id)) prof.macrosUsed.push(m.id);
        return 'KA_A' + m.id;
      };
      for (const row of next) for (let c = 0; c < row.length; c++) row[c] = resolveCombo(row[c]);
      // Merge rule: any slot the owner set BY HAND in the Input app — anything
      // that isn't a factory letter, blank, or one of our own past writes —
      // survives a re-run. Factory keys and our stale codes get updated.
      const ours = new Set([
        ...next.flat(),
        ...wlCfg.macros.filter((m) => m && /^ronin /.test(m.name || '')).map((m) => 'KA_A' + m.id),
        'KI_FP', 'KC_F14', 'KC_F15', 'KC_PAUS', 'KC_SLCK', 'KC_INS',
        'KC_F22', 'KC_F23', 'KC_F24', 'LALT(KC_BSPC)', 'LALT(KC_ENT)',
      ]);
      const cur = layer.layout.keymap;
      if (!cleanChk.checked && Array.isArray(cur))
        next.forEach((row, r) =>
          row.forEach((_, c) => {
            const v = cur[r] && cur[r][c];
            if (v && v !== 'KC_NONE' && !ours.has(v) && !/^KC_[A-Z]$/.test(v)) next[r][c] = v;
          }),
        );
      layer.layout.keymap = next;
      // Encoder: turns scroll (CW/CCW dead codes); the press slot is the
      // owner's, preserved. Joystick: quadrant codes, resolved on-device (the
      // radial menu it replaces needed the Input app running to draw anyway).
      const encPress = (layer.layout.encoders && layer.layout.encoders[0] && layer.layout.encoders[0][2]) || 'KC_MPLY';
      layer.layout.encoders = [[resolveCombo(WL_ENCODER[0]), resolveCombo(WL_ENCODER[1]), encPress]];
      layer.layout.joystick = {
        type: WL_JOYSTICK.type,
        sectors: WL_JOYSTICK.sectors.map((s) => ({ ...s, k: resolveCombo(s.k) })),
      };
      progMsg.textContent = t('pad.writing', 'writing…');
      await wlWriteFile(wl.rpc, 'keymap.json', JSON.stringify(wlCfg));
      // Verify each part separately: "the keys took but the encoder didn't" is
      // the difference between a bad keycode and a wrong config path.
      const back = JSON.parse(String((await wl.rpc('fs.read', { file: 'keymap.json' })).data));
      const got = activeProfile(back).layers[li].layout || {};
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const bad = [
        !same(got.keymap, next) && 'keys',
        !same(got.encoders, layer.layout.encoders) && 'encoder',
        !same(got.joystick, layer.layout.joystick) && 'joystick',
      ].filter(Boolean);
      progMsg.textContent = !bad.length
        ? t('pad.written', '✓ "{layer}" is now the Ronin layer — switch the pad to it and press a key. Knob unchanged? Replug the pad: the firmware applies keys and joystick live but caches the encoder from boot.', { layer: lname })
        : t('pad.write_partial', 'write finished but the pad did not store: {parts} — the backup file has the original', { parts: bad.join(', ') });
      toast(!bad.length ? t('pad.toast_written', '▦ pad programmed with the Ronin layout ✓') : t('pad.toast_rejected', '▦ pad rejected: {parts}', { parts: bad.join(', ') }), !bad.length);
    } catch (e) {
      progMsg.textContent = t('pad.write_failed', 'write failed: {message} — the backup file has the original', { message: e.message });
    }
    writeBtn.disabled = false;
  });

  dumpBtn.addEventListener('click', async () => {
    if (!wl) return;
    try {
      const raw = String((await wl.rpc('fs.read', { file: 'keymap.json' })).data);
      const ok = await toClipboard(raw);
      progMsg.textContent = ok ? t('pad.config_copied', '✓ pad config copied to clipboard') : t('pad.clipboard_blocked', 'clipboard blocked — use the https url');
    } catch (e) {
      progMsg.textContent = t('pad.config_read_failed', 'config read failed: {message}', { message: e.message });
    }
  });

  // Restore: push a previously downloaded backup file back onto the pad, verbatim.
  restoreBtn.addEventListener('click', () => restoreInp.click());
  restoreInp.addEventListener('change', async () => {
    const f = restoreInp.files && restoreInp.files[0];
    restoreInp.value = '';
    if (!f || !wl) return;
    try {
      const text = await f.text();
      JSON.parse(text); // sanity — never write a non-JSON file to the pad
      progMsg.textContent = t('pad.restoring', 'restoring…');
      await wlWriteFile(wl.rpc, 'keymap.json', text);
      progMsg.textContent = t('pad.restored', '✓ backup restored to the pad');
    } catch (e) {
      progMsg.textContent = t('pad.restore_failed', 'restore failed: {message}', { message: e.message });
    }
  });

  const close = dlg.close; // the teardown rides on the sheet's onClose — see the top
  const open = () => {
    renderCaps();
    dlg.open();
  };
  const isOpen = dlg.isOpen;
  /** A physical key fired: show which one. */
  const hit = (chord) => {
    // Name what it's bound to, not just the code — makes "which direction did
    // that flick fire?" answerable by looking, without any guessing.
    const b = padBinds[chord];
    const what = b ? (b.key ? (PAD_KEYS()[b.key] || {}).label : '⚡ ' + b.macro) : '';
    last.textContent = pretty(chord) + (what ? ' · ' + what : '');
    // Encoder/joystick codes light their widget; keys light their square.
    const btn = cells.get(chord) || extraCells.get(chord) || (PAD_CONTROLS[chord] && widgets.get(PAD_CONTROLS[chord]));
    if (!btn) return;
    btn.classList.add('hit');
    setTimeout(() => btn.classList.remove('hit'), 250);
  };
  // Backdrop tap and Escape are the primitive's now. Escape while ⊕ Capture is armed
  // still disarms rather than closing: js/layout.js takes it in the CAPTURE phase and
  // stops it there, so it never reaches the sheet root — the same order that made the
  // old bubble-phase listener behave, kept by construction rather than by luck.
  closeBtn.addEventListener('click', close);
  S.padPanel = { open, close, isOpen, hit, capturing, capture, stopCapture };
}
