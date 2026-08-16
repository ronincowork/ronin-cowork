/* part of the tmux-ronin client — see js/README.md */
import { request } from './request.js';
import { refreshHome } from './home.js';
import { field, sheet, status } from './ui.js';
import { IS_TOUCH, S, tiles } from './state.js';

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
  const dlg = sheet({ id: 'notesheet', cls: 'ns-card', label: 'Session note', onClose: () => (current = null) });
  const bar = document.createElement('div');
  bar.className = 'ns-bar';
  const title = document.createElement('span');
  title.className = 'ns-title';
  const msg = status('ns-msg');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  bar.append(title, msg.el, saveBtn, closeBtn);
  const ta = document.createElement('textarea');
  ta.placeholder = "What's this session working on?";
  ta.spellcheck = false;
  const taField = field(ta, { label: 'session note' });
  dlg.card.append(bar, taField.el);

  const say = (text, bad) => msg.say(text, bad ? 'bad' : '');

  const open = async (session) => {
    if (!session) return;
    current = session;
    title.textContent = '📝 ' + session;
    ta.value = '';
    ta.disabled = true;
    saveBtn.disabled = true;
    say('loading…');
    dlg.open();
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/note');
    if (current !== session) return; // the sheet moved on while this was in flight
    if (!r.ok) {
      // Save stays off: an empty box over a note that failed to LOAD would save
      // emptiness over it, which is worse than the failure it hides.
      say('could not load — ' + r.message, true);
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
    say('saving…');
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/note', {
      method: 'POST',
      json: { note: ta.value },
    });
    saveBtn.disabled = false;
    if (!r.ok) {
      // The text stays in the box and the sheet stays up — a failed save must never
      // close the editor and look successful.
      say('not saved — ' + r.message, true);
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

/* ---------- group tags (🏷) — the session's memberships ---------- */
// Tags exist to be an ADDRESS, not decoration: "the kojinsa group" resolves to a set of
// sessions, so an agent can be pointed at the set instead of members named one by one,
// and picks up a member born after it was briefed. Stored on the tmux session itself
// (@ronin-tags), like the note and the dial — no registry, dies with the session.
// Agents read the same truth with `ronin_bin/tejun-group`; this panel is how the OWNER
// maintains it. Tagging stays the owner's job — agents address groups, they don't edit them.
export function buildTagPanel() {
  let current = null;
  let list = [];
  const dlg = sheet({ id: 'tagsheet', cls: 'tg-card', label: 'Session groups', onClose: () => (current = null) });
  dlg.card.innerHTML = `<div class="tg-bar"><span class="tg-title"></span>
        <button class="tg-save">Save</button><button class="tg-close">Close</button></div>
      <div class="tg-chips"></div>
      <input class="tg-input" type="text" placeholder="add a group (letters, digits, - _)" autocapitalize="off" autocorrect="off" spellcheck="false">
      <div class="tg-known"></div>
      <div class="tg-hint">Agents resolve these with <code>tejun-group &lt;name&gt;</code>.</div>`;
  const title = dlg.card.querySelector('.tg-title');
  const msg = status('tg-msg');
  title.after(msg.el);
  const chips = dlg.card.querySelector('.tg-chips');
  const known = dlg.card.querySelector('.tg-known');
  const inp = dlg.card.querySelector('.tg-input');
  const inpField = field(inp, { label: 'add a group' });
  // field() wraps in place: put the wrapper where the input was.
  dlg.card.insertBefore(inpField.el, known);

  const say = (text, bad) => msg.say(text, bad ? 'bad' : '');
  const clean = (t) =>
    String(t || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 32);

  const renderChips = () => {
    chips.innerHTML = '';
    if (!list.length) {
      const em = document.createElement('span');
      em.className = 'tg-empty';
      em.textContent = 'in no group';
      chips.appendChild(em);
    }
    list.forEach((t, i) => {
      const c = document.createElement('button');
      c.className = 'tg-chip on';
      c.append(document.createTextNode(t), Object.assign(document.createElement('i'), { textContent: '✕' }));
      c.title = 'remove';
      c.addEventListener('click', () => {
        list.splice(i, 1);
        renderChips();
        renderKnown();
      });
      chips.appendChild(c);
    });
  };
  // Groups already in play elsewhere — one tap to join, so the vocabulary stays small
  // instead of sprouting kojinsa / kojin-sa / Kojinsa.
  const renderKnown = () => {
    const all = [...new Set(S.sessions.flatMap((s) => s.tags || []))].sort().filter((t) => !list.includes(t));
    known.innerHTML = '';
    if (!all.length) return;
    const lbl = document.createElement('span');
    lbl.className = 'tg-known-lbl';
    lbl.textContent = 'join:';
    known.appendChild(lbl);
    all.forEach((t) => {
      const c = document.createElement('button');
      c.className = 'tg-chip';
      c.textContent = t;
      c.addEventListener('click', () => {
        list.push(t);
        list.sort();
        renderChips();
        renderKnown();
      });
      known.appendChild(c);
    });
  };
  const add = () => {
    const t = clean(inp.value);
    inp.value = '';
    if (!t || list.includes(t)) return;
    list.push(t);
    list.sort();
    renderChips();
    renderKnown();
  };

  const open = async (session) => {
    if (!session) return;
    current = session;
    title.textContent = '🏷 ' + session;
    list = [];
    renderChips();
    renderKnown();
    say('');
    dlg.open();
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/tags');
    if (current !== session) return;
    if (!r.ok) {
      say('could not load — ' + r.message, true);
      return;
    }
    list = Array.isArray(r.data.tags) ? r.data.tags : [];
    renderChips();
    renderKnown();
    if (!IS_TOUCH) inp.focus(); // don't summon the iOS keyboard on open
  };

  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      add();
    }
  });
  dlg.card.querySelector('.tg-save').addEventListener('click', async () => {
    if (!current) return;
    add(); // don't silently drop a tag left sitting in the box
    const session = current;
    say('saving…');
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/tags', {
      method: 'POST',
      json: { tags: list },
    });
    if (!r.ok) {
      // The membership you assembled stays on screen; the failure says why.
      say('not saved — ' + r.message, true);
      return;
    }
    const s = S.sessions.find((x) => x.name === session);
    if (s) s.tags = Array.isArray(r.data.tags) ? r.data.tags : list;
    tiles.forEach((t) => t.syncHeader());
    refreshHome(); // home rows + group headings reflect it immediately
    dlg.close();
  });
  dlg.card.querySelector('.tg-close').addEventListener('click', dlg.close);
  S.tagPanel = { open, close: dlg.close };
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
