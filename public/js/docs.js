/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { status } from './ui.js';
import { homeData } from './home.js';
import { t } from './lexicon.js';
import { DOC_MIME } from './team-drag.js';

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
 *
 * THE EDITOR HAS A SECOND DOOR SINCE 2026-08-18 — 📄 on a tile header opens ONE of that
 * session's docs straight into it (`js/tiledocs.js` → `commons.js` `openDoc` → `open`
 * below). It narrows this list to the session the tile is already showing; it enumerates
 * nothing this pane does not, and the rule above is untouched — the caller has to hold a
 * path that an agent already listed. Read that file before re-litigating this one.
 *
 * THE TEAM PAGE IS A THIRD DOOR SINCE 2026-08-25 — its Docs channel service mounts this
 * same pane (`js/team-view.js`) over the same `homeData`, narrowed by `only` to the
 * roster's members. One list mechanism, one editor, one rule; a Team never grows its own.
 *
 * @param only  optional predicate on a session name — keep it in the list, or not. Absent,
 *              every session that listed a doc is shown (the Commons).
 */
export function buildDocs(tile, root, isShowing, only = null) {
  let openPath = null; // null = the list is showing
  let dirty = false; // the owner has typed since the last load or save
  // Only rebuild the list when it actually changed — see refresh(). null, not '', so the
  // first read always draws: an empty roster signs as '' and would otherwise leave
  // 'loading…' standing over a list that is legitimately empty.
  let sig = null;

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
  back.title = t('docs.back_title', 'Back to the list');
  const title = document.createElement('b');
  const note = status('dc-note');
  const save = document.createElement('button');
  save.className = 'dc-save';
  save.textContent = t('docs.save', 'Save');
  // THE ↗ AND THE FRAME ARE THE HTML HALF OF THE EDITOR (owner, 2026-08-26): a listed
  // `.html` is a page, not prose, so it renders in a frame where the textarea would be,
  // and ↗ opens the same URL in a tab of its own. Both hang off `/raw/<path>`, which serves
  // the file as itself — see the route in src/index.ts. Which of the two shows is CSS's
  // call from `data-view` ('edit' | 'view'), the same switch the list already rides.
  const pop = document.createElement('a');
  pop.className = 'dc-open';
  pop.textContent = t('docs.open_browser', 'Open in browser ↗');
  pop.target = '_blank';
  pop.rel = 'noopener';
  bar.append(back, title, note.el, pop, save);
  const frame = document.createElement('iframe');
  frame.className = 'dc-frame';
  frame.title = t('docs.frame_title', 'document');
  const area = document.createElement('textarea');
  area.className = 'dc-text';
  area.spellcheck = false;
  // A document is not prose-in-a-comment-box: wrapping is right, but autocorrect and
  // capitalisation on touch would quietly rewrite markdown as you type.
  area.autocapitalize = 'off';
  area.autocomplete = 'off';
  area.setAttribute('autocorrect', 'off');
  ed.append(bar, frame, area);
  root.append(list, ed);
  const isPage = (p) => /\.html?$/i.test(p);
  const rawUrl = (p) => '/raw' + p.split('/').map(encodeURIComponent).join('/');

  const show = (which) => {
    root.dataset.view = which;
  };
  show('list');

  const say = (text, bad) => note.say(text, bad ? 'bad' : '');

  /* ---------- opening and saving ---------- */

  /**
   * Open one file into the editor. Returned from `buildDocs` since 2026-08-18 so a caller
   * can name a path instead of only entering the tab — 📄 on the tile header opens THIS
   * session's docs directly (`js/tiledocs.js`, `commons.js`'s `openDoc`). The list is
   * still the only thing that ENUMERATES; a caller must already hold the path, which is
   * what keeps "no file browser" true in the widened interface.
   */
  const open = async (path) => {
    // The guard ← has always had, now that ← is not the only way in. Arriving from the
    // tile can land on a doc while another is open and TYPED IN; without this, that
    // typing would go without a word. Same question, same wording, one place further out.
    if (dirty && path !== openPath && !confirm(t('docs.discard_confirm', 'Discard unsaved changes?'))) return;
    openPath = path;
    title.textContent = path.split('/').pop();
    title.title = path;
    if (isPage(path)) {
      // No text round-trip: the frame fetches the page itself, and a page has no Save —
      // an HTML edited in a textarea is a different feature, and not one anyone asked for.
      dirty = false;
      say('');
      pop.href = rawUrl(path);
      frame.src = rawUrl(path);
      show('view');
      return;
    }
    frame.src = 'about:blank'; // a page left running behind a textarea is a page nobody sees
    pop.removeAttribute('href');
    area.value = '';
    area.disabled = true;
    dirty = false;
    say(t('docs.loading', 'loading…'));
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
    say(t('docs.saving', 'saving…'));
    // text/plain on purpose — see the route in src/index.ts. The global json parser
    // has a 100kb limit and would refuse a large document before it ever arrived.
    const r = await request('/api/file?path=' + encodeURIComponent(openPath), {
      method: 'PUT',
      text: area.value,
    });
    if (!r.ok) say(r.message, true);
    else {
      dirty = false;
      say(t('docs.saved', 'saved'));
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
    if (dirty && !confirm(t('docs.discard_confirm', 'Discard unsaved changes?'))) return;
    openPath = null;
    dirty = false;
    frame.src = 'about:blank'; // stop the page's scripts; the list is what's showing now
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
      empty(only ? t('docs.empty_team', 'No session on this Team has listed a doc yet. An agent lists one with: write_tegami --doc <path>') : t('docs.empty', 'No session has listed a doc yet. An agent lists one with: write_tegami --doc <path>'));
      return;
    }
    for (const s of rows) {
      const h = document.createElement('div');
      h.className = 'dc-who';
      h.append(
        Object.assign(document.createElement('b'), { textContent: s.name }),
        Object.assign(document.createElement('span'), {
          textContent: s.docs.length === 1 ? t('docs.count_one', '1 doc') : t('docs.count_many', '{n} docs', { n: s.docs.length }),
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
        // DRAG A DOC ONTO A TILE (owner, 2026-08-28): the row carries the SHORT reference —
        // the last directory and the name, what the row shows — and the tile's composer
        // takes it the way it takes a dropped @mention (js/composer.js). Not the absolute
        // path: a reference in a message is for reading, and the agent can find the file.
        b.draggable = true;
        b.addEventListener('dragstart', (event) => {
          const short = p.split('/').slice(-2).join('/');
          event.dataTransfer.setData(DOC_MIME, short);
          event.dataTransfer.setData('text/plain', short);
          event.dataTransfer.effectAllowed = 'copy';
        });
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
    if (!homeData) return; // nothing read yet: 'loading…' is the truth, not "no docs"
    const rows = homeData
      .filter((s) => (!only || only(s.name)) && s.tegami && (s.tegami.docs || []).length)
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
      sig = null; // returning to the tab always redraws, however stale the signature
      refresh();
    },
    // ONE-DIRECTIONAL, deliberately: this pane learns nothing about tiles or headers in
    // return. It takes a path and shows it; who asked, and why, stays the caller's.
    open,
  };
}
