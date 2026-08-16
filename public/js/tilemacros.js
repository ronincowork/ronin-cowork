/* part of the tmux-ronin client — see js/README.md */
import { macroData } from './home.js';
import { toast } from './ui.js';
import { IS_TOUCH, S } from './state.js';
import { addProvMark } from './provenance.js';

/**
 * The ⚡ button on a TILE header: the fast path for session_macros.
 *
 * It PREFILLS and stops — `+forkit: ` lands in the input you are typing in, mid
 * sentence, and you add your own words before sending. It never runs anything.
 * That is the whole point: the text it inserts is text you could have typed, so
 * after a few uses you type it yourself, including from a pane or a phone where
 * no menu exists. A menu that executed would hide the syntax forever.
 *
 * Prefill needs no server capability — every surface already has a way to put
 * characters somewhere without submitting them:
 *   compose overlay open  -> append into the textarea (touch types here)
 *   unlocked tile         -> append to the parked buffer, shown in the strip
 *   locked tile           -> sendRaw(), which is `{t:'i'}` with no Enter
 * The reference — read the whole instruction, browse what exists — is the commons'
 * macros tab, deliberately a different surface. See docs/tejun-macro-system.md.
 */
/** Catalog blurbs are markdown, and a tooltip renders none of it — `**bold**` and
 *  backticks arrive as literal punctuation. Strip the syntax, keep the words. */
const plain = (s) =>
  (s || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

export function buildTileMacros(tile) {
  const btn = document.createElement('button');
  btn.className = 'tmac-btn';
  btn.textContent = '⚡';
  btn.title = 'Macros — drop one into this session\'s input';

  const menu = document.createElement('div');
  menu.className = 'tmac';

  const close = () => menu.classList.remove('open');

  // Where the text goes, in the order a surface takes precedence. Returns false
  // when there is nowhere to put it (no session showing) so the click can say so
  // instead of silently doing nothing.
  const prefill = (text) => {
    // Touch types in the tile's composer — the one box on the phone. This used to
    // append into the compose OVERLAY's textarea, which was a different box from the
    // one under your thumb, so a macro you picked appeared somewhere you were not
    // looking. The overlay is gone; there is one place text can land.
    if (IS_TOUCH && tile.composerTa) {
      tile.composerTa.value += text;
      tile.composerTa.dispatchEvent(new Event('input')); // let it grow
      tile.composerTa.focus();
      return true;
    }
    if (!tile.session) return false;
    if (tile.locked) {
      tile.sendRaw(text);
      if (!IS_TOUCH) tile.focusTerminal();
    } else {
      tile.pending += text;
      tile.renderPending();
    }
    return true;
  };

  /**
   * BACKOFF for the macros that fire. The button presses Enter for you, so a second
   * tap is a second interruption of an agent that is already doing the thing — and
   * an impatient triple-tap would queue three of them into the pane. One send, then
   * the row is spent for COOLDOWN_MS and says so.
   *
   * Per tile and per macro, in memory: it guards a finger, not a policy, and it is
   * meant to expire when you reload. The one thing it must not do is silently
   * swallow the tap — a button that looks like it did nothing gets tapped again.
   */
  const COOLDOWN_MS = 120000;
  const firedAt = new Map();
  const coolingFor = (name) => {
    const left = COOLDOWN_MS - (Date.now() - (firedAt.get(name) ?? -Infinity));
    return left > 0 ? Math.ceil(left / 1000) : 0;
  };

  /** Type a line into the session and submit it. The Enter is a SEPARATE, delayed
   *  keypress — TUIs like Claude Code treat a trailing \r in the same write as part
   *  of the paste and do not submit (the compose trick, same as dvrInput). */
  const fire = (text) => {
    if (!tile.session) return false;
    tile.sendRaw(text);
    setTimeout(() => tile.sendRaw('\r'), 40);
    return true;
  };

  const render = () => {
    menu.innerHTML = '';
    for (const m of macroData || []) {
      const row = document.createElement('button');
      row.className = 'tmac-row' + (m.send ? ' sends' : '');
      const nm = document.createElement('b');
      // A macro that fires is not spelled like one you finish typing: no trailing
      // colon to fill in, and a ⏎ so the row cannot be mistaken for a prefill.
      nm.textContent = m.send ? '+' + m.name + ' ⏎' : '+' + m.name + ':';
      // The invocation ALONE on the row, and the description on hover. This menu is
      // the fast path — you are mid-sentence — and blurbs run to a paragraph, which
      // made the list a wall of text. The full instruction belongs in the reference.
      row.title = plain(m.description);
      row.append(nm);
      // A macro of yours, or one of ours you replaced, says so here too — the same
      // mark on every surface a catalog is rendered on (js/provenance.js).
      addProvMark(row, m);
      const cool = m.send ? coolingFor(m.name) : 0;
      if (cool) {
        row.disabled = true;
        nm.textContent += `  · sent, wait ${cool}s`;
      }
      row.addEventListener('click', () => {
        if (m.send) {
          if (coolingFor(m.name)) return;
          close();
          // The toast, not an alert — an alert over a live pane steals the keyboard
          // (docs/ui.md), and this is exactly a tile-scoped outcome.
          if (!fire(m.send)) toast('open a session in this tile first', false);
          else firedAt.set(m.name, Date.now());
          return;
        }
        close();
        if (!prefill('+' + m.name + ': ')) toast('open a session in this tile first', false);
      });
      menu.appendChild(row);
    }
    if (!(macroData || []).length) menu.textContent = 'no macros yet';
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.classList.contains('open');
    document.querySelectorAll('.tmac.open').forEach((m) => m.classList.remove('open'));
    if (open) return;
    render();
    menu.classList.add('open');
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { btn, menu };
}
