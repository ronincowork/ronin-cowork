/* part of the ronin-cowork client — see js/README.md */
import { buildDesk } from './desk.js';

/**
 * THE DESK'S TILE-SIDE WIRING — raising it, dropping it, and remembering what it covered.
 *
 * WHY IT IS NOT IN tile.js. Same reason as tiledocs, tilemacros, tilemore and tilehead:
 * Tile owns the cell and hands each concern its own file, and the 700-line ceiling is what
 * keeps that honest rather than aspirational. This is small on purpose — the desk itself
 * is js/desk.js, and the only thing that has to live near the tile is the three-way answer
 * to "what was showing before ⚙".
 *
 * THE STATE IS THE WHOLE JOB. A tile can be showing one of three things when ⚙ is pressed:
 * its terminal, the session_commons, or the desk. `base` records which, because ✕ is UNDO
 * (owner, 2026-08-18) — it puts the tile back where it was rather than always landing
 * somewhere fixed. Recorded on the way IN, never guessed on the way out.
 *
 * THE FALLBACK IS THE COMMONS, NOT THE TERMINAL, and that half is load-bearing. An empty
 * tile has nothing behind its overlays — the same fact that makes ⛩ a one-way door on a
 * sessionless tile (`Tile.toggleHome`, and the guard's comment is the record of someone
 * learning it the hard way) — so dropping the desk onto `term` with no session would leave
 * the owner staring at a blank cell with no way back in. `tile.session` is consulted at the
 * moment of leaving rather than trusting the remembered base, so the answer stays right
 * even when the session died while the desk was up.
 */
export function installDesk(tile, askPersonalAssistant) {
  /* gbrain's "ask this of a PersonalAssistant" button moved to the desk with the room, but
   * the launcher it lands in is the Commons' and stays the Commons'. So the hand-off has
   * to CROSS SURFACES, and raising the Commons is the half that is easy to forget: the
   * Commons' `showPane` names a pane, it does not raise the panel, because until today
   * every caller was already inside it. Called from the desk it would have set ＋ New
   * behind a desk still covering it — the launcher open, filled in, and invisible.
   * (Caught by smoke-ui's gbrain journey, 2026-08-18, which is what that probe is for.)
   * `showHome` lowers the desk on its way up, so this is the whole fix. */
  tile.askPersonalAssistant = (prompt) => {
    tile.showHome();
    askPersonalAssistant(prompt);
  };
  const desk = buildDesk(tile);
  tile.desk = desk.el;
  tile.body.appendChild(desk.el);

  let base = null;

  /* A CLEAN TILE, TOP TO BOTTOM (owner, 2026-08-18: *"it should be a clean tile top to
   * bottom for the install_desk"*). The desk covers the tile BODY, but the header sits
   * above the body and would have gone on showing — a session picker, ⚡, ⌗ and メ, every
   * one of them a control that acts on a session, over a surface that is not about one.
   * A row of controls that do nothing is worse than no row. The class goes on the tile
   * because the header is the tile's, not the desk's; style.css hides it. */
  const mark = () => tile.el.classList.toggle('deskup', desk.el.classList.contains('show'));

  tile.deskVisible = () => tile.el.style.display !== 'none' && desk.el.classList.contains('show');

  tile.showDesk = () => {
    if (!tile.deskVisible()) base = tile.homeVisible() ? 'home' : 'term';
    tile.hideHome(); // one overlay at a time — the two share the tile body
    desk.el.classList.add('show');
    mark();
    desk.enter();
  };

  tile.hideDesk = () => {
    desk.el.classList.remove('show');
    mark();
    if (base === 'home' || !tile.session) tile.showHome();
    base = null;
  };

  tile.toggleDesk = () => (tile.deskVisible() ? tile.hideDesk() : tile.showDesk());

  /** Raising the Commons lowers the desk — otherwise ⛩ pressed over the desk would leave
   *  the Commons behind it, and the desk's ✕ would "undo" to a surface never left. */
  tile.lowerDesk = () => {
    desk.el.classList.remove('show');
    mark();
    base = null;
  };

  tile.showDeskRoom = desk.show;
}
