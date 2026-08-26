/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { field } from './ui.js';
import { IS_TOUCH, S } from './state.js';
import { t } from './lexicon.js';

/**
 * ▤ WIPEBOARD — teams first (owner ruling 2026-08-22; the WIPEBOARD_TEAMS build-out).
 *
 * The DEFAULT view is the team listing, in the roster's own style: every team IS a
 * wipeboard, membership follows the team, and the ordinary path has nothing to create
 * and nobody to enrol. Picking a team opens its wipeboard. Custom wipeboards keep the
 * old machinery whole — create by name, enrol by hand — folded beneath the teams as
 * the secondary path. Two views, one pane: the listing, or one open wipeboard.
 */
export function buildWipeboard(tile, root, isShowing) {
  let name = null; // the open wipeboard; null = the listing (each tile watches its own)
  let kind = 'custom'; // of the open wipeboard — 'team' derives its members, 'custom' enrols
  let mtime = 0; // only re-render the thread when the file actually moved
  let memSig = ''; // ditto for the member row — see renderMembers
  let listSig = ''; // ditto for the listing — a 2s poll must not eat a mid-tap rebuild
  let briefDirty = false; // never clobber a brief the owner is mid-edit

  /* ---------- the LISTING ---------- */
  const listWrap = document.createElement('div');
  listWrap.className = 'wb-list';

  /* ---------- the OPEN WIPEBOARD ---------- */
  const boardWrap = document.createElement('div');
  boardWrap.hidden = true;

  const head = document.createElement('div');
  head.className = 'wb-head';
  const back = document.createElement('button');
  back.textContent = t('wipeboard.back', '‹ wipeboards');
  back.title = t('wipeboard.back_title', 'Back to the wipeboard listing');
  const title = document.createElement('b');
  title.className = 'wb-title';
  const kindNote = document.createElement('span');
  kindNote.className = 'wb-kind';
  head.append(back, title, kindNote);

  // -- brief: the owner's "what this is and what's to be discussed" --
  const briefWrap = document.createElement('div');
  briefWrap.className = 'wb-brief';
  const briefH = document.createElement('button');
  briefH.className = 'wb-brief-h';
  briefH.textContent = t('wipeboard.brief', 'brief');
  briefH.title = t('wipeboard.brief_title', 'Show / hide the brief');
  const brief = document.createElement('textarea');
  brief.rows = 3;
  brief.placeholder = t('wipeboard.brief_placeholder', 'what this wipeboard is for, and what is to be discussed');
  brief.spellcheck = false;
  const briefField = field(brief, { label: t('wipeboard.brief_label', 'wipeboard brief') });
  briefWrap.append(briefH, briefField.el);
  // On a phone the brief starts collapsed — the thread is what you came for, and the
  // keyboard eats half the screen. Desktop keeps it open, exactly as before.
  if (IS_TOUCH) briefWrap.classList.add('shut');
  briefH.addEventListener('click', () => briefWrap.classList.toggle('shut'));
  brief.addEventListener('input', () => {
    briefDirty = true;
  });
  brief.addEventListener('blur', async () => {
    if (!name || !briefDirty) return;
    const r = await request('/api/wipeboards/' + encodeURIComponent(name) + '/brief', {
      method: 'PUT',
      json: { brief: brief.value },
    });
    if (!r.ok) {
      // The text stays, the flag stays dirty, and the failure is IN the thread area:
      // a brief that silently never landed is the wipeboard lying to its members.
      briefDirty = true;
      empty('brief not saved — ' + r.message + ' (your text is still in the box)');
      return;
    }
    briefDirty = false;
    mtime = 0; // force a re-read so the tile shows what actually landed
  });

  // -- members: chips. On a CUSTOM wipeboard, × and a picker — add and remove are
  // equal citizens, an explicit ask. On a TEAM wipeboard, neither: membership is the
  // team's, and the row says where it is edited instead of pretending to edit it.
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
  say.placeholder = t('wipeboard.say_placeholder', 'say something to everyone on this wipeboard');
  say.spellcheck = false;
  const sayField = field(say, { label: t('wipeboard.say_label', 'post to this wipeboard') });
  const post = document.createElement('button');
  post.textContent = t('team_wipeboard.post', 'Post');
  composeRow.append(sayField.el, post);
  boardWrap.append(head, briefWrap, memRow, thread, composeRow);
  root.append(listWrap, boardWrap);

  const empty = (msg) => {
    thread.innerHTML = '';
    const e = document.createElement('div');
    e.className = 'wb-empty';
    e.textContent = msg;
    thread.appendChild(e);
  };

  /* ---------- listing render ---------- */

  // One block per team, roster-style: the heading is the door. Sessions come off
  // S.sessions tags — the same truth the roster draws, so the two can never disagree.
  const teamBlock = (team, members) => {
    const block = document.createElement('div');
    block.className = 'home-group';
    const h = document.createElement('button');
    h.type = 'button';
    h.className = 'home-grp wb-door';
    h.title = t('wipeboard.open_team', "Open the {team} team's wipeboard", { team: team.name });
    h.append(
      Object.assign(document.createElement('b'), { textContent: team.name }),
      Object.assign(document.createElement('span'), { textContent: String(members.length) }),
    );
    h.addEventListener('click', () => open(team.name, 'team'));
    block.appendChild(h);
    for (const s of members) {
      const row = document.createElement('div');
      row.className = 'wb-sess';
      row.textContent = s.name;
      block.appendChild(row);
    }
    return block;
  };

  const renderList = async () => {
    const r = await request('/api/wipeboards', { cache: 'no-store' });
    if (!r.ok) return; // network blips ride the poll; the listing stays
    const boards = r.data.boards || [];
    const teams = boards.filter((b) => b.kind === 'team');
    const customs = boards.filter((b) => b.kind !== 'team');
    const bySess = (tag) => S.sessions.filter((s) => (s.tags || []).includes(tag));
    const sig = JSON.stringify([boards, S.sessions.map((s) => [s.name, s.tags])]);
    if (sig === listSig) return; // nothing moved — leave the DOM (and any tap) alone
    listSig = sig;
    listWrap.innerHTML = '';
    for (const tm of teams) listWrap.appendChild(teamBlock(tm, bySess(tm.name)));
    if (!teams.length) {
      const e = document.createElement('div');
      e.className = 'wb-empty';
      e.textContent =
        'no teams yet — tag sessions in the ⌂ Roster and each team gets its own wipeboard';
      listWrap.appendChild(e);
    }
    // Custom wipeboards: the secondary path, capability whole. house lives here too.
    const cWrap = document.createElement('div');
    cWrap.className = 'home-group wb-customs';
    const ch = document.createElement('div');
    ch.className = 'home-grp';
    ch.append(
      Object.assign(document.createElement('b'), { textContent: 'custom wipeboards' }),
      Object.assign(document.createElement('span'), { textContent: String(customs.length) }),
    );
    cWrap.appendChild(ch);
    for (const b of customs) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'wb-sess wb-door';
      row.textContent = `${b.name} (${b.members})`;
      row.title = t('wipeboard.open_custom', 'Open the custom wipeboard "{name}"', { name: b.name });
      row.addEventListener('click', () => open(b.name, 'custom'));
      cWrap.appendChild(row);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'wb-add';
    add.textContent = t('wipeboard.add', '＋ wipeboard');
    add.title = t('wipeboard.add_title', 'Start a custom wipeboard — a team already has one automatically');
    add.addEventListener('click', async () => {
      const raw = prompt(t('wipeboard.add_prompt', 'Name the wipeboard (letters, digits, - _):'));
      if (raw == null) return;
      const n = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!n) return;
      const r2 = await request('/api/wipeboards', { method: 'POST', json: { name: n } });
      if (!r2.ok) {
        listSig = '';
        alert('could not start a wipeboard — ' + r2.message);
        return;
      }
      open(n, 'custom');
    });
    cWrap.appendChild(add);
    listWrap.appendChild(cWrap);
  };

  /* ---------- open-wipeboard render ---------- */

  const renderMembers = (members) => {
    // Rebuild ONLY when membership actually changed. refresh() runs every 2s, and this
    // row can hold a native <select>; blowing it away mid-poll closed the picker the
    // instant the owner opened it. Membership is not in the file, so the mtime guard
    // does not cover it; this is its own.
    const sig = kind + ':' + members.map((m) => `${m.name}:${m.control}`).join(',');
    if (sig === memSig) return;
    memSig = sig;
    memRow.innerHTML = '';
    for (const m of members) {
      const chip = document.createElement('span');
      chip.className = 'wb-chip';
      chip.append(Object.assign(document.createElement('b'), { textContent: m.name }));
      // The dial travels with the member: a 👁/👤 session is ON the wipeboard but was
      // never typed into, and the chip is where you see that without opening it.
      if (m.control !== 'write') {
        chip.append(
          Object.assign(document.createElement('i'), {
            textContent: m.control === 'user' ? '👤' : '👁',
            title: t('wipeboard.not_notified', 'On the wipeboard, but not notified — its dial is not 🤖'),
          }),
        );
      }
      if (kind === 'custom') {
        const x = document.createElement('button');
        x.textContent = '×';
        x.title = t('wipeboard.remove_member', 'Remove {name} from this wipeboard', { name: m.name });
        x.addEventListener('click', async () => {
          x.disabled = true;
          const r = await request(
            '/api/wipeboards/' + encodeURIComponent(name) + '/members/' + encodeURIComponent(m.name),
            { method: 'DELETE' },
          );
          if (!r.ok) {
            empty('could not remove ' + m.name + ' — ' + r.message);
            x.disabled = false;
            return;
          }
          mtime = 0;
          await refresh();
        });
        chip.appendChild(x);
      }
      memRow.appendChild(chip);
    }
    if (kind === 'team') {
      // No picker and no ×: the one line says where membership IS edited, so the
      // absence reads as the design rather than as a missing control.
      memRow.appendChild(
        Object.assign(document.createElement('span'), {
          className: 'wb-follow',
          textContent: t('wipeboard.membership_follows', 'membership follows the team — tag sessions in the ⌂ Roster'),
        }),
      );
      return;
    }
    // The picker: teams first (a set in one pick — a COPY of its membership now,
    // which is the one place that copy is legitimate), then individual sessions.
    const on = new Set(members.map((m) => m.name));
    const plus = document.createElement('select');
    plus.className = 'wb-plus';
    plus.add(new Option(t('wipeboard.add_member', '＋ add…'), ''));
    const teams = [...new Set(S.sessions.flatMap((s) => s.tags || []))].sort();
    for (const g of teams) plus.add(new Option(t('wipeboard.team_option', '+{team} (team)', { team: g }), 'g:' + g));
    for (const s of S.sessions) if (!on.has(s.name)) plus.add(new Option('@' + s.name, 's:' + s.name));
    plus.addEventListener('change', async () => {
      const v = plus.value;
      if (!v || !name) return;
      plus.disabled = true;
      const r = await request('/api/wipeboards/' + encodeURIComponent(name) + '/members', {
        method: 'POST',
        json: v.startsWith('g:') ? { team: v.slice(2) } : { session: v.slice(2) },
      });
      if (!r.ok) {
        empty('could not add — ' + r.message);
      } else {
        // Say plainly who was told and who wasn't — a silently-unnotified member is
        // exactly the confusion this wipeboard exists to remove. The thread area
        // carries it; the next refresh replaces it with the thread.
        const quiet = Object.entries(r.data.results || {}).filter(([, v2]) => !/^notified$/.test(v2));
        if (quiet.length) empty(quiet.map(([k, v2]) => `${k}: ${v2}`).join(' · '));
        mtime = 0;
        await refresh();
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
      // system line for a membership change. A steer must never read as an agent's post.
      const k = p.author === 'system' ? 'sys' : p.author.startsWith('@') ? 'agent' : 'owner';
      d.className = 'wb-post ' + k;
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
    const r = await request('/api/wipeboards/' + encodeURIComponent(name), { cache: 'no-store' });
    if (!r.ok) {
      // Network blips ride the 2s poll — the thread stays; a real answer that says
      // "no" replaces it, exactly as before.
      if (r.kind !== 'network') empty(r.message || 'could not read this wipeboard');
      return;
    }
    kind = r.data.kind === 'team' ? 'team' : 'custom';
    kindNote.textContent = kind === 'team' ? 'team wipeboard' : 'custom wipeboard';
    renderMembers(r.data.members || []);
    if (r.data.mtime === mtime) return; // file hasn't moved — leave the DOM (and any selection) alone
    mtime = r.data.mtime;
    if (!briefDirty) brief.value = r.data.brief || '';
    renderThread(r.data.posts || []);
  };

  const open = (n, k) => {
    name = n;
    kind = k;
    mtime = 0;
    memSig = ''; // a different wipeboard — the row must rebuild even if the names match
    briefDirty = false;
    brief.value = '';
    memRow.innerHTML = '';
    title.textContent = n;
    listWrap.hidden = true;
    boardWrap.hidden = false;
    empty('reading…');
    void refresh();
  };

  back.addEventListener('click', () => {
    name = null;
    listSig = '';
    boardWrap.hidden = true;
    listWrap.hidden = false;
    void renderList();
  });

  const sendPost = async () => {
    const text = say.value.trim();
    if (!text || !name) return;
    post.disabled = true;
    const r = await request('/api/wipeboards/' + encodeURIComponent(name) + '/post', {
      method: 'POST',
      json: { text },
    });
    if (!r.ok) {
      // The words stay in the box — a failed post must never cost the post.
      empty('could not post — ' + r.message + ' (your text is still in the box)');
    } else {
      say.value = '';
      mtime = 0;
      await refresh();
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
    if (!isShowing()) return;
    void (name ? refresh() : renderList());
  }, 2000);

  return {
    enter() {
      void (name ? refresh() : renderList());
    },
  };
}

/* ---------- tile ---------- */
