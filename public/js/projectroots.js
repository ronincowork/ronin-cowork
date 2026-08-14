/* part of the tmux-ronin client — see js/README.md */
import { loadProjects } from './home.js';

/* ---------- PROJECT ROOT — the fourth commons pane (tab: ▣ Project root) ----------
 *
 * "Which directories on this machine are part of my Ronin?" — the inclusion_list,
 * with a block per project_root. Two verbs and nothing clever: INCLUDE a directory,
 * EXCLUDE one. See docs/project-roots.md.
 *
 * The catalog (ronin_catalogs/PROJECT_ROOTS.md) stays the source of truth and stays
 * hand-editable — this pane is a co-editor, not an owner. It writes only the owner's
 * INTENT (which directories, what they are called); everything volatile beside it —
 * does the directory still exist, is it a project_repo, how many sessions serve it —
 * is read live from /api/project-roots/detail and stored nowhere.
 */
export function buildProjectRoots(root, isShowing) {
  let data = null; // { roots: [...], untagged: n }
  let editing = null; // handle of the block whose form is open

  const head = document.createElement('div');
  head.className = 'pr-head';
  const count = document.createElement('span');
  count.className = 'pr-count';
  const addBtn = document.createElement('button');
  addBtn.textContent = '＋ include';
  addBtn.title = 'Add a directory to your Ronin';
  head.append(count, addBtn);

  const list = document.createElement('div');
  list.className = 'pr-list';
  root.append(head, list);

  const say = (msg, bad) => {
    list.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'pr-empty' + (bad ? ' bad' : '');
    p.textContent = msg;
    list.appendChild(p);
  };

  const call = async (url, opts) => {
    const r = await fetch(url, opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || r.statusText);
    return d;
  };

  async function refresh() {
    try {
      data = await call('/api/project-roots/detail', { cache: 'no-store' });
    } catch (e) {
      say('could not read the catalog — ' + e.message, true);
      return;
    }
    render();
  }

  /* -- the include / edit form. Same shape for both: a new block is an edit of one
   * that does not exist yet, so there is one form to get right, not two. -- */
  function form(existing) {
    const f = document.createElement('div');
    f.className = 'pr-form';
    const mk = (label, key, value, hint, ph) => {
      const wrap = document.createElement('label');
      wrap.className = 'pr-f';
      const l = document.createElement('span');
      l.textContent = label;
      l.title = hint;
      const i = document.createElement('input');
      i.type = 'text';
      i.value = value || '';
      i.placeholder = ph || '';
      i.autocapitalize = 'off';
      i.autocomplete = 'off';
      i.spellcheck = false;
      i.dataset.key = key;
      wrap.append(l, i);
      f.appendChild(wrap);
      return i;
    };
    const handle = mk('handle', 'name', existing?.name, 'The short name — this IS the shortcut', 'ronin');
    if (existing) handle.disabled = true; // renaming is a catalog edit, not a form field
    mk('directory', 'dir', existing?.dir, 'Any absolute path, at any depth', '~/work/api');
    mk('remit', 'remit', existing?.remit, 'The one line you pick it from in a list', 'what this is');
    mk('read first', 'read', (existing?.read || []).join(', '), 'What a fresh agent reads before anything else', 'comma separated');
    mk('match', 'match', (existing?.match || []).join(', '), 'Words that suggest this project_root from free-form intent', 'comma separated');

    const row = document.createElement('div');
    row.className = 'pr-frow';
    const save = document.createElement('button');
    save.textContent = existing ? 'save' : 'include';
    const cancel = document.createElement('button');
    cancel.className = 'pr-ghost';
    cancel.textContent = 'cancel';
    const err = document.createElement('span');
    err.className = 'pr-err';
    row.append(save, cancel, err);
    f.appendChild(row);

    cancel.addEventListener('click', () => {
      editing = null;
      render();
    });
    save.addEventListener('click', async () => {
      const body = {};
      f.querySelectorAll('input[data-key]').forEach((i) => {
        body[i.dataset.key] = i.value.trim();
      });
      const name = existing ? existing.name : (body.name || '').toLowerCase();
      delete body.name;
      save.disabled = true;
      err.textContent = '';
      try {
        if (existing) {
          await call('/api/project-roots/' + encodeURIComponent(name), {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
        } else {
          await call('/api/project-roots', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, ...body }),
          });
        }
        editing = null;
        await loadProjects(); // the launcher's picker reads the same catalog
        await refresh();
      } catch (e) {
        err.textContent = e.message;
        save.disabled = false;
      }
    });
    return f;
  }

  function block(r) {
    const b = document.createElement('div');
    b.className = 'pr-block';
    if (!r.facts?.exists) b.classList.add('gone');

    const top = document.createElement('div');
    top.className = 'pr-top';
    const h = document.createElement('b');
    h.textContent = r.name; // the ## heading IS the handle — no second name
    const dir = document.createElement('span');
    dir.className = 'pr-dir';
    dir.textContent = r.dir;
    top.append(h, dir);

    const facts = document.createElement('div');
    facts.className = 'pr-facts';
    const chip = (text, cls, title) => {
      const c = document.createElement('span');
      c.className = 'pr-chip' + (cls ? ' ' + cls : '');
      c.textContent = text;
      if (title) c.title = title;
      facts.appendChild(c);
    };
    if (!r.facts?.exists) {
      // The one maintenance job that arrives on its own: a directory moved or deleted
      // out from under the catalog. Flagged, never auto-removed.
      chip('directory is gone', 'bad', 'Nothing on disk at this path — fix the path or exclude it');
    } else if (r.facts.repo) {
      const remote = (r.facts.repo.remote || '').replace(/^.*[/:]([^/]+\/[^/]+?)(\.git)?$/, '$1');
      chip(remote || 'repo, no remote', '', r.facts.repo.remote || 'A git repo with no origin');
      if (r.facts.repo.branch) chip('⑂ ' + r.facts.repo.branch);
    } else {
      // A project_root need not be a project_repo. `~/lab` is one; this is a
      // legal shape, not a warning.
      chip('no repo', 'muted', 'Not a git repo — legal, a project_root need not be one');
    }
    if (r.sessions) chip(r.sessions + (r.sessions === 1 ? ' session' : ' sessions'), 'muted');
    if (r.remit) {
      const rem = document.createElement('div');
      rem.className = 'pr-remit';
      rem.textContent = r.remit;
      b.appendChild(rem);
    }

    const acts = document.createElement('div');
    acts.className = 'pr-acts';
    const edit = document.createElement('button');
    edit.textContent = 'edit';
    edit.addEventListener('click', () => {
      editing = editing === r.name ? null : r.name;
      render();
    });
    const drop = document.createElement('button');
    drop.className = 'pr-ghost';
    drop.textContent = 'exclude';
    drop.title = 'Remove it from the catalog. Nothing on disk is touched.';
    drop.addEventListener('click', async () => {
      if (!confirm(`Exclude "${r.name}" from your Ronin?\n\nThe catalog entry goes. ${r.dir} is not touched.`)) return;
      drop.disabled = true;
      try {
        await call('/api/project-roots/' + encodeURIComponent(r.name), { method: 'DELETE' });
        await loadProjects();
        await refresh();
      } catch (e) {
        alert('Could not exclude it:\n' + e.message);
        drop.disabled = false;
      }
    });
    acts.append(edit, drop);

    b.prepend(top);
    b.append(facts, acts);
    if (editing === r.name) b.appendChild(form(r));
    return b;
  }

  function render() {
    if (!data) return;
    list.innerHTML = '';
    count.textContent =
      data.roots.length + (data.roots.length === 1 ? ' project_root' : ' project_roots') +
      (data.untagged ? ` · ${data.untagged} untagged session${data.untagged === 1 ? '' : 's'}` : '');
    if (editing === '\x00new') list.appendChild(form(null));
    if (!data.roots.length && editing !== '\x00new') {
      say('nothing included yet — ＋ include points Ronin at a directory');
      return;
    }
    for (const r of data.roots) list.appendChild(block(r));
  }

  addBtn.addEventListener('click', () => {
    editing = editing === '\x00new' ? null : '\x00new';
    render();
  });

  // Only while the pane is actually on screen — a tile on another tab costs nothing.
  // Slow on purpose: the catalog changes when the owner changes it, and each poll
  // shells out to git once per project_root.
  setInterval(() => {
    if (isShowing() && !editing) void refresh();
  }, 15000);

  say('loading…');
  return {
    enter() {
      void refresh();
    },
  };
}
