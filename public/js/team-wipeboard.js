/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { subscribe } from './store.js';
import { t } from './lexicon.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

export function createTeamWipeboard() {
  const root = el('div', 'twb');
  let board = ''; // the roster's wipeboard id — set on enter, '' means no team resolved
  let entered = false;
  let stop = null; // the store subscription, while entered on a board

  const thread = el('div', 'twb-thread');
  const note = el('p', 'tw-note');
  note.hidden = true;

  // -- the owner's line: a box and a button; a failed post never costs the words --
  const composeRow = el('div', 'twb-compose');
  const say = document.createElement('textarea');
  say.classList.add('wk-field-control');
  say.rows = 2;
  say.placeholder = t('team_wipeboard.placeholder', 'say something to the team — every member is interrupted');
  say.spellcheck = false;
  const post = el('button', null, t('team_wipeboard.post', 'Post'));
  composeRow.append(say, post);
  root.append(note, thread, composeRow);

  const quiet = (text) => {
    note.textContent = text;
    note.hidden = !text;
  };

  const postNode = (p) => {
    const d = el('div', 'twb-post' + (p.author.startsWith('user:') ? ' owner' : p.author === 'system' ? ' system' : ''));
    const aim = p.silent ? ' ' + t('team_wipeboard.no_notice', '→ (no notice)') : p.to?.length ? ` → ${p.to.join(', ')}` : '';
    d.append(el('div', 'twb-head', `${p.author}${aim} · ${p.at}`), el('div', 'twb-text', p.text));
    return d;
  };

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
    if (cleared) thread.append(el('p', 'twb-cleared', t('team_wipeboard.cleared', '… earlier posts have cleared')));
    for (const p of posts) thread.append(postNode(p));
    if (!posts.length) quiet(t('team_wipeboard.empty', 'Nothing on the board right now — posts clear after 48 hours.'));
    else quiet('');
  };

  // The thread is the store's `wipeboard:<board>`: the server sends it whole when this
  // opens and again on every post, so each paint is the whole thread.
  const watch = () => {
    stop?.();
    stop = entered && board
      ? subscribe(`wipeboard:${board}`, ({ posts, more }) => { renderThread(posts, more); maybeScroll(false); })
      : null;
  };

  const sendPost = async () => {
    const text = say.value.trim();
    if (!text || !board) return;
    post.disabled = true;
    const r = await request(`/api/wipeboards/${encodeURIComponent(board)}/post`, { method: 'POST', json: { text } });
    post.disabled = false;
    if (!r.ok) {
      // The words stay in the box — a post that silently never landed is the board lying.
      quiet(t('team_wipeboard.post_failed', 'Could not post — {message} (your text is still in the box)', { message: r.message }));
      return;
    }
    say.value = '';
    wantBottom = true; // your own post, arriving by push, scrolls into view
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
      thread.replaceChildren();
      quiet(board ? '' : t('team_wipeboard.no_team', 'No Team resolved — nothing to read.'));
      watch();
    },
    enter: () => {
      entered = true;
      wantBottom = true; // every entry starts at the freshest post
      watch();
    },
    leave: () => {
      entered = false;
      watch();
    },
    destroy: () => {
      entered = false;
      watch();
      ro.disconnect();
    },
  };
}
