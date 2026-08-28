/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { field, sheet, status } from './ui.js';
import { IS_TOUCH, S, tiles } from './state.js';
import { t } from './lexicon.js';

/**
 * Per-session "post-it" note editor. One shared modal (a centered card on desktop,
 * full-bleed on phones) that loads/saves the active tile's session note. The note lives
 * on the tmux session itself (a user option) — no separate storage, gone when the session
 * dies. Additive: it never touches terminal/copy behavior on any device.
 *
 * Built on the ui.sheet primitive: dialog semantics, focus entry and restoration,
 * Escape/backdrop dismissal — the behaviours every sheet shares. What is THIS sheet's:
 * a failed save keeps the sheet open with the text intact (closing on failure made a
 * lost note look saved, which is the failure mode that costs trust), and a failed load
 * keeps Save off so an empty box cannot overwrite a note that merely failed to arrive.
 */
export function buildNotePanel() {
  let current = null; // session whose note is loaded
  const dlg = sheet({ id: 'notesheet', cls: 'ns-card', label: t('panels.note_sheet', 'Session note'), onClose: () => (current = null) });
  const bar = document.createElement('div');
  bar.className = 'ns-bar';
  const title = document.createElement('span');
  title.className = 'ns-title';
  const msg = status('ns-msg');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = t('panels.save', 'Save');
  const closeBtn = document.createElement('button');
  closeBtn.textContent = t('panels.close', 'Close');
  bar.append(title, msg.el, saveBtn, closeBtn);
  const ta = document.createElement('textarea');
  ta.placeholder = t('panels.note_placeholder', "What's this session working on?");
  ta.spellcheck = false;
  const taField = field(ta, { label: t('panels.note', 'session note') });
  dlg.card.append(bar, taField.el);

  const say = (text, bad) => msg.say(text, bad ? 'bad' : '');

  const open = async (session) => {
    if (!session) return;
    current = session;
    title.textContent = '📝 ' + session;
    ta.value = '';
    ta.disabled = true;
    saveBtn.disabled = true;
    say(t('panels.loading', 'loading…'));
    dlg.open();
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/note');
    if (current !== session) return; // the sheet moved on while this was in flight
    if (!r.ok) {
      // Save stays off: an empty box over a note that failed to LOAD would save
      // emptiness over it, which is worse than the failure it hides.
      say(t('panels.load_failed', 'could not load — {message}', { message: r.message }), true);
      return;
    }
    ta.value = r.data.note || '';
    ta.disabled = false;
    saveBtn.disabled = false;
    say('');
    if (!IS_TOUCH) ta.focus();
  };
  saveBtn.addEventListener('click', async () => {
    if (!current || saveBtn.disabled) return;
    const session = current;
    saveBtn.disabled = true;
    say(t('panels.saving', 'saving…'));
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/note', {
      method: 'POST',
      json: { note: ta.value },
    });
    saveBtn.disabled = false;
    if (!r.ok) {
      // The text stays in the box and the sheet stays up — a failed save must never
      // close the editor and look successful.
      say(t('panels.not_saved', 'not saved — {message}', { message: r.message }), true);
      return;
    }
    const s = S.sessions.find((x) => x.name === session);
    if (s) s.hasNote = !!ta.value.trim();
    tiles.forEach((t) => t.syncHeader());
    dlg.close();
  });
  closeBtn.addEventListener('click', dlg.close);
  S.notePanel = { open, close: dlg.close };
}

/** Clipboard write with http fallback (the copy-sheet textarea trick). */
export async function toClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.readOnly = true;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_) {}
    ta.remove();
    return ok;
  }
}
