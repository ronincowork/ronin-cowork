/* part of the ronin-cowork client — see js/README.md */
import { S } from './state.js';
import { t } from './lexicon.js';

export const MENTION_MIME = 'application/x-ronin-session-mention';
/** A native session dropdown that inserts the chosen name into this tile's composer. */
export function buildTileMentions(tile) {
  const select = document.createElement('select');
  select.className = 'tmention-btn';
  select.setAttribute('aria-label', t('head.mention_aria', 'Mention another session'));

  const insert = (name) => {
    const mention = `@${name} `;
    const ta = tile.composerTa;
    if (ta && !tile.locked) {
      const start = ta.selectionStart;
      const lead = start > 0 && !/\s/.test(ta.value[start - 1]) ? ' ' : '';
      ta.setRangeText(lead + mention, start, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
      ta.focus();
    } else if (tile.locked) {
      tile.sendRaw(mention);
      tile.focusTerminal();
    } else {
      tile.pending += mention;
      tile.renderPending();
    }
  };

  const render = () => {
    const chosen = select.value;
    select.innerHTML = '';
    select.add(new Option('@', ''));
    for (const session of S.sessions) select.add(new Option(session.name, session.name));
    select.value = S.sessions.some((session) => session.name === chosen) ? chosen : '';
  };

  render();
  select.addEventListener('pointerdown', render);
  select.addEventListener('focus', render);
  select.addEventListener('change', () => {
    if (select.value) insert(select.value);
    select.value = '';
  });

  return { el: select };
}
