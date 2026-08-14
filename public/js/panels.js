/* part of the tmux-ronin client — see js/README.md */
import { refreshHome } from './home.js';
import { IS_TOUCH, S, tiles } from './state.js';

/**
 * Per-session "post-it" note editor. One shared modal (a centered card on desktop,
 * full-bleed on phones) that loads/saves the active tile's session note. The note lives
 * on the tmux session itself (a user option) — no separate storage, gone when the session
 * dies. Additive: it never touches terminal/copy behavior on any device.
 */
export function buildNotePanel() {
  const sheet = document.createElement('div');
  sheet.id = 'notesheet';
  const card = document.createElement('div');
  card.className = 'ns-card';
  const bar = document.createElement('div');
  bar.className = 'ns-bar';
  const title = document.createElement('span');
  title.className = 'ns-title';
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  bar.append(title, saveBtn, closeBtn);
  const ta = document.createElement('textarea');
  ta.placeholder = "What's this session working on?";
  ta.spellcheck = false;
  card.append(bar, ta);
  sheet.appendChild(card);
  document.body.appendChild(sheet);

  let current = null; // session whose note is loaded
  const close = () => {
    sheet.classList.remove('open');
    current = null;
  };
  const open = async (session) => {
    if (!session) return;
    current = session;
    title.textContent = '📝 ' + session;
    ta.value = '';
    ta.disabled = true;
    sheet.classList.add('open');
    try {
      const r = await fetch('/api/sessions/' + encodeURIComponent(session) + '/note');
      const d = await r.json().catch(() => ({}));
      if (current === session) ta.value = d.note || '';
    } catch (_) {}
    ta.disabled = false;
    ta.focus();
  };
  saveBtn.addEventListener('click', async () => {
    if (!current) return;
    const session = current;
    saveBtn.textContent = 'Saving…';
    try {
      await fetch('/api/sessions/' + encodeURIComponent(session) + '/note', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: ta.value }),
      });
      const s = S.sessions.find((x) => x.name === session);
      if (s) s.hasNote = !!ta.value.trim();
      tiles.forEach((t) => t.updateNoteBtn());
    } catch (_) {}
    saveBtn.textContent = 'Save';
    close();
  });
  closeBtn.addEventListener('click', close);
  // Click the backdrop (outside the card) or press Esc to dismiss.
  sheet.addEventListener('pointerdown', (e) => {
    if (e.target === sheet) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('open')) close();
  });
  S.notePanel = { open, close };
}

/* ---------- group tags (🏷) — the session's memberships ---------- */
// Tags exist to be an ADDRESS, not decoration: "the kojinsa group" resolves to a set of
// sessions, so an agent can be pointed at the set instead of members named one by one,
// and picks up a member born after it was briefed. Stored on the tmux session itself
// (@ronin-tags), like the note and the dial — no registry, dies with the session.
// Agents read the same truth with `ronin_bin/tejun-group`; this panel is how the OWNER
// maintains it. Tagging stays the owner's job — agents address groups, they don't edit them.
export function buildTagPanel() {
  const sheet = document.createElement('div');
  sheet.id = 'tagsheet';
  sheet.innerHTML = `<div class="tg-card">
      <div class="tg-bar"><span class="tg-title"></span>
        <button class="tg-save">Save</button><button class="tg-close">Close</button></div>
      <div class="tg-chips"></div>
      <input class="tg-input" type="text" placeholder="add a group (letters, digits, - _)" autocapitalize="off" autocorrect="off" spellcheck="false">
      <div class="tg-known"></div>
      <div class="tg-hint">Agents resolve these with <code>tejun-group &lt;name&gt;</code>.</div>
    </div>`;
  document.body.appendChild(sheet);
  const title = sheet.querySelector('.tg-title');
  const chips = sheet.querySelector('.tg-chips');
  const known = sheet.querySelector('.tg-known');
  const inp = sheet.querySelector('.tg-input');

  let current = null;
  let list = [];
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
      c.innerHTML = '';
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

  const close = () => {
    sheet.classList.remove('open');
    current = null;
  };
  const open = async (session) => {
    if (!session) return;
    current = session;
    title.textContent = '🏷 ' + session;
    list = [];
    renderChips();
    renderKnown();
    sheet.classList.add('open');
    try {
      const r = await fetch('/api/sessions/' + encodeURIComponent(session) + '/tags');
      const d = await r.json().catch(() => ({}));
      if (current === session) {
        list = Array.isArray(d.tags) ? d.tags : [];
        renderChips();
        renderKnown();
      }
    } catch (_) {}
    if (!IS_TOUCH) inp.focus(); // don't summon the iOS keyboard on open
  };

  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      add();
    }
  });
  sheet.querySelector('.tg-save').addEventListener('click', async () => {
    if (!current) return;
    add(); // don't silently drop a tag left sitting in the box
    const session = current;
    try {
      const r = await fetch('/api/sessions/' + encodeURIComponent(session) + '/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags: list }),
      });
      const d = await r.json().catch(() => ({}));
      const s = S.sessions.find((x) => x.name === session);
      if (s) s.tags = Array.isArray(d.tags) ? d.tags : list;
      tiles.forEach((t) => t.updateTagBtn());
      refreshHome(); // home rows + group headings reflect it immediately
    } catch (_) {}
    close();
  });
  sheet.querySelector('.tg-close').addEventListener('click', close);
  sheet.addEventListener('pointerdown', (e) => {
    if (e.target === sheet) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet.classList.contains('open')) close();
  });
  S.tagPanel = { open, close };
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

/**
 * Macro panel: what macros exist, live from ronin_catalogs/MACROS.md, each with a copyable
 * `name: <args>` invocation — the pasteable form sessions execute (see CLAUDE.md).
 * List + copy only; no execution from here (that's the future engine's job). Shown on
 * BOTH desktop and touch (owner override of the touch/desktop split). On touch, "→ ⌨"
 * drops `name: ` into the compose overlay so you type the args and send.
 */
