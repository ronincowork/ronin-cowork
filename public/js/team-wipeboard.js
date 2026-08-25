/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TEAM'S WIPEBOARD SLICE — the thread, and nothing else.
 *
 * "When you open the whiteboard for a team page, it should just be the whiteboard"
 * (owner, 2026-08-23): no Brief (that is Team Configuration's), no board picker — the
 * board is ASSUMED, resolved from the team's roster by the caller. The server creates
 * the board on open (owner, 2026-08-24), so this slice never meets a missing one: an
 * empty thread is the conversation that has not started yet, said in one quiet line.
 *
 * A wipeboard is a transport, not a record: every post lives its 48 hours — whoever
 * has read it — then clears (owner, 2026-08-25: TTL only, so the board never looks
 * empty to the one person who has not read it yet, and scroll-back works). The thread
 * view says so instead of letting a shortening conversation read as data loss.
 *
 * The owner's compose row posts loud — every member is interrupted ("all agents should
 * see that", owner 2026-08-23). The agents' quiet default lives in the CLI, not here.
 *
 * Channel-service contract (team-view.js): { el, mount, enter, leave, destroy }. This
 * slice polls only while entered, and stops the moment it is left.
 */
import { request } from './request.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

export function createTeamWipeboard() {
  const root = el('div', 'twb');
  let board = ''; // the roster's wipeboard id — set on enter, '' means no team resolved
  let newest = ''; // newest post id rendered — polls ask only for what is after it
  let entered = false;
  let timer = 0;
  let inFlight = false; // one request at a time: overlapping polls re-rendered the whole
  // thread on every response and yanked the scroll — the 2026-08-25 "can't scroll" bug

  const thread = el('div', 'twb-thread');
  const note = el('p', 'tw-note');
  note.hidden = true;

  // -- the owner's line: a box and a button; a failed post never costs the words --
  const composeRow = el('div', 'twb-compose');
  const say = document.createElement('textarea');
  say.rows = 2;
  say.placeholder = 'say something to the team — every member is interrupted';
  say.spellcheck = false;
  const post = el('button', null, 'Post');
  composeRow.append(say, post);
  root.append(note, thread, composeRow);

  const quiet = (text) => {
    note.textContent = text;
    note.hidden = !text;
  };

  const postNode = (p) => {
    const d = el('div', 'twb-post' + (p.author.startsWith('user:') ? ' owner' : p.author === 'system' ? ' system' : ''));
    const aim = p.silent ? ' → (no notice)' : p.to?.length ? ` → ${p.to.join(', ')}` : '';
    d.append(el('div', 'twb-head', `${p.author}${aim} · ${p.at}`), el('div', 'twb-text', p.text));
    return d;
  };

  /**
   * PINNED TO THE BOTTOM IS AN INTENT, not a moment. The reader is pinned until they
   * scroll up; while pinned, the view holds the freshest post — through new posts,
   * resizes, AND the tab becoming visible. That last one is the bug this shape fixes:
   * the board loads while hidden behind the Chat tab (the landing tab, owner's ruling),
   * and scrolling a hidden element does nothing — so the owner opened the tab pegged to
   * the top (2026-08-25, twice). A ResizeObserver re-applies the intent the moment the
   * panel gains real dimensions. Scrolling up releases the pin; returning near the
   * bottom re-engages it; the reader's own post always re-pins.
   */
  let wantBottom = true;
  const pinnedToBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 48;
  const snap = () => { thread.scrollTop = thread.scrollHeight; };
  const maybeScroll = (force) => {
    if (force) wantBottom = true;
    if (wantBottom) snap();
  };
  thread.addEventListener('scroll', () => {
    if (thread.clientHeight > 0) wantBottom = pinnedToBottom();
  });
  const ro = new ResizeObserver(() => {
    if (wantBottom && thread.clientHeight > 0) snap();
  });
  ro.observe(thread);

  const renderThread = (posts, cleared) => {
    thread.replaceChildren();
    if (cleared) thread.append(el('p', 'twb-cleared', '… earlier posts have cleared'));
    for (const p of posts) thread.append(postNode(p));
    if (!posts.length) quiet('Nothing on the board right now — posts clear after 48 hours.');
    else quiet('');
  };

  const refresh = async (force = false) => {
    if (!entered || !board || inFlight) return;
    inFlight = true;
    try {
      // FIRST LOAD IS THE WHOLE PAGE; EVERY POLL IS A DELTA. Asking for the full thread
      // every two seconds re-rendered a hundred posts a poll; asking for what is after
      // `newest` returns nothing at all in the quiet case.
      const url = newest
        ? `/api/wipeboards/${encodeURIComponent(board)}?since=${encodeURIComponent(newest)}`
        : `/api/wipeboards/${encodeURIComponent(board)}?limit=100`;
      const r = await request(url);
      if (!entered) return;
      if (!r.ok) {
        // Network blips ride the poll; a standing failure is said in place of the thread.
        if (!thread.childElementCount) quiet(`Could not read the board — ${r.message}`);
        return;
      }
      const posts = r.data.posts || [];
      if (!newest) {
        newest = r.data.newest || '';
        renderThread(posts, Boolean(r.data.more));
        maybeScroll(true);
      } else if (posts.length) {
        for (const p of posts) thread.append(postNode(p));
        newest = r.data.newest || newest;
        quiet('');
        maybeScroll(force);
      }
    } finally {
      inFlight = false;
    }
  };

  const sendPost = async () => {
    const text = say.value.trim();
    if (!text || !board) return;
    post.disabled = true;
    const r = await request(`/api/wipeboards/${encodeURIComponent(board)}/post`, { method: 'POST', json: { text } });
    post.disabled = false;
    if (!r.ok) {
      // The words stay in the box — a post that silently never landed is the board lying.
      quiet(`Could not post — ${r.message} (your text is still in the box)`);
      return;
    }
    say.value = '';
    void refresh(true); // a delta fetch picks the post up, and your own post may scroll
  };
  post.addEventListener('click', sendPost);
  say.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendPost();
  });

  return {
    el: root,
    mount: () => {},
    /** The caller resolves the board id off the roster and re-enters when it changes. */
    setBoard: (id) => {
      if (id === board) return;
      board = id || '';
      newest = '';
      thread.replaceChildren();
      quiet(board ? '' : 'No Team resolved — nothing to read.');
      if (entered && board) void refresh();
    },
    enter: () => {
      entered = true;
      wantBottom = true; // every entry starts at the freshest post
      if (board) void refresh();
      timer = window.setInterval(() => void refresh(), 2000);
    },
    leave: () => {
      entered = false;
      window.clearInterval(timer);
      timer = 0;
    },
    destroy: () => {
      entered = false;
      window.clearInterval(timer);
      timer = 0;
      ro.disconnect();
    },
  };
}
