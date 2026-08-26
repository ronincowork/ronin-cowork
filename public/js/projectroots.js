/* part of the tmux-ronin client — see js/README.md */
import { request } from './request.js';
import { status } from './ui.js';
import { loadProjects } from './home.js';
import { askMika } from './mika.js';
import { t } from './lexicon.js';

/* ---------- PROJECT ROOT — the fourth commons pane (tab: ▣ Project root) ----------
 *
 * "Which directories on this machine are part of my Ronin?" — the inclusion_list,
 * with a block per project_root.
 *
 * ＋ INCLUDE IS NOT A FORM ANY MORE — IT HANDS THE JOB TO MIKA (owner, 2026-08-15).
 * It used to open five text fields, and only ONE of them was genuinely the owner's: the
 * handle. `dir`, `read`, `match` and `remit` are facts the machine already holds, and the
 * form asked the owner to go and look them up — on a phone, with autocapitalize off. The
 * real intent is one bit: *this directory, yes.*
 *
 * So the button opens Mika with the include job instead. She reads the directory, proposes
 * the whole block, and writes it through this same API on a yes. Making the form nicer was
 * the alternative and it was the wrong repair: the fastest form is still a form.
 *
 * The EDIT form stays. Editing a block that exists is a different, much cheaper act —
 * the fields are already filled and you are changing one of them.
 *
 * The catalog (ronin_catalogs/PROJECT_ROOTS.md) stays the source of truth and stays
 * hand-editable — this pane is a co-editor, not an owner. It writes only the owner's
 * INTENT (which directories, what they are called). What a session in this root READS at
 * birth is no longer a field here — it is the files on the root's session-boot shelf; everything volatile beside it —
 * does the directory still exist, is it a project_repo, how many sessions serve it —
 * is read live from /api/project-roots/detail and stored nowhere.
 */
export function buildProjectRoots(root, isShowing, tile) {
  let data = null; // { roots: [...], untagged: n }
  let editing = null; // handle of the block whose form is open

  const head = document.createElement('div');
  head.className = 'pr-head';
  const count = document.createElement('span');
  count.className = 'pr-count';
  const addBtn = document.createElement('button');
  addBtn.textContent = t('roots.include', '＋ include');
  addBtn.title = t('roots.include_title', 'Ask Mika to include a directory — she reads it and proposes the entry');
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

  async function refresh() {
    const r = await request('/api/project-roots/detail', { cache: 'no-store' });
    if (!r.ok) {
      say(t('roots.read_failed', 'could not read the catalog — {message}', { message: r.message }), true);
      return;
    }
    data = r.data;
    render();
  }

  /* -- the EDIT form. Only ever opened on a block that exists; including is Mika's job
   * now (see the header). -- */
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
    // The handle is shown, never edited: renaming is a catalog edit by hand, not a form
    // field. It is here because a block with no name on it is unreadable.
    mk(t('roots.f_handle', 'handle'), 'name', existing.name, t('roots.f_handle_hint', 'The short name — this IS the shortcut'), 'ronin').disabled = true;
    mk(t('roots.f_directory', 'directory'), 'dir', existing.dir, t('roots.f_directory_hint', 'Any absolute path, at any depth'), '~/work/api');
    mk(t('roots.f_remit', 'remit'), 'remit', existing.remit, t('roots.f_remit_hint', 'The one line you pick it from in a list'), t('roots.f_remit_placeholder', 'what this is'));
    mk(t('roots.f_match', 'match'), 'match', (existing.match || []).join(', '), t('roots.f_match_hint', 'Words that suggest this project_root from free-form intent'), t('roots.f_match_placeholder', 'comma separated'));

    const row = document.createElement('div');
    row.className = 'pr-frow';
    const save = document.createElement('button');
    save.textContent = t('roots.save', 'save');
    const cancel = document.createElement('button');
    cancel.className = 'pr-ghost';
    cancel.textContent = t('roots.cancel', 'cancel');
    const err = status('pr-err');
    row.append(save, cancel, err.el);
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
      delete body.name; // shown, never sent — the heading IS the handle
      save.disabled = true;
      err.say('');
      const r = await request('/api/project-roots/' + encodeURIComponent(existing.name), {
        method: 'PUT',
        json: body,
      });
      if (!r.ok) {
        err.say(r.message, 'bad');
        save.disabled = false;
        return;
      }
      editing = null;
      await loadProjects(); // the launcher's picker reads the same catalog
      await refresh();
    });
    return f;
  }

  function block(r) {
    const b = document.createElement('div');
    b.className = 'pr-block';
    if (!r.facts?.exists) b.classList.add('gone');
    if (r.archived) b.classList.add('archived');

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
    if (r.archived) {
      chip(t('roots.chip_archived', 'archived'), 'muted', t('roots.chip_archived_title', 'Off the new-session picker. Still here, and still launchable by name.'));
    }
    if (!r.facts?.exists) {
      // The one maintenance job that arrives on its own: a directory moved or deleted
      // out from under the catalog. Flagged, never auto-removed.
      chip(t('roots.chip_gone', 'directory is gone'), 'bad', t('roots.chip_gone_title', 'Nothing on disk at this path — fix the path or exclude it'));
    } else if (r.facts.repo) {
      const remote = (r.facts.repo.remote || '').replace(/^.*[/:]([^/]+\/[^/]+?)(\.git)?$/, '$1');
      chip(remote || t('roots.chip_no_remote', 'repo, no remote'), '', r.facts.repo.remote || t('roots.chip_no_remote_title', 'A git repo with no origin'));
      if (r.facts.repo.branch) chip('⑂ ' + r.facts.repo.branch);
    } else {
      // A project_root need not be a project_repo. `~/lab` is one; this is a
      // legal shape, not a warning.
      chip(t('roots.chip_no_repo', 'no repo'), 'muted', t('roots.chip_no_repo_title', 'Not a git repo — legal, a project_root need not be one'));
    }
    if (r.sessions) chip(r.sessions === 1 ? t('roots.sessions_one', '{n} session', { n: r.sessions }) : t('roots.sessions_many', '{n} sessions', { n: r.sessions }), 'muted');
    if (r.remit) {
      const rem = document.createElement('div');
      rem.className = 'pr-remit';
      rem.textContent = r.remit;
      b.appendChild(rem);
    }

    const acts = document.createElement('div');
    acts.className = 'pr-acts';
    const edit = document.createElement('button');
    edit.textContent = t('roots.edit', 'edit');
    edit.addEventListener('click', () => {
      editing = editing === r.name ? null : r.name;
      render();
    });
    const shelve = document.createElement('button');
    shelve.className = 'pr-ghost';
    shelve.textContent = r.archived ? t('roots.unarchive', 'unarchive') : t('roots.archive', 'archive');
    shelve.title = r.archived
      ? t('roots.unarchive_title', 'Put it back on the new-session picker.')
      : t('roots.archive_title', 'Take it off the new-session picker. It stays on this pane, and sessions already using it are untouched.');
    shelve.addEventListener('click', async () => {
      shelve.disabled = true;
      const res = await request('/api/project-roots/' + encodeURIComponent(r.name), {
        method: 'PUT',
        json: { archived: !r.archived },
      });
      if (!res.ok) {
        say(t('roots.archive_failed', 'could not archive it — {message}', { message: res.message }), true);
        shelve.disabled = false;
        return;
      }
      await loadProjects();
      await refresh();
    });
    const drop = document.createElement('button');
    drop.className = 'pr-ghost';
    drop.textContent = t('roots.exclude', 'exclude');
    drop.title = t('roots.exclude_title', 'Remove it from the catalog. Nothing on disk is touched.');
    drop.addEventListener('click', async () => {
      if (!confirm(t('roots.exclude_confirm', 'Exclude "{name}" from your Ronin?\n\nThe catalog entry goes. {dir} is not touched.', { name: r.name, dir: r.dir }))) return;
      drop.disabled = true;
      const res = await request('/api/project-roots/' + encodeURIComponent(r.name), { method: 'DELETE' });
      if (!res.ok) {
        // On the pane's own empty/error line, not a browser alert.
        say(t('roots.exclude_failed', 'could not exclude it — {message}', { message: res.message }), true);
        drop.disabled = false;
        return;
      }
      await loadProjects();
      await refresh();
    });
    acts.append(edit, shelve, drop);

    b.prepend(top);
    b.append(facts, acts);
    if (editing === r.name) b.appendChild(form(r));
    return b;
  }

  function render() {
    if (!data) return;
    list.innerHTML = '';
    const roots = [...data.roots].sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0));
    const archived = roots.filter((r) => r.archived).length;
    const live = roots.length - archived;
    count.textContent =
      (live === 1 ? t('roots.count_one', '{n} project_root', { n: live }) : t('roots.count_many', '{n} project_roots', { n: live })) +
      (archived ? ' · ' + t('roots.count_archived', '{n} archived', { n: archived }) : '') +
      (data.untagged ? ' · ' + (data.untagged === 1 ? t('roots.untagged_one', '{n} untagged session', { n: data.untagged }) : t('roots.untagged_many', '{n} untagged sessions', { n: data.untagged })) : '');
    if (!roots.length) {
      say(t('roots.empty', 'nothing included yet — ＋ include asks Mika to point Ronin at a directory'));
      return;
    }
    for (const r of roots) list.appendChild(block(r));
  }

  addBtn.addEventListener('click', () => {
    // Her tile replaces this pane in the same tile, which is the point: you asked to add
    // a directory and you are now talking to somebody who does that.
    if (tile) void askMika(tile, '+project_root: I want to include a directory. Ask me which one.');
  });

  // Only while the pane is actually on screen — a tile on another tab costs nothing.
  // Slow on purpose: the catalog changes when the owner changes it, and each poll
  // shells out to git once per project_root.
  setInterval(() => {
    if (isShowing() && !editing) void refresh();
  }, 15000);

  say(t('roots.loading', 'loading…'));
  return {
    enter() {
      void refresh();
    },
  };
}
