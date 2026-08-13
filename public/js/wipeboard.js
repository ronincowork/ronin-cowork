/* part of the tmux-ronin client — see js/README.md */
import { IS_TOUCH, S } from './state.js';

export function buildWipeboard(tile, root, isShowing) {
  let name = null; // which board this TILE is watching (each tile can watch its own)
  let mtime = 0; // only re-render the thread when the file actually moved
  let memSig = ''; // ditto for the member row — see renderMembers
  let briefDirty = false; // never clobber a brief the owner is mid-edit

  const head = document.createElement('div');
  head.className = 'wb-head';
  const pick = document.createElement('select');
  pick.title = 'Which wipeboard to watch';
  const addBtn = document.createElement('button');
  addBtn.textContent = '＋ board';
  addBtn.title = 'Start a new wipeboard';
  head.append(pick, addBtn);

  // -- brief: the owner's "what this is and what's to be discussed" --
  const briefWrap = document.createElement('div');
  briefWrap.className = 'wb-brief';
  const briefH = document.createElement('button');
  briefH.className = 'wb-brief-h';
  briefH.textContent = 'brief';
  briefH.title = 'Show / hide the brief';
  const brief = document.createElement('textarea');
  brief.rows = 3;
  brief.placeholder = 'what this board is for, and what is to be discussed';
  brief.spellcheck = false;
  briefWrap.append(briefH, brief);
  // On a phone the brief starts collapsed — the thread is what you came for, and the
  // keyboard eats half the screen. Desktop keeps it open, exactly as before.
  if (IS_TOUCH) briefWrap.classList.add('shut');
  briefH.addEventListener('click', () => briefWrap.classList.toggle('shut'));
  brief.addEventListener('input', () => {
    briefDirty = true;
  });
  brief.addEventListener('blur', async () => {
    if (!name || !briefDirty) return;
    briefDirty = false;
    try {
      await fetch('/api/wipeboards/' + encodeURIComponent(name) + '/brief', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief: brief.value }),
      });
      mtime = 0; // force a re-read so the pane shows what actually landed
    } catch (_) {}
  });

  // -- members: chips with ×, and a picker offering groups AND individual sessions.
  // Add and remove are equal citizens — that was an explicit ask.
  const memRow = document.createElement('div');
  memRow.className = 'wb-mem';

  // -- the thread --
  const thread = document.createElement('div');
  thread.className = 'wb-thread';

  // -- compose: the owner's own line, posted as `user: <name>` --
  const composeRow = document.createElement('div');
  composeRow.className = 'wb-compose';
  const say = document.createElement('textarea');
  say.rows = 1;
  say.placeholder = 'say something to everyone on this board';
  say.spellcheck = false;
  const post = document.createElement('button');
  post.textContent = 'Post';
  composeRow.append(say, post);
  root.append(head, briefWrap, memRow, thread, composeRow);

  const empty = (msg) => {
    thread.innerHTML = '';
    const e = document.createElement('div');
    e.className = 'wb-empty';
    e.textContent = msg;
    thread.appendChild(e);
  };

  const fillPicker = (boards) => {
    const cur = pick.value;
    pick.innerHTML = '';
    pick.add(new Option('— wipeboard —', ''));
    for (const b of boards) pick.add(new Option(`${b.name} (${b.members})`, b.name));
    pick.value = [...pick.options].some((o) => o.value === cur) ? cur : name || '';
  };

  const loadBoards = async () => {
    try {
      const r = await fetch('/api/wipeboards', { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) fillPicker(d.boards || []);
      return d.boards || [];
    } catch (_) {
      return [];
    }
  };

  const renderMembers = (members) => {
    // Rebuild ONLY when membership actually changed. refresh() runs every 2s, and this
    // row holds a native <select>; blowing it away mid-poll closed the picker the instant
    // the owner opened it — the list flashed up and could never be clicked. Membership is
    // not in the file, so the mtime guard below does not cover it; this is its own.
    const sig = members.map((m) => `${m.name}:${m.control}`).join(',');
    if (sig === memSig) return;
    memSig = sig;
    memRow.innerHTML = '';
    for (const m of members) {
      const chip = document.createElement('span');
      chip.className = 'wb-chip';
      chip.append(Object.assign(document.createElement('b'), { textContent: m.name }));
      // The dial travels with the member: a 👁/👤 session is ON the board but was never
      // typed into, and the chip is where you see that without opening it.
      if (m.control !== 'write') {
        chip.append(
          Object.assign(document.createElement('i'), {
            textContent: m.control === 'user' ? '👤' : '👁',
            title: 'On the board, but not notified — its dial is not 🤖',
          }),
        );
      }
      const x = document.createElement('button');
      x.textContent = '×';
      x.title = 'Remove ' + m.name + ' from this board';
      x.addEventListener('click', async () => {
        x.disabled = true;
        try {
          await fetch(
            '/api/wipeboards/' + encodeURIComponent(name) + '/members/' + encodeURIComponent(m.name),
            { method: 'DELETE' },
          );
          mtime = 0;
          await refresh();
        } catch (e) {
          alert('Could not remove:\n' + e.message);
        }
      });
      chip.appendChild(x);
      memRow.appendChild(chip);
    }
    // The picker: groups first (a set in one pick), then individual sessions.
    const on = new Set(members.map((m) => m.name));
    const plus = document.createElement('select');
    plus.className = 'wb-plus';
    plus.add(new Option('＋ add…', ''));
    const groups = [...new Set(S.sessions.flatMap((s) => s.tags || []))].sort();
    for (const g of groups) plus.add(new Option('+' + g + ' (group)', 'g:' + g));
    for (const s of S.sessions) if (!on.has(s.name)) plus.add(new Option('@' + s.name, 's:' + s.name));
    plus.addEventListener('change', async () => {
      const v = plus.value;
      if (!v || !name) return;
      plus.disabled = true;
      try {
        const r = await fetch('/api/wipeboards/' + encodeURIComponent(name) + '/members', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(v.startsWith('g:') ? { group: v.slice(2) } : { session: v.slice(2) }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        // Say plainly who was told and who wasn't — a silently-unnotified member is
        // exactly the confusion this board exists to remove.
        const quiet = Object.entries(d.results || {}).filter(([, v2]) => !/^notified$/.test(v2));
        if (quiet.length) alert(quiet.map(([k, v2]) => `${k}: ${v2}`).join('\n'));
        mtime = 0;
        await refresh();
      } catch (e) {
        alert('Could not add:\n' + e.message);
      }
      plus.disabled = false;
    });
    memRow.appendChild(plus);
  };

  const renderThread = (posts) => {
    thread.innerHTML = '';
    if (!posts.length) {
      empty('nothing posted yet');
      return;
    }
    for (const p of posts) {
      const d = document.createElement('div');
      // Three kinds, visually distinct: an agent's post, the owner's steer, and a
      // system line for a roster change. A steer must never read as an agent's post.
      const kind = p.author === 'system' ? 'sys' : p.author.startsWith('@') ? 'agent' : 'owner';
      d.className = 'wb-post ' + kind;
      const h = document.createElement('div');
      h.className = 'wb-who';
      h.append(
        Object.assign(document.createElement('b'), { textContent: p.author }),
        Object.assign(document.createElement('span'), { textContent: p.time }),
      );
      const body = document.createElement('div');
      body.className = 'wb-text';
      body.textContent = p.text;
      d.append(h, body);
      thread.appendChild(d);
    }
    thread.scrollTop = thread.scrollHeight; // newest last, pinned to the bottom
  };

  const refresh = async () => {
    if (!name) return;
    try {
      const r = await fetch('/api/wipeboards/' + encodeURIComponent(name), { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) {
        empty(d.error || 'could not read this board');
        return;
      }
      renderMembers(d.members || []);
      if (d.mtime === mtime) return; // file hasn't moved — leave the DOM (and any selection) alone
      mtime = d.mtime;
      if (!briefDirty) brief.value = d.brief || '';
      renderThread(d.posts || []);
    } catch (_) {}
  };

  pick.addEventListener('change', async () => {
    name = pick.value || null;
    mtime = 0;
    memSig = ''; // different board — the row must rebuild even if the names match
    briefDirty = false;
    if (!name) {
      brief.value = '';
      memRow.innerHTML = '';
      empty('pick a wipeboard, or start one with ＋');
      return;
    }
    await refresh();
  });

  addBtn.addEventListener('click', async () => {
    const raw = prompt('Name the wipeboard (letters, digits, - _):');
    if (raw == null) return;
    const n = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!n) return;
    try {
      const r = await fetch('/api/wipeboards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: n }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await loadBoards();
      pick.value = n;
      pick.dispatchEvent(new Event('change'));
    } catch (e) {
      alert('Could not start a wipeboard:\n' + e.message);
    }
  });

  const sendPost = async () => {
    const text = say.value.trim();
    if (!text || !name) return;
    post.disabled = true;
    try {
      const r = await fetch('/api/wipeboards/' + encodeURIComponent(name) + '/post', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      say.value = '';
      mtime = 0;
      await refresh();
    } catch (e) {
      alert('Could not post:\n' + e.message);
    }
    post.disabled = false;
  };
  post.addEventListener('click', sendPost);
  // Enter posts, Shift+Enter is a newline — same bargain as the launcher's brief box.
  say.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPost();
    }
  });

  // Poll only while this pane is actually on screen; a tile on another tab costs nothing.
  setInterval(() => {
    if (isShowing()) void refresh();
  }, 2000);

  empty('pick a wipeboard, or start one with ＋');
  return {
    enter() {
      void loadBoards().then(() => {
        if (name) void refresh();
      });
    },
  };
}

/* ---------- tile ---------- */
