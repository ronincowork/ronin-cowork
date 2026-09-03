/* part of the ronin-cowork client — see js/README.md */
import { fetchSessions } from './api.js';
import { guard } from './errors.js';
import { refreshHome } from './home.js';
import { buildSessionPicker } from './macros.js';
import { PAD_CODE, firePadBinding, padBinds, padChord } from './pad.js';
import { buildPadAsk, buildPadPanel } from './padpanel.js';
import { buildNotePanel } from './panels.js';
import { IS_TOUCH, S, tiles } from './state.js';
import { isCoarse } from './tiledrop.js';

export function build() {
  // Each wiring block is guarded separately: losing one control must not cost the
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
        // came back on that header as the drop): getting to the list of sessions should
        // not cost a mouse trip. Falls back to the first visible
        // tile so it works before you have clicked into anything.
        if (e.code === 'KeyN') {
          // ⌃⇧N is the keyboard's ＋ New session: a workspace surface on the discovery workbench
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
        // written on the buttons as a COUNT, so the chord means the same thing the
        // button does. 3 is deliberately dead — there is no 3-up layout to go to.
      },
      true, // capture: beat xterm's own keydown so the chord never reaches the pty
    );
  }
  // The top-bar control keys (Esc, ^C, ⤓) are GONE with their .ctrls group: hidden on
  // desktop since the drawer era, and on touch every coarse tile's composer carries the
  // keys row (js/keysrow.js) with Tile.jumpLatest owning the three-way ⤓ rule.

  // 🔒/🔓 — THE switch, changed only here. Flipping it swaps every connected tile's
  // transport: locked reconnects the attach mirror; unlocked reconnects the recorded
  // stream (seeded with recent history). Parked text is discarded on a flip (it's
  // visible in the strip, so nothing vanishes silently).
  // THE LOCK LIVES ON EACH TILE, and only there.
  //
  // click reconnected all four at once. Making it act on the active tile instead was
  // still wrong: a control in the window chrome cannot say WHICH pane it means, and you
  // have to look somewhere else to find out. Each tile head carries its own switch, next
  // to that tile's other controls, showing that tile's state. See Tile.setLocked.

  // Per-session note editor (📝 on each tile head) — works the same on desktop and touch.
  guard('note panel', buildNotePanel);
  // Session macros (⚡ on each tile head) are the tile's own — built in
  // tilemacros.js by Tile itself; nothing to wire here.

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

    // The keys the iOS keyboard can't send (Esc, ^C, Tab/⇧Tab, arrows) ride every
    // coarse tile's composer now — js/keysrow.js, zero taps away — so the bar keeps
    // no keypad, no keys drawer and no ニ sheet. What is left to do here is trim the
    // desktop chrome off the bar.
    guard('touch bar', trimBarForTouch);
  } else {
    // Copy = hold the force-selection modifier and drag, then ⌘C / Ctrl-C. The modifier
    // is Option on a Mac and SHIFT everywhere else — xterm's own rule, mirrored in
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

export function trimBarForTouch() {
  if (!isCoarse()) return;
  document.getElementById('shapecycle')?.remove();
}
