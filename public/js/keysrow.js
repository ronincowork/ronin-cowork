/* part of the ronin-cowork client — see js/README.md */
/**
 * THE KEYS ROW — the control keys a software keyboard does not have, docked where
 * the typing happens.
 *
 * iOS and iPadOS keyboards carry no Esc, no Ctrl, no Tab and no arrows, so a touch
 * surface cannot interrupt an agent or drive a TUI without help. The first cut hid
 * these keys in a drawer under the app bar — the top of the screen — while the
 * composer sits at the bottom: two taps to reach Escape, at the wrong end of the
 * page. The owner's rule (MOBILE plan, 2026-09-01): the keys are always visible
 * while an Agent is open, zero taps away.
 *
 * One component, one home. The composer prepends this row on every coarse-pointer
 * tile (phone shell and iPad workbench alike), so the keys ride the same lift the
 * composer already does when the keyboard comes up, and they always act on the
 * session whose composer they sit on — never "the active tile", which a page with
 * two terminals cannot make visible.
 *
 * The sequences are the ones the retired header keys and keypad sent, unchanged.
 */
import { t } from './lexicon.js';

/**
 * @param {{sendRaw: (seq: string) => void, latest: () => void}} hooks
 *   sendRaw writes to this row's own session; latest jumps its view to the live end.
 * @returns {{el: HTMLElement}}
 */
export function buildKeysRow(hooks) {
  const row = document.createElement('div');
  row.className = 'keysrow';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', t('bar.keys', 'Keys'));

  // Face · tooltip · what it sends. Faces that are glyphs (^C, ⤓, the arrows) are
  // values, not words; the worded faces go through the lexicon like everything else.
  const keys = () => [
    [t('keys.esc', 'Esc'), t('keys.esc', 'Esc'), '\x1b'],
    ['^C', t('keys.interrupt_title', 'Ctrl-C (interrupt)'), '\x03'],
    [t('keys.tab', 'Tab'), t('keys.tab', 'Tab'), '\t'],
    [t('keys.shift_tab_face', '⇧Tab'), t('keys.shift_tab', 'Shift-Tab'), '\x1b[Z'],
    ['↑', t('keys.up', 'Up'), '\x1b[A'],
    ['↓', t('keys.down', 'Down'), '\x1b[B'],
    ['←', t('keys.left', 'Left'), '\x1b[D'],
    ['→', t('keys.right', 'Right'), '\x1b[C'],
    ['⤓', t('keys.latest_title', 'Jump to latest output'), null],
  ];
  for (const [face, help, seq] of keys()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = face;
    b.title = help;
    // A tap must not pull focus out of the composer's textarea — dismissing the
    // keyboard mid-drive is exactly the friction this row exists to remove.
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('click', () => (seq === null ? hooks.latest() : hooks.sendRaw(seq)));
    row.append(b);
  }
  return { el: row };
}
