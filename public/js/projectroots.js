/* part of the tmux-ronin client — see js/README.md */
import { request } from './request.js';
import { status } from './ui.js';
import { loadProjects } from './home.js';
import { t } from './lexicon.js';
import { WorkspaceKit } from './workspace-kit.js';

export function buildProjectRoots(root, isShowing) {
  const { createAction } = WorkspaceKit.primitives;
  const NEW = '\0new'; // `editing` when the add card's form is open — no root has this handle
  let data = null; // { roots: [...], untagged: n }
  let editing = null; // handle of the block whose form is open

  const head = document.createElement('div');
  head.className = 'pr-head';
  const count = document.createElement('span');
  count.className = 'pr-count';
  head.append(count);

  const guide = document.createElement('p');
  guide.className = 'pr-guide';
  guide.textContent = t('roots.worktrees_guide', 'For Ronin Worktrees to run, both must be on: the repo needs Worktrees on, and the Agent needs Worktrees on. This page controls the repo.');

  const list = document.createElement('div');
  list.className = 'pr-list';
  root.append(head, guide, list);

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

  /* -- the form: EDIT on a block that exists, ADD inside the card at the end (`creating`),
   * where the handle is the one field typed this once. -- */
  function form(existing, creating = false) {
    const f = document.createElement('div');
    f.className = 'pr-form';
    const group = (title, description) => {
      const box = document.createElement('fieldset');
      box.className = 'pr-group';
      const legend = document.createElement('legend');
      legend.textContent = title;
      const help = document.createElement('p');
      help.className = 'pr-group-help';
      help.textContent = description;
      box.append(legend, help);
      f.appendChild(box);
      return box;
    };
    const rootFields = group(t('roots.group_root', 'Workspace folder'), t('roots.group_root_help', 'An existing directory on this machine where Agents may work.'));
    const mk = (label, key, value, hint, ph, host = rootFields) => {
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
      host.appendChild(wrap);
      return i;
    };
    // The handle is shown, never edited: renaming is a catalog edit by hand, not a form
    // field. It is here because a block with no name on it is unreadable.
    mk(t('roots.f_handle', 'handle'), 'name', existing.name, t('roots.f_handle_hint', 'The short name — this IS the shortcut'), 'ronin').disabled = !creating;
    const dirInput = mk(t('roots.f_directory', 'directory'), 'dir', existing.dir, t('roots.f_directory_hint', 'Any absolute path, at any depth'), '~/work/api');
    mk(t('roots.f_remit', 'remit'), 'remit', existing.remit, t('roots.f_remit_hint', 'The one line you pick it from in a list'), t('roots.f_remit_placeholder', 'what this is'));
    mk(t('roots.f_match', 'match'), 'match', (existing.match || []).join(', '), t('roots.f_match_hint', 'Words that suggest this workspace folder from free-form intent'), t('roots.f_match_placeholder', 'comma separated'));
    // THE DOC SHELVES (owner, 2026-08-28) — where the ▧ Docs tab's Docs and Plans pills look.
    mk(t('roots.f_docs', 'docs'), 'docs', (existing.docs || []).join(', '), t('roots.f_docs_hint', 'Where this root keeps its documentation — directories or files, relative to the directory'), 'docs, README.md');
    mk(t('roots.f_plans', 'plans'), 'plans', (existing.plans || []).join(', '), t('roots.f_plans_hint', 'Where this root keeps its build-out plans'), 'wip/buildouts, wip/handoffs');

    // Existing repositories expose the complete checked-in profile. Mode describes how
    // accepted work publishes; Worktrees is a separate, additive choice.
    let profileFields = null;
    if (creating || existing.facts?.repo) {
      const seedWorktrees = creating ? (data?.new_project_worktrees || 'enabled') : (existing.repo_profile?.worktrees || 'disabled');
      const before = {
        mode: existing.repo_profile?.mode || 'direct',
        working: existing.arrangement?.source === 'absent' ? '' : (existing.arrangement?.working || ''),
        stable: existing.arrangement?.source === 'absent' ? '' : (existing.arrangement?.stable || ''),
        worktrees: existing.repo_profile?.worktrees || 'disabled',
      };
      const repoFields = group(t('roots.group_repository', 'Repository workflow'), t('roots.group_repository_help', 'Publishing describes where accepted commits go. Worktrees separately decides whether this repository participates in Ronin’s managed worktree workflow.'));
      const pick = (label, value, options, hint, host = repoFields) => {
        const wrap = document.createElement('label'); wrap.className = 'pr-f';
        const l = document.createElement('span'); l.textContent = label; l.title = hint;
        const select = document.createElement('select');
        for (const [v, text] of options) { const o = document.createElement('option'); o.value = v; o.textContent = text; select.append(o); }
        select.value = value; wrap.append(l, select); host.append(wrap); return select;
      };
      const initialMode = creating ? (seedWorktrees === 'enabled' ? 'reviewed' : 'direct') : before.mode;
      const mode = pick(t('roots.f_mode', 'publishing'), initialMode, [['reviewed', t('roots.mode_reviewed', 'reviewed release')], ['direct', t('roots.mode_direct', 'direct publishing')]], t('roots.f_mode_hint', 'Reviewed uses a working branch and a final PR to stable. Direct publishes on stable itself.'));
      const working = mk(t('roots.f_working', 'working'), 'repo-working', before.working || 'dev', t('roots.f_working_hint', 'The integration branch for reviewed work. You choose its name.'), 'dev', repoFields);
      const stable = mk(t('roots.f_stable', 'stable'), 'repo-stable', before.stable || existing.facts?.repo?.branch || 'main', t('roots.f_stable_hint', 'The published branch. You choose its name.'), 'main', repoFields);
      working.removeAttribute('data-key'); stable.removeAttribute('data-key');
      const worktrees = pick(t('roots.f_worktrees', 'Worktrees'), creating ? seedWorktrees : before.worktrees, [['enabled', t('roots.worktrees_enabled', 'Use Ronin Worktrees')], ['disabled', t('roots.worktrees_disabled', 'Use the checkout')]], t('roots.f_worktrees_hint', 'Worktrees keep each Agent’s file changes in a separate working folder and branch. Both the Agent and repo must have Worktrees on.'));
      const worktreesNote = document.createElement('p');
      worktreesNote.className = 'pr-worktrees-note';
      worktreesNote.textContent = t('roots.worktrees_two_gates', 'This controls the repo. Worktrees use a managed hand-in and Team-lead merge process.');
      repoFields.append(worktreesNote);
      const preview = document.createElement('p');
      preview.className = 'pr-flow';
      repoFields.append(preview);
      const syncProfile = () => {
        working.closest('label').hidden = mode.value !== 'reviewed';
        const branchFlow = mode.value === 'reviewed'
          ? t('roots.flow_reviewed', '{working} → review → {stable}', { working: working.value.trim() || '—', stable: stable.value.trim() || '—' })
          : t('roots.flow_direct', 'commits → {stable}', { stable: stable.value.trim() || '—' });
        const worktreesFlow = worktrees.value === 'enabled'
          ? t('roots.flow_worktrees', 'Agents with Worktrees on use their own working folder and branch; other Agents use the checkout.')
          : t('roots.flow_checkout', 'Every Agent uses this checkout, even when the Agent has Worktrees on.');
        preview.textContent = t('roots.flow_preview', 'Flow: {branches}. {worktrees} Saving this profile does not create, move, or rename branches.', { branches: branchFlow, worktrees: worktreesFlow });
      };
      for (const control of [mode, working, stable, worktrees]) control.addEventListener('input', syncProfile);
      syncProfile();
      profileFields = { before, mode, working, stable, worktrees };
      if (creating) dirInput.addEventListener('change', async () => {
        const inspected = await request(`/api/project-roots/inspect?dir=${encodeURIComponent(dirInput.value.trim())}`, { cache: 'no-store' });
        if (!inspected.ok || !inspected.data.repo) return;
        const a = inspected.data.arrangement;
        const p = inspected.data.repo_profile;
        if (a?.source !== 'absent') {
          Object.assign(profileFields.before, { mode: p.mode, working: p.mode === 'reviewed' ? p.working : '', stable: p.stable, worktrees: p.worktrees });
          mode.value = p.mode; working.value = p.working || ''; stable.value = p.stable || ''; worktrees.value = p.worktrees; syncProfile();
        } else if (inspected.data.repo.branch && stable.value === 'main') { stable.value = inspected.data.repo.branch; syncProfile(); }
      });
    }

    const row = document.createElement('div');
    row.className = 'pr-frow';
    const save = createAction({ label: creating ? t('roots.add_save', 'Add') : t('roots.save', 'save'), kind: 'primary' }).el;
    const cancel = createAction({ label: t('roots.cancel', 'cancel') }).el;
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
      const name = creating ? body.name : existing.name;
      delete body.name; // on an edit the heading IS the handle; on an add it rides the body
      let proposedProfile = null;
      if (profileFields) {
        let creationIsRepo = true;
        if (creating) {
          const inspected = await request(`/api/project-roots/inspect?dir=${encodeURIComponent(dirInput.value.trim())}`, { cache: 'no-store' });
          if (!inspected.ok) { err.say(inspected.message, 'bad'); return; }
          creationIsRepo = !!inspected.data.repo;
          if (creationIsRepo && inspected.data.arrangement) Object.assign(profileFields.before, {
            mode: inspected.data.arrangement.mode,
            working: inspected.data.arrangement.source === 'absent' ? '' : (inspected.data.arrangement.working || ''),
            stable: inspected.data.arrangement.source === 'absent' ? '' : (inspected.data.arrangement.stable || ''),
            worktrees: inspected.data.repo_profile.worktrees,
          });
        }
        if (creationIsRepo) {
          proposedProfile = {
            mode: profileFields.mode.value,
            working: profileFields.mode.value === 'reviewed' ? profileFields.working.value.trim() : '',
            stable: profileFields.stable.value.trim(),
            worktrees: profileFields.worktrees.value,
          };
          const line = (p) => [
            `mode=${p.mode}`,
            ...(p.mode === 'reviewed' ? [`working=${p.working}`] : []),
            `stable=${p.stable}`,
            `worktrees=${p.worktrees}`,
          ].join('\n');
          if ((creating || JSON.stringify(proposedProfile) !== JSON.stringify(profileFields.before)) && !confirm(t('roots.profile_confirm', 'Rewrite RONIN_REPO with this repository profile?\n\nBefore:\n{before}\n\nAfter:\n{after}\n\nRunning Agents may still have the earlier instructions.', { before: line(profileFields.before), after: line(proposedProfile) }))) return;
        }
      }
      save.disabled = true;
      err.say('');
      const r = creating
        ? await request('/api/project-roots', { method: 'POST', json: { ...body, name, ...(proposedProfile ? { before: profileFields.before, profile: proposedProfile, confirmed: true } : {}) } })
        : await request('/api/project-roots/' + encodeURIComponent(name), { method: 'PUT', json: body });
      if (!r.ok) {
        err.say(r.message, 'bad');
        save.disabled = false;
        return;
      }
      if (profileFields && !creating) {
        if (JSON.stringify(proposedProfile) !== JSON.stringify(profileFields.before)) {
          const d = await request('/api/project-roots/' + encodeURIComponent(name) + '/repo-profile', {
            method: 'PUT',
            json: { before: profileFields.before, profile: proposedProfile, confirmed: true },
          });
          if (!d.ok) {
            err.say(d.message, 'bad');
            save.disabled = false;
            return;
          }
        }
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
    let worktreesState = null;
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
      // HOW THE REPOSITORY IS RUN, apart from the branch mounted here: read from its
      // checked-in RONIN_REPO. No record = today's shared checkout, said plainly.
      const a = r.arrangement;
      if (a && a.source !== 'absent') {
        const p = r.repo_profile;
        const enabled = p?.worktrees === 'enabled';
        chip(enabled ? t('roots.chip_worktrees', 'Repository: Worktrees allowed') : t('roots.chip_checkout', 'Repository: use checkout'), '',
          a.mode === 'reviewed'
            ? t('roots.chip_reviewed_title', 'Reviewed: work moves through {working}, then review reaches {stable}. The branch mounted here is incidental.', { working: a.working || 'dev', stable: a.stable || 'master' })
            : t('roots.chip_direct_title', 'Direct: commits land on {stable} itself.', { stable: a.stable || 'main' }));
        worktreesState = document.createElement('p');
        worktreesState.className = 'pr-worktrees-state';
        worktreesState.textContent = enabled
          ? t('roots.state_worktrees', 'Repo: Worktrees on. Agent must also have Worktrees on.')
          : t('roots.state_checkout', 'This repository uses its checkout. That repository choice wins even if an Agent has the Ronin Worktrees Routine.');
      } else if (a) {
        chip(t('roots.chip_shared', 'Repository: use checkout'), 'muted', t('roots.chip_shared_title', 'No RONIN_REPO record: sessions use this checkout. Edit this root to declare its repository workflow.'));
        worktreesState = document.createElement('p');
        worktreesState.className = 'pr-worktrees-state';
        worktreesState.textContent = t('roots.state_undeclared', 'No repository profile is declared, so Agents use the checkout. Edit this root to allow Ronin Worktrees.');
      }
    } else {
      // A project_root need not be a project_repo. `~/lab` is one; this is a
      // legal shape, not a warning.
      chip(t('roots.chip_no_repo', 'no repo'), 'muted', t('roots.chip_no_repo_title', 'Not a git repo — a workspace folder does not need to be one'));
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
    const edit = createAction({ label: t('roots.edit', 'edit') }).el;
    edit.addEventListener('click', () => {
      editing = editing === r.name ? null : r.name;
      render();
    });
    const shelve = createAction({
      label: r.archived ? t('roots.unarchive', 'unarchive') : t('roots.archive', 'archive'),
      title: r.archived
        ? t('roots.unarchive_title', 'Put it back on the new-session picker.')
        : t('roots.archive_title', 'Take it off the new-session picker. It stays on this pane, and sessions already using it are untouched.'),
    }).el;
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
    const drop = createAction({ label: t('roots.exclude', 'exclude'), kind: 'danger', title: t('roots.exclude_title', 'Remove it from the catalog. Nothing on disk is touched.') }).el;
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
    b.append(facts);
    if (worktreesState) b.append(worktreesState);
    b.append(acts);
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
      (live === 1 ? t('roots.count_one', '{n} workspace folder', { n: live }) : t('roots.count_many', '{n} workspace folders', { n: live })) +
      (archived ? ' · ' + t('roots.count_archived', '{n} archived', { n: archived }) : '') +
      (data.untagged ? ' · ' + (data.untagged === 1 ? t('roots.untagged_one', '{n} untagged session', { n: data.untagged }) : t('roots.untagged_many', '{n} untagged sessions', { n: data.untagged })) : '');
    if (!roots.length) say(t('roots.empty', 'No workspace folders yet — add one below.'));
    for (const r of roots) list.appendChild(block(r));
    list.appendChild(addCard());
  }

  /** The last card in the list: the same shape as a root, and the place a new one is typed. */
  function addCard() {
    const b = document.createElement('div');
    b.className = 'pr-block pr-add';
    if (editing === NEW) {
      const top = document.createElement('div');
      top.className = 'pr-top';
      const h = document.createElement('b');
      h.textContent = t('roots.add', '＋ Add workspace folder');
      top.append(h);
      b.append(top, form({ name: '', dir: '', remit: '', match: [], docs: [], plans: [] }, true));
      return b;
    }
    const open = createAction({ label: t('roots.add', '＋ Add workspace folder'), title: t('roots.add_hint', 'An existing directory on this machine where Agents may work.') }).el;
    open.addEventListener('click', () => { editing = NEW; render(); });
    b.append(open);
    return b;
  }

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
