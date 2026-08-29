/* part of the ronin-cowork client — see js/README.md */
import { fetchSessions } from './api.js';
import { guard } from './errors.js';
import { refreshHome } from './home.js';
import { buildSessionPicker } from './macros.js';
import { PAD_CODE, firePadBinding, padBinds, padChord } from './pad.js';
import { buildPadAsk, buildPadPanel } from './padpanel.js';
import { buildNotePanel } from './panels.js';
import { IS_TOUCH, S, WHEEL_DOWN, tiles } from './state.js';
import { isCoarse, makeDrop } from './tiledrop.js';
import { t } from './lexicon.js';
import { request } from './request.js';

export function build() {
  // Each wiring block is guarded separately: losing one control must not cost the
  // rest of the header, which is exactly what happened on 2026-08-08.
  // Resumed tab (esp. mobile — a backgrounded page can live for days): re-fetch the list.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchSessions();
      refreshHome();
    }
  });
  // Home-panel cadence: status + gauge readings for sessionless tiles. Gentle poll,
  // only while a home panel is actually on a visible screen.
  setInterval(() => {
    if (document.visibilityState === 'visible') refreshHome();
  }, 8000);
  // Gauge cadence: the number only moves when a turn completes, so a gentle 30s poll
  // (one cheap capture-pane per tile-with-session), paused while the tab is hidden.
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    tiles.forEach((t) => {
      if (t.session && t.el.style.display !== 'none') { t.refreshCtx(); t.refreshTegami(); }
    });
  }, 30000);
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) fetchSessions(); // restored from bfcache
  });
  window.addEventListener('resize', () => tiles.forEach((t) => t.doFit()));
  // Desktop: Ctrl+Shift (or Ctrl+Alt) + 1/2/4 sets HOW MANY tiles are on screen —
  // the same three the layout buttons offer. Uses e.code (physical key) so it fires from the
  // digit row or numpad and survives Mac Option-remapping (Option+1 => "¡").
  
  if (!IS_TOUCH) {
    document.addEventListener(
      'keydown',
      (e) => {
        if (!e.ctrlKey || e.metaKey) return;
        // Ctrl+SHIFT+C as well as Ctrl+Alt+C, because on macOS ⌃⌥ is the VoiceOver
        // modifier: the OS claims Control-Option plus nearly every letter before a
        // browser sees it, so the Alt chord silently never arrives. ⌃⇧ is free there.
        // (⌃⇧C is DevTools-inspect on Linux/Windows Chrome; the Alt chord covers those.)
        if (e.altKey === e.shiftKey) return; // exactly one of Alt / Shift, never both
        // Ctrl+Alt+C — the CoWorking Commons ("the Commons") over the tile you are in, on
        // the session roster. C for Commons. Same act as ⛩, the most-used control on the
        // header (it said メ until 2026-08-17, when ⛩ took the Commons everywhere and メ
        // came back on that header as the drop): getting to the list of sessions should
        // not cost a mouse trip. Falls back to the first visible
        // tile so it works before you have clicked into anything.
        if (e.code === 'KeyN') {
          // ⌃⇧N is the keyboard's ＋ New session: a workspace surface on the cowork_space
          // (team-view.js), the tile's launcher on the parked grid page.
          if (!S.showNewSession) return;
          S.showNewSession();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Tab — step through the visible tiles, wrapping. Cycling is what Tab means
        // everywhere else, and it is the only way to reach a tile without the mouse now
        // that the digits set the layout instead. Shift walks backwards.
        if (e.code === 'Tab') {
          const vis = tiles.filter((x) => x.el.style.display !== 'none');
          if (!vis.length) return;
          const at = vis.indexOf(S.active);
          const step = e.shiftKey ? -1 : 1;
          const next = vis[(((at < 0 ? 0 : at + step) % vis.length) + vis.length) % vis.length];
          next.focusTerminal();
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // 1 / 2 / 4 — how many tiles are on screen, the same three the layout buttons
        // set. It used to focus tile N, which is the wrong verb for a number: 1-2-4 is
        // written on the buttons as a COUNT, so the chord means the same thing the
        // button does. 3 is deliberately dead — there is no 3-up layout to go to.
      },
      true, // capture: beat xterm's own keydown so the chord never reaches the pty
    );
  }
  // Top-bar control keys (sent to the active terminal).
  const key = (id, fn) => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', fn);
  };
  key('k-esc', () => S.active && S.active.sendRaw('\x1b'));
  key('k-int', () => S.active && S.active.sendRaw('\x03'));
  key('k-bottom', () => {
    if (!S.active) return;
    if (S.active && !S.active.locked) {
      // Tape-fed: jump to the live end. Purely local, no round trip.
      if (S.active.tapeMode) S.active.tape.scrollToBottom();
      else S.active.term.scrollToBottom();
      return;
    }
    // Mirror (original behavior, untouched): two ways scrollback happens — tmux copy
    // mode (plain shells) or *inside* a full-screen TUI like Claude Code, which grabs
    // the mouse so tmux never enters copy mode. Do both: {t:'bottom'} cancels tmux
    // copy mode -> live bottom; the wheel-down burst drives an app's own scroll to
    // the bottom. A wheel-down at the live bottom is a no-op, so both is always safe.
    S.active.send({ t: 'bottom' });
    for (let i = 0; i < 150; i++) S.active.sendRaw(WHEEL_DOWN);
  });

  // 🔒/🔓 — THE switch, changed only here. Flipping it swaps every connected tile's
  // transport: locked reconnects the attach mirror; unlocked reconnects the recorded
  // stream (seeded with recent history). Parked text is discarded on a flip (it's
  // visible in the strip, so nothing vanishes silently).
  // THE LOCK LIVES ON EACH TILE, and only there.
  //
  // There used to be one 🔒/🔓 in the top bar driving a global that every tile read, so a
  // click reconnected all four at once. Making it act on the active tile instead was
  // still wrong: a control in the window chrome cannot say WHICH pane it means, and you
  // have to look somewhere else to find out. Each tile head carries its own switch, next
  // to that tile's other controls, showing that tile's state. See Tile.setLocked.

  // Per-session note editor (📝 on each tile head) — works the same on desktop and touch.
  guard('note panel', buildNotePanel);
  // ⚙ Account — ONE sheet at page level (js/system.js); the bar's gear opens it.
  //
  // THE LABEL MOVED, NOT THE DESTINATION (2026-08-17). The owner wants this to read
  // ⚙ ADMIN DESK — and it is the staging post above, arrived (2026-08-18).
  //
  // This was `S.sysPanel.open()` on a page-level ui.sheet, under the 2026-08-16 ruling
  // that install-level facts must not be copied into every tile. That ruling holds; what
  // changed is that there is now a surface on the right side of it. The desk is a TILE —
  // drawn in the one you press ⚙ in, not in all four — so it keeps the singleness the
  // sheet was bought for and gets back the full pane a sheet could never give.
  //
  // It takes the ACTIVE tile, exactly as ⛩ and か do above: the bar's verbs all act on
  // the tile you are in, and a fifth that picked its own would be the odd one out. And it
  // TOGGLES, because ⛩ already learned that lesson — a control that opens a thing and
  // then goes dead is a control you press twice and distrust.
  // ⚙ — THE COWORK COMMONS, a workspace surface, never a tile overlay (owner, 2026-08-27).
  // On the cowork_space the team page owns the gesture (`S.showCoworkCommons`: into the
  // workspace you are in, and back). On the parked grid page there is no workspace to put
  // it in, so ⚙ is the `cowork` destination — the surface at full width — and ⚙ again is
  // the way back. Same element, same state, two doors.
  key('sysbtn', () => {
    if (S.showCoworkCommons) return S.showCoworkCommons();
    const ws = S.workspace;
    if (!ws) return;
    if (ws.active?.id === 'cowork') ws.back();
    else ws.navigate('cowork');
  });

  // Session macros (⚡ on each tile head) are the tile's own — built in
  // tilemacros.js by Tile itself; nothing to wire here.

  const campaignButton = document.getElementById('campaignbtn');
  key('campaignbtn', () => S.workspace?.navigate('campaign'));
  const coworkers = document.getElementById('coworkbtn');
  const loadCampaignNav = async () => {
    const campaign = await request('/api/settei', { cache: 'no-store' });
    if (campaign.ok && campaignButton) campaignButton.textContent = campaign.data?.set?.campaign?.name || t('campaign', 'Campaign');
    const r = await request('/api/team-rosters', { cache: 'no-store' });
    if (!r.ok || !coworkers) return;
    const selected = coworkers.value;
    coworkers.replaceChildren(new Option(t('campaign.cowork', 'Cowork'), ''));
    for (const row of r.data || []) if (row.state !== 'archived') coworkers.add(new Option(row.name, row.name));
    coworkers.value = selected;
  };
  coworkers?.addEventListener('focus', () => void loadCampaignNav());
  coworkers?.addEventListener('change', () => { if (coworkers.value) S.workspace?.navigate('team', coworkers.value); coworkers.value = ''; });
  void loadCampaignNav();

  // ⛩ Commons, ミ Mika Assist and く Keypad LEFT THE BAR on 2026-08-27 (owner). The
  // Commons is still the tile head's ⛩, the brand mark and ⌃⇧C; Mika is the `mika` tool
  // and the desk's own asks; the pad panel opens from a row on the ⚙ Admin Desk
  // (js/cowork-commons.js) and its physical keys never needed the button.
  // Work Louder pad — both surfaces (owner override). The
  // physical pad fires bound macros whether or not the panel is open.
  // Session switcher — the pad key's list (also usable with plain ↑↓/↵ once open).
  guard('session picker', buildSessionPicker);

  guard('pad panel', buildPadPanel);
  guard('pad ask', buildPadAsk);
  // The takeover listener: capture-phase so pad keycodes never reach xterm/tmux.
  // It only ever touches F13–F24, chords Glen explicitly bound, or (while the
  // panel's ⊕ Capture is armed) the one key being captured — every other key on
  // every device is untouched. An unbound pad key passes through unless the
  // panel is open (open panel = you're working the pad; keep strays out of the
  // terminal). Don't bind ⌃⌥1–4: the tile-focus chord above wins.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      const chord = padChord(e);
      const isPadKey = PAD_CODE.test(e.code);
      if (S.padPanel && S.padPanel.capturing()) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') S.padPanel.stopCapture();
        // Plain unmodified keys can't be taken over (they'd swallow real typing).
        else S.padPanel.capture(chord, isPadKey || e.ctrlKey || e.altKey || e.metaKey);
        return;
      }
      const bind = padBinds[chord];
      if (!isPadKey && !bind) return;
      if (S.padPanel) S.padPanel.hit(chord);
      if (S.padAsk && S.padAsk.isOpen()) {
        // A prompt is up — pad keys pause so a stray press can't fire mid-typing.
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!bind && !(S.padPanel && S.padPanel.isOpen())) return;
      e.preventDefault();
      e.stopPropagation();
      if (bind && !e.repeat) firePadBinding(bind); // holding a key fires once
    },
    true,
  );

  if (IS_TOUCH) {
    // COPY MODE IS GONE. It existed because the only tape-less surface was an xterm
    // CANVAS, which cannot be touch-selected — so the visible text was copied into a
    // <textarea> panel to select out of. The unlocked tile renders a real div of text
    // and touch is always unlocked, so long-press → Copy works on the transcript
    // itself. On desktop the mirror still answers to modifier+drag + ⌘C (Option on a Mac,
    // Shift elsewhere — SELECT_MOD in js/state.js).

    // Touch-only keypad: the keys the iOS keyboard can't send (Tab/⇧Tab + arrows)
    // so you can drive TUIs like Claude Code. Stays open so you can fire several
    // (e.g. arrow-navigate a menu); doesn't steal terminal focus.
    const KEYPAD = { cr: '\r', tab: '\t', stab: '\x1b[Z', up: '\x1b[A', down: '\x1b[B', left: '\x1b[D', right: '\x1b[C' };
    const pad = document.getElementById('keypad');
    if (pad) {
      pad.querySelectorAll('button[data-key]').forEach((b) => {
        b.addEventListener('click', () => S.active && S.active.sendRaw(KEYPAD[b.dataset.key]));
      });
    }
    guard('drawers', buildDrawers);
  } else {
    // Copy = hold the force-selection modifier and drag, then ⌘C / Ctrl-C. The modifier
    // is Option on a Mac and SHIFT everywhere else — xterm's own rule, mirrored in
    // `forcesSelection` (js/state.js); this comment used to say Option flatly and left
    // Windows and Linux with nothing. Either way it forces a native selection over a
    // mouse-grabbing app or tmux mouse mode. The old Copy Mode toggle is retired — one
    // way to copy, works in any pane, locked or unlocked. A drag that produces no
    // selection is caught and explained by `wireCopyHint` (js/termview.js).
    // xterm draws to a canvas, so the browser's native copy can't see the selection —
    // feed it the captured terminal selection on ⌘C/Ctrl-C. Works on http and https.
    document.addEventListener('copy', (e) => {
      // This is a terminal bridge, not a global clipboard policy. Without this scope a
      // stale terminal selection replaced text copied from Docs' textarea (and any other
      // ordinary field) even though the browser had a perfectly good native selection.
      const fromTerminal = e.target instanceof Element && e.target.closest('.xterm');
      if (!fromTerminal) return;
      const live = S.active && S.active.term.getSelection ? S.active.term.getSelection() : '';
      const sel = live || S.lastSelection;
      // Only hijack ⌘C when the terminal actually has a selection; otherwise let the
      // browser copy normally. Works whether the selection came from Copy Mode (mouse
      // off) or a modifier+drag over a mouse-grabbing app.
      if (sel && e.clipboardData) {
        e.clipboardData.setData('text/plain', sel);
        e.preventDefault();
      }
    });
  }
}

/**
 * TOUCH: ニ — Ronin's own drop, the right-hand half of the one header row.
 *
 * Where メ is THIS SESSION, ニ is THE APP: Keys, then Home, New, Board, Pad. It was
 * a pair of category toggles (Keys / Sessions) that opened a drawer BELOW the bar,
 * which cost a third band of chrome above the terminal and put two openers where
 * one does. Now they are rows in a sheet like everything else.
 *
 * Keys keeps its drawer rather than becoming a row: it is ten keys you tap in
 * sequence to drive a TUI (Esc, ^C, ⤓, ↵, Tab, ⇧Tab, four arrows), so it wants to
 * be a keypad that stays put, not a menu that dismisses on the first tap. The ニ
 * row is what opens it.
 *
 * Everything inside is the SAME node the desktop bar uses, relocated rather than
 * cloned, so every handler already bound to it keeps working and there is no
 * second copy to keep in sync. Desktop never calls this.
 */
export function buildDrawers() {
  if (!isCoarse()) return;
  const bar = document.getElementById('bar');
  if (!bar) return;

  const wrap = document.createElement('div');
  wrap.id = 'drawers';
  bar.insertAdjacentElement('afterend', wrap);

  const keypad = document.getElementById('keypad');
  const pick = (...ids) => ids.map((id) => document.getElementById(id)).filter(Boolean);

  // The one drawer left: the keypad, opened from the ☰ sheet's first row.
  // No terminal refit on open/close — a drawer shortens the grid, but resizing the
  // pane would flap the tmux window size for every other client on that session
  // (TMUX_WINDOW_SIZE=latest).
  const keys = document.createElement('div');
  keys.className = 'drawer';
  keys.id = 'dr-keys';
  keys.setAttribute('role', 'group');
  keys.setAttribute('aria-label', t('bar.keys', 'Keys'));
  // append MOVES the node — listeners come along
  [...pick('k-esc', 'k-int', 'k-bottom'), ...(keypad ? [...keypad.children] : [])].forEach((n) => keys.append(n));
  wrap.append(keys);

  const drop = makeDrop('ニ', t('bar.ni_title', 'Ronin — keys, home, new session, board, pad'), 'ni');

  // Keys is a toggle, not a destination — but it still closes the sheet, so the
  // keypad it just opened is not left standing behind a sheet.
  const keysBtn = document.createElement('button');
  keysBtn.id = 'k-keys';
  keysBtn.type = 'button';
  keysBtn.textContent = '⌨';
  keysBtn.title = t('bar.keys_title', 'Esc, ^C, jump to latest, Tab and the arrows');
  keysBtn.addEventListener('click', () => keys.classList.toggle('open'));
  drop.addRow(keysBtn, t('bar.keys', 'Keys'));

  // ⟳ Refresh is NOT here: `fetchSessions` already runs on tab-resume, on a bfcache
  // restore and off the /events socket, so the button was a manual copy of something
  // that never stops happening — and its round arrow read as the tile's ⟳ Reconnect,
  // a different action. Two dead round arrows, both gone.
  const APP = [
    // The one verb left on the bar (2026-08-27) — the cowork commons.
    ['sysbtn', t('bar.desk', 'Admin Desk')],
  ];
  for (const [id, label] of APP) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.querySelector('.txt')?.remove(); // the word is the row's now
    drop.addRow(el, label);
  }
  // The shape button comes up between メ and ニ — RELOCATED, not rebuilt, so the face
  // team-view.js writes and the click it owns come along.
  const shape = document.getElementById('shapecycle');
  if (shape) bar.append(shape);

  bar.append(drop.btn, drop.menu);

  // Desktop bar scaffolding, now emptied out on touch.
  document.querySelector('#bar .ctrls')?.remove(); // took #k-more (⋯) with it
  document.querySelector('#bar .grow')?.remove();
  keypad?.remove();
}
