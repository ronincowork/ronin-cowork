/* part of the ronin-cowork client — see js/README.md */
import { closeTileMore, fitDropToTile } from './tilemore.js';
import { t } from './lexicon.js';

/**
 * 📄 ON THE TILE HEADER — THIS session's listed docs, without leaving the tile.
 *
 * WHY (owner, 2026-08-18): *"If I wanted to look at a tile and say 'oh, I want to watch
 * this tile's docs', it's not actually easy or intuitive to find them by going to the
 * Commons, going to Docs, and then looking for their particular agent's tracked docs. But
 * if, on a tile, I had a button… inside the menu, and then if I clicked on that, it would
 * show the docs."* The ▧ Docs tab lists EVERY session's docs, grouped by session, so
 * reaching one tile's docs meant leaving the tile, remembering the session's name and
 * finding its group among all the others — three steps and a memory test for a fact the
 * tile already knows about itself.
 *
 * IT FETCHES NOTHING, and that is why this file is short. `Tile.refreshTegami` already
 * parks the whole letter on `tile.tegami`, and `docs: string[]` is part of that payload
 * (`src/services/michi/tegami.ts`) — refreshed on connect, after a write, and by the 30s
 * poll for every visible connected tile (`layout.js`). So there is no request here, no
 * loading state and no failure state to design: `refreshTegami` already refuses to fetch
 * when michi is absent rather than 404ing, discards a response if the tile switched
 * session mid-flight, and keeps the last value on a failed read. This renders what that
 * left behind, and inherits all three behaviours for free.
 *
 * THERE IS STILL DELIBERATELY NO FILE BROWSER — the standing rule at the top of
 * `docs.js` (owner: *"I don't want someone to build that explorer piece"*). This does not
 * reverse it and must not be read as a crack in it. A doc appears here for exactly the
 * reason it appears on the ▧ Docs tab: an agent ran `write_tegami --doc <path>`. All that
 * is different is the SCOPE — one list, narrowed to the session the tile is already
 * showing. Which is also why a session that has listed nothing gets a sentence saying so
 * and never a fallback to the global list: falling back would rebuild, inside the tile,
 * the exact hunt this button exists to remove.
 *
 * OPENING ONE CLOBBERS THIS TILE with the Commons' own editor, which is the owner's own
 * reasoning: *"it would just open in place on that session, clobbering the session I'm
 * looking at, which is fine because you can just close the commons and you're back in the
 * session."* The Commons already renders INTO a tile, so this is the existing shape and
 * not a new one — the session keeps streaming behind the panel, and ✕ on the tab strip
 * gives it back. The click goes to `tile.openDoc`, because the tile owns what it means.
 *
 * DISMISSAL IS ⚡'s GRAMMAR, not a third convention: this hangs off the same corner of the
 * same header as ⚡ and メ, so the three close each other with the `.open` CLASS sweep
 * those two already use. `tilemore.js` argues that at length; it is one drop's rule, and
 * this is the third drop living under it.
 */
export function buildTileDocs(tile) {
  const btn = document.createElement('button');
  btn.className = 'tdocs-btn';
  btn.type = 'button';
  btn.textContent = '📄';
  // No `title` here: the hover text is the `help` on this control's row in `tilehead.js`,
  // like every other control's, and it is a READING (the count) — one writer, one string.

  const menu = document.createElement('div');
  menu.className = 'tdocs';

  const close = () => menu.classList.remove('open');

  const render = () => {
    menu.innerHTML = '';
    const docs = tile.tegami?.docs || [];
    if (!docs.length) {
      // THE SAME SENTENCE THE ▧ Docs TAB USES for its own empty list (`docs.js`), narrowed
      // from "no session" to this one. Two surfaces answering one question must not answer
      // it in two different vocabularies — and the fix named here is the only door in.
      const e = document.createElement('div');
      e.className = 'tdocs-empty';
      e.textContent =
        t('docs.empty_session', 'This session has listed no docs yet. An agent lists one with: write_tegami --doc <path>');
      menu.appendChild(e);
      return;
    }
    for (const p of docs) {
      const parts = p.split('/');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tdocs-row';
      row.title = p; // the absolute path, for the one time the name is not enough
      row.append(
        Object.assign(document.createElement('b'), { textContent: parts.pop() }),
        // The last two directories, exactly as the ▧ Docs tab does it — two files called
        // HOW_TO.md are told apart without printing an absolute path on a narrow row.
        Object.assign(document.createElement('span'), { textContent: parts.slice(-2).join('/') }),
      );
      row.addEventListener('click', () => {
        close();
        tile.openDoc(p);
      });
      menu.appendChild(row);
    }
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    // THE REFUSAL LIVES HERE, because a WIDGET row wires its own click. `buildTileHead`
    // guards the `on:` rows with `quietReason`, but a widget's listener is inside the
    // widget and never passes through that guard — ⚡ carries the same obligation and
    // answers it with a toast. Measured 2026-08-18: without this, a dimmed 📄 in an empty
    // tile still dropped open and told you "this session has listed no docs yet", which is
    // a sentence about a session that is not there. `aria-disabled` rather than a second
    // copy of the `needs` rule: `setInert` writes it from the row, so this reads the one
    // answer the table already gave. Hover still explains — that is what dimming with a
    // class instead of `disabled` buys.
    if (btn.getAttribute('aria-disabled') === 'true') return;
    const wasOpen = menu.classList.contains('open');
    // Every rival first — ⚡ and メ anchor to this same corner, so two open at once is two
    // panels on one spot. メ goes through `closeTileMore` rather than a class sweep because
    // four tiles build four メ buttons, each carrying its own `aria-expanded`.
    closeTileMore();
    document.querySelectorAll('.tmac.open').forEach((m) => m.classList.remove('open'));
    if (wasOpen) return; // the click that closes is the click on 📄 itself
    // RENDERED AT OPEN TIME, never kept in sync: the list is `tile.tegami`, which the poll
    // rewrites under us, and a drop is up for a second at a time. Read it when it is asked
    // for and there is nothing to keep fresh.
    render();
    menu.classList.add('open');
    fitDropToTile(btn, menu);
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { el: btn, menu };
}
