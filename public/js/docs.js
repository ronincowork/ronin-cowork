/* part of the tmux-ronin client — see js/README.md */
import { request } from './request.js';
import { status } from './ui.js';
import { homeData } from './home.js';

/**
 * MDEDIT — the ▧ Docs tab: every session's listed docs, and a plain editor for one.
 *
 * Two states in one pane. The LIST is grouped by session and comes free with the
 * `/api/home` poll the roster already runs, so this tab fetches nothing of its own. The
 * EDITOR is a textarea over one file — no markdown rendering, no preview, no highlighting.
 *
 * THERE IS DELIBERATELY NO FILE BROWSER. The owner's rule: *"I don't want someone to build
 * that explorer piece."* A doc reaches this list because an agent ran
 * `write_tegami --doc <path>`, and a doc nobody listed is reached by asking the agent to
 * list it. That is the whole finding mechanism. See docs/mdedit.md.
 */
export function buildDocs(tile, root, isShowing) {
  let openPath = null; // null = the list is showing
  let dirty = false; // the owner has typed since the last load or save
  let sig = ''; // only rebuild the list when it actually changed — see refresh()

  /* ---------- the list ---------- */
  const list = document.createElement('div');
  list.className = 'dc-list';

  /* ---------- the editor ---------- */
  const ed = document.createElement('div');
  ed.className = 'dc-ed';
  const bar = document.createElement('div');
  bar.className = 'dc-bar';
  const back = document.createElement('button');
  back.className = 'dc-back';
  back.textContent = '←';
  back.title = 'Back to the list';
  const title = document.createElement('b');
  const note = status('dc-note');
  const save = document.createElement('button');
  save.className = 'dc-save';
  save.textContent = 'Save';
  bar.append(back, title, note.el, save);
  const area = document.createElement('textarea');
  area.className = 'dc-text';
  area.spellcheck = false;
  // A document is not prose-in-a-comment-box: wrapping is right, but autocorrect and
  // capitalisation on touch would quietly rewrite markdown as you type.
  area.autocapitalize = 'off';
  area.autocomplete = 'off';
  area.setAttribute('autocorrect', 'off');
  ed.append(bar, area);
  root.append(list, ed);

  const show = (which) => {
    root.dataset.view = which;
  };
  show('list');

  const say = (text, bad) => note.say(text, bad ? 'bad' : '');

  /* ---------- opening and saving ---------- */

  const open = async (path) => {
    openPath = path;
    title.textContent = path.split('/').pop();
    title.title = path;
    area.value = '';
    area.disabled = true;
    dirty = false;
    say('loading…');
    show('edit');
    const r = await request('/api/file?path=' + encodeURIComponent(path), { cache: 'no-store' });
    if (!r.ok) {
      // Never leave an enabled, empty box over a path that failed to load: a Save from
      // there would write emptiness over the file.
      say(r.message, true);
      return;
    }
    area.value = r.data.text ?? '';
    area.disabled = false;
    dirty = false;
    say('');
  };

  const doSave = async () => {
    if (!openPath || area.disabled) return;
    save.disabled = true;
    say('saving…');
    // text/plain on purpose — see the route in src/index.ts. The global json parser
    // has a 100kb limit and would refuse a large document before it ever arrived.
    const r = await request('/api/file?path=' + encodeURIComponent(openPath), {
      method: 'PUT',
      text: area.value,
    });
    if (!r.ok) say(r.message, true);
    else {
      dirty = false;
      say('saved');
    }
    save.disabled = false;
  };

  area.addEventListener('input', () => {
    dirty = true;
    say('');
  });
  save.addEventListener('click', doSave);
  // ⌘S / Ctrl+S saves. The browser's own save-page dialog over a text editor is never
  // what anyone meant.
  area.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      doSave();
    }
  });
  back.addEventListener('click', () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    openPath = null;
    dirty = false;
    show('list');
    refresh();
  });

  /* ---------- the list ---------- */

  const empty = (msg) => {
    list.innerHTML = '';
    const e = document.createElement('div');
    e.className = 'dc-empty';
    e.textContent = msg;
    list.appendChild(e);
  };

  const render = (rows) => {
    list.innerHTML = '';
    if (!rows.length) {
      empty('No session has listed a doc yet. An agent lists one with: write_tegami --doc <path>');
      return;
    }
    for (const s of rows) {
      const h = document.createElement('div');
      h.className = 'dc-who';
      h.append(
        Object.assign(document.createElement('b'), { textContent: s.name }),
        Object.assign(document.createElement('span'), {
          textContent: s.docs.length === 1 ? '1 doc' : `${s.docs.length} docs`,
        }),
      );
      list.appendChild(h);
      for (const p of s.docs) {
        const parts = p.split('/');
        const b = document.createElement('button');
        b.className = 'dc-row';
        b.title = p;
        b.append(
          Object.assign(document.createElement('b'), { textContent: parts.pop() }),
          // The last two directories, so two files called HOW_TO.md are told apart
          // without printing an absolute path on a phone-width row.
          Object.assign(document.createElement('span'), { textContent: parts.slice(-2).join('/') }),
        );
        b.addEventListener('click', () => open(p));
        list.appendChild(b);
      }
    }
  };

  /**
   * Read the doc lists out of the roster data. No fetch: `/api/home` already carries every
   * session's letter (that is what the ladder chip renders from), so the list is free.
   *
   * Rebuilt only when it actually changed. This runs every two seconds and the rows are
   * buttons — blowing them away mid-click is the bug the wipeboard's member row already
   * paid for once.
   */
  const refresh = () => {
    if (openPath) return; // the editor is up; the list underneath can wait
    const rows = (homeData || [])
      .filter((s) => s.tegami && (s.tegami.docs || []).length)
      .map((s) => ({ name: s.name, docs: s.tegami.docs }));
    const next = rows.map((s) => s.name + ':' + s.docs.join('|')).join('\n');
    if (next === sig) return;
    sig = next;
    render(rows);
  };

  // Poll only while this pane is actually on screen; a tile on another tab costs nothing.
  setInterval(() => {
    if (isShowing()) refresh();
  }, 2000);

  empty('loading…');
  return {
    enter() {
      sig = ''; // returning to the tab always redraws, however stale the signature
      refresh();
    },
  };
}
