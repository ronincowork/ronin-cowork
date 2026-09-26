/* part of the ronin-cowork client — see js/README.md */
import { fetchSessions } from './api.js';
import { guard } from './errors.js';
import { renew } from './store.js';
import { buildSessionPicker } from './session-picker.js';
import { PAD_CODE, firePadBinding, padBinds, padChord } from './pad.js';
import { buildPadPanel } from './padpanel.js';
import { buildNotePanel } from './panels.js';
import { IS_TOUCH, S, tiles } from './state.js';
import { isCoarse } from './tiledrop.js';
import { t } from './lexicon.js';

export function build() {
  const bar = document.getElementById('bar');
  const island = document.getElementById('viewisland');
  if (bar && island) {
    // THE CARET RIDES THE ISLAND, AND ONLY THE CARET EVER LEAVES IT. Collapsing hides
    // #bar, so the one control that reopens the header has to outlive the bar: it docks
    // to the body, fixed over the work surfaces' header, deliberately a little in the
    // way so the fold can always be toggled back. The island itself never moves. It is
    // one island, shaped once, and it goes down with the bar it belongs to — nothing
    // re-parents it into a header it was never shaped for.
    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'header-collapse app-header-collapse';
    const home = document.createComment('header-collapse-home');
    island.append(home, collapse);
    const sync = () => {
      const closed = bar.classList.contains('header-collapsed');
      collapse.textContent = closed ? '⌄' : '⌃';
      collapse.setAttribute('aria-expanded', String(!closed));
      collapse.setAttribute('aria-label', closed ? t('bar.expand_header', 'Expand header') : t('bar.collapse_header', 'Collapse header'));
    };
    const restore = () => {
      if (!bar.classList.contains('header-collapsed')) return;
      home.after(collapse);
      collapse.classList.remove('header-collapse-docked');
      bar.classList.remove('header-collapsed');
      sync();
    };
    collapse.addEventListener('click', () => {
      if (bar.classList.contains('header-collapsed')) {
        restore();
        return;
      }
      // The body, not a surface header: the caret must not depend on finding a header to
      // live in, and collapsing the application header must never cost a work surface its
      // own title and actions.
      document.body.append(collapse);
      collapse.classList.add('header-collapse-docked');
      bar.classList.add('header-collapsed');
      sync();
    });
    window.addEventListener('hashchange', restore);
    window.matchMedia('(pointer: coarse) and (min-width: 681px)').addEventListener?.('change', restore);
    sync();
  }
  // Resumed tab (esp. mobile — a backgrounded page can live for days): re-fetch the list,
  // and renew the store — a socket that went reconnects now, and the new connection is sent
  // the rows whole. The home panels' readings arrive by push; nothing here keeps a clock.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchSessions();
      renew();
    }
  });
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
  // Commons is still the tile head's ⛩, the brand mark and ⌃⇧C; Mika is the `mika` tool
  // and the desk's own asks; the pad panel opens from a row on the ⚙ Admin Desk
  // (js/cowork-commons.js) and its physical keys never needed the button.
  // Work Louder pad — both surfaces (owner override). The
  // physical pad fires bound terminal/navigation keys whether or not the panel is open.
  // Session switcher — the pad key's list (also usable with plain ↑↓/↵ once open).
  guard('session picker', buildSessionPicker);

  guard('pad panel', buildPadPanel);
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
      if (!bind && !(S.padPanel && S.padPanel.isOpen())) return;
      e.preventDefault();
      e.stopPropagation();
      if (bind && !e.repeat) firePadBinding(bind); // holding a key fires once
    },
    true,
  );

  if (IS_TOUCH) {
    // Locked touch copying is provided by the shared Copy action's text snapshot.
    guard('touch bar', trimBarForTouch);
  } else {
    // Copy = hold the force-selection modifier and drag, then native ⌘C / Ctrl+C. The modifier
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
      const owner = tiles.find((tile) => tile.el.contains(e.target));
      const sel = owner?.term.getSelection() || owner?.lastSelection;
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
