/* part of the ronin-cowork client — see js/README.md */
import { DOC_MIME } from './team-drag.js';
import { MENTION_MIME } from './tilementions.js';
import { IS_TOUCH } from './state.js';

/**
 * TEXT DROPPED ON A TILE — an @mention (js/tilementions.js) or a doc's short reference
 * off the ▧ Docs list (js/docs.js) — lands where a macro's text lands (js/tilemacros.js
 * `prefill`): the composer at the caret when the tile is unlocked, straight into the
 * pane when it is locked, the pending line otherwise.
 *
 * ON THE TILE, NOT THE COMPOSER, and that is the whole reason this file exists
 * (owner, 2026-08-28: *"I can drag the doc reference, but it doesn't land in the
 * terminal"*): the composer is built lazily by `setComposer` and a locked, live tile
 * has none, so a listener on it heard nothing on exactly the tiles the owner types at.
 * The tile body is there from construction and the terminal covers most of it.
 */
export function installTextDrops(tile) {
  const body = tile.body;
  const carried = (e) => (e.dataTransfer?.types.includes(MENTION_MIME) ? 'mention' : e.dataTransfer?.types.includes(DOC_MIME) ? 'doc' : '');
  const land = (text) => {
    // An unlocked tile that has not opened its composer yet opens it now: "my dialog box"
    // is where a reference goes, not the pending line.
    if (!tile.locked && !tile.composerTa && tile.session) tile.setComposer?.(true);
    const ta = tile.composerTa;
    if (ta && (!tile.locked || IS_TOUCH)) {
      const start = ta.selectionStart;
      const lead = start > 0 && !/\s/.test(ta.value[start - 1]) ? ' ' : '';
      ta.setRangeText(`${lead}${text} `, start, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
      ta.focus();
    } else if (tile.locked && tile.session) {
      tile.sendRaw(`${text} `);
      if (!IS_TOUCH) tile.focusTerminal();
    } else {
      tile.pending += `${text} `;
      tile.renderPending();
    }
  };
  body.addEventListener('dragover', (e) => {
    if (!carried(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    body.dataset.dropText = 'true';
  });
  body.addEventListener('dragleave', () => { delete body.dataset.dropText; });
  body.addEventListener('drop', (e) => {
    const kind = carried(e);
    if (!kind) return;
    const data = e.dataTransfer.getData(kind === 'mention' ? MENTION_MIME : DOC_MIME);
    delete body.dataset.dropText;
    if (!data) return;
    e.preventDefault();
    e.stopPropagation(); // the cell's own drop (a session card) must not see this
    land(kind === 'mention' ? `@${data}` : data);
  });
}
