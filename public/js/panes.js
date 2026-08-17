/* part of the tmux-ronin client — see js/README.md */
/**
 * THE PANE REGISTRY — the Commons' rooms, spelled once.
 *
 * ONE surface presents these rooms: the tab strip inside the Commons (js/commons.js).
 * It was two — the strip and the き Commons menu on the bar — reading two separate
 * lists, `COMMONS_PANES` in layout.js and a run of `mkTab()` calls in commons.js, which
 * is exactly how the menu ended up missing ⚙ System while the strip had it. The single
 * list fixed the drift; on 2026-08-17 the owner removed the menu outright (⛩ Commons is
 * one press to ⌂ Roster and drops nothing), so the second consumer is gone as well.
 * A new room is one row here plus its feature module.
 *
 * THE LIST STAYS THE REGISTRY WITH ONE READER. It is not folded into commons.js: the
 * lesson above is that a room's name and order belong somewhere neither surface owns,
 * and the next surface that needs the rooms should find them, not re-type them.
 *
 * `compact` is the label for the 402px phone tab strip, where '▣ Project root' ran
 * off the end of the row — the full name still carries everywhere there is room
 * (the desktop strip, hints). A row without `compact` fits everywhere as it is.
 *
 * The registry owns names and order, NOT behaviour: which service gates a room stays
 * `serviceOff()` in state.js, and each room's fetches, state and rendering stay in its
 * own module. Agent-agnostic on purpose — nothing here (or in any pane) may assume
 * which agent CLI runs in a tile; a new provider or agent is catalog data (a
 * ronin_catalogs/PROJECT_ROOTS.md launch cell), never a new pane branch.
 */
export const PANES = [
  { id: 'sessions', label: '⌂ Roster', hint: 'The running sessions' },
  { id: 'new', label: '＋ New session', hint: 'Put a session out to work' },
  { id: 'wipe', label: '▤ Wipeboard', hint: 'One surface a set of agents all read and write' },
  // MDEDIT — kin to the wipeboard and next to it: both are files a session keeps,
  // rendered where the owner already is. The difference is ownership — a board is
  // shared by a set of sessions, a doc belongs to the one that listed it.
  { id: 'docs', label: '▧ Docs', hint: 'The docs each session is working on — buildouts, handoffs, plans' },
  { id: 'proj', label: '▣ Project root', compact: '▣ Roots',
    hint: 'Project root — which directories on this machine are part of your Ronin' },
  { id: 'hotwords', label: '▥ Hotwords', hint: 'Words dictation keeps getting wrong — the glossary sent with your voice' },
  { id: 'stats', label: '▦ Stats', hint: 'How this install actually gets used — TOMODACHI' },
  { id: 'koshi', label: '目 Koshi', hint: 'Which model each Koshi job asks' },
  // ⚙ System is DELIBERATELY not a row: install-level facts (release, updates,
  // appearance, log out) are page-level, so the gear lives in the bar and opens one
  // sheet (js/system.js) — a room here meant four copies, one per tile.
];
