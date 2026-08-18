/* part of the tmux-ronin client — see js/README.md */
/**
 * THE PANE REGISTRY — the rooms, spelled once, and which surface each one is on.
 *
 * TWO SURFACES PRESENT THESE ROOMS, and `surface` is which (owner's ruling, 2026-08-18):
 *
 *   `commons`  the tab strip inside a tile's session_commons — about SESSIONS, and drawn
 *              in every sessionless tile whether or not anyone asked for it. Four rows.
 *   `desk`     the admin_desk (js/desk.js) — about THE MACHINE, drawn in the one tile you
 *              press ⚙ in. Six rows, plus the app's own three, which are not rows here
 *              because they are not rooms: see js/desk.js.
 *
 * THE SIX MOVED because they were on the wrong side of a line the house had already drawn
 * once, for the gear: *release, update, appearance and log out are the install's, not a
 * tile's, and a room for them meant four copies, one per tile.* Every one of ▣ Roots,
 * ▥ Hotwords, ▦ Stats, 目 Koshi, gbrain and ⚙ Configuration is install-level, and every one
 * was being drawn once per sessionless tile. `surface` is that line, in the one place both
 * readers look — which is the whole reason this file exists rather than two hand-typed lists.
 *
 * ONE surface used to present them all: the tab strip inside the Commons (js/commons.js).
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
 * `compact` is the label for the 402px phone tab strip, where a long name ran off the end
 * of the row — the full name carries on the desktop strip, where there is room for it. A
 * row without `compact` fits everywhere as it is. **It is a commons word only**: the desk
 * has no strip to run off, and shortens by dropping to `glyph` instead.
 *
 * `glyph` is the desk's mark — the whole row when the rail is collapsed, and the mark above
 * or beside the name when it is not. Desk rows only, and every desk row carries one: a rail
 * of blanks is not a rail.
 *
 * A COMMONS `label` CARRIES ITS GLYPH; A DESK `label` DOES NOT, and the difference is not
 * an inconsistency — it is the two surfaces drawing different things. A tab is ONE string,
 * so '⌂ Roster' is the label. A desk row is TWO fields in two boxes, and the rail collapses
 * to just the first, so they have to be spelled apart. Writing '⚙ Configuration' in a desk
 * `label` renders '⚙⚙ Configuration' — which is exactly what it did for one run on
 * 2026-08-18 before this comment existed. Slicing the glyph off the front of the label
 * instead was the other option and is worse: 'gbrain' has no glyph to slice and would have
 * donated its 'g'.
 *
 * THERE IS NO `hint` COLUMN, and its absence is deliberate. Every row carried one and
 * the strip hung it on each tab as hover help; the owner had that removed on 2026-08-18
 * ("we don't need a pop-up … just get rid of it"), and the column went with its only
 * reader rather than staying here unread. A registry field nobody consumes is the same
 * drift this file exists to prevent, arriving by the other door — and the honest answer
 * is that a tab's label was always its explanation. A room that needs more than its
 * label needs a better label.
 *
 * The registry owns names and order, NOT behaviour: which service gates a room stays
 * `serviceOff()` in state.js, and each room's fetches, state and rendering stay in its
 * own module. Agent-agnostic on purpose — nothing here (or in any pane) may assume
 * which agent CLI runs in a tile; a new provider or agent is catalog data (a
 * ronin_catalogs/PROJECT_ROOTS.md launch cell), never a new pane branch.
 */
export const PANES = [
  { id: 'sessions', surface: 'commons', label: '⌂ Roster' },
  { id: 'new', surface: 'commons', label: '＋ New session' },
  { id: 'wipe', surface: 'commons', label: '▤ Wipeboard' },
  // MDEDIT — kin to the wipeboard and next to it: both are files a session keeps,
  // rendered where the owner already is. The difference is ownership — a board is
  // shared by a set of sessions, a doc belongs to the one that listed it.
  { id: 'docs', surface: 'commons', label: '▧ Docs' },
  // ---- the desk, in the order it reads: what the install IS, then what it HOLDS ----
  { id: 'settei', surface: 'desk', glyph: '⚙', label: 'Configuration' },
  { id: 'proj', surface: 'desk', glyph: '▣', label: 'Project roots' },
  { id: 'hotwords', surface: 'desk', glyph: '▥', label: 'Hotwords' },
  { id: 'koshi', surface: 'desk', glyph: '目', label: 'Koshi' },
  { id: 'gbrain', surface: 'desk', glyph: '◇', label: 'gbrain' },
  { id: 'stats', surface: 'desk', glyph: '▦', label: 'Stats' },
  // The gear's own sheet (js/system.js) stays page-level and is NOT a row: release,
  // update, appearance and log out are the install's, not a tile's, and a room for them
  // meant four copies, one per tile.
  //
  // The room the owner wanted, backed by SETTEI, is the ⚙ Configuration row above as of
  // 2026-08-17 — its fields are settled (ronin-lab plans/SETTEI.md Part VI) and it draws
  // one assembled record: what the owner SET, what the box OBSERVED, and what FOLLOWS.
  // So settings moved here; the gear's two mechanical buttons did not. KOTOBA_GLOSSARY
  // rules the label — SETTEI stays ours, and the tab a person reads says Setup.
  // See docs/ui.md.
];
