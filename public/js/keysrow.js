/* part of the ronin-cowork client — see js/README.md */
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
    // The two line-clearing keys, because the agents disagree: Esc empties Claude's
    // box, while readline-shaped composers (Codex among them) take ^U kill-line.
    // Generic terminal keys, deliberately — a per-provider special key would be
    // vendor knowledge the provider's own remappable keymap could invalidate.
    ['⌫', t('keys.backspace', 'Backspace'), '\x7f'],
    ['^U', t('keys.clear_line_title', 'Ctrl-U — clear the input line'), '\x15'],
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
