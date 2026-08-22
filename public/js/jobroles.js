/* part of the ronin-cowork client — see js/README.md */
/**
 * JOB ROLES — the sections of the ＋ New board, and now rather more than sections.
 *
 * These were the owner's Job Group shelves: collapsible groupings that organized the
 * board and addressed nothing. The ruling of 2026-08-22 promoted them (KOTOBA § JOB
 * ROLES). Everything the interaction already did survives — ordering, folding, drag and
 * drop, a task on several shelves at once, membership the owner owns — and a role now
 * also carries its own reading level and its own launch defaults, so picking a task
 * FROM INSIDE a role launches with both axes set.
 *
 * TWO BUTTONS PER SECTION, and the first one is the new part. Every role is launchable
 * with a BLANK task: that is how `personalassistant` and `mikaassist`
 * start, and any role the owner invents has to be able to start the same way. A section
 * whose tasks are all you could press would make the role a folder again.
 *
 * THE ROSTER'S OWN GRAMMAR, on purpose (js/roster.js): dragging a task onto a role ADDS
 * it there — `copy`, never a move, because a task may sit on several roles — and the ✎
 * editor is the same multi-toggle the drag cannot express: it is where membership is
 * REMOVED, and it is what keeps every edit reachable on touch.
 *
 * NO CREATE, NO DELETE, DELIBERATELY. Authoring a role — inventing one, naming it,
 * giving it a reading shelf — is the next build-out. This module edits membership of
 * roles that exist, which is board organization; it does not mint vocabulary.
 *
 * EDITING A HOUSE ROLE SHADOWS IT (src/definitions.ts): membership lives in the role
 * definition now, so the first re-shelving makes the owner's `developer.md` the
 * definition and ours stops applying. The provenance mark on the section says so.
 */
import { request } from './request.js';
import { toast } from './ui.js';
import { addProvMark } from './provenance.js';

const DRAG_TYPE = 'application/x-ronin-task';

/** Make a task button a drag source. The payload is the task's token and nothing else. */
export function draggableTask(b, name) {
  b.draggable = true;
  b.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(DRAG_TYPE, name);
    e.dataTransfer.setData('text/plain', name);
    b.classList.add('dragging');
  });
  b.addEventListener('dragend', () => b.classList.remove('dragging'));
}

/* Which sections are folded — a per-device viewing preference, like the tile layout,
 * so it lives in this browser and never in a definition file. */
const FOLD_KEY = 'ronin.jobRolesClosed';
const foldedRoles = () => {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
};
const rememberFold = (name, open) => {
  try {
    const closed = new Set(foldedRoles());
    if (open) closed.delete(name); else closed.add(name);
    localStorage.setItem(FOLD_KEY, JSON.stringify([...closed]));
  } catch (_) {
    /* storage denied — the fold simply does not persist */
  }
};

/**
 * @param {object} deps
 * @param {(task: object, role: object) => HTMLElement} deps.taskButton  a task, launched inside a role
 * @param {(role: object) => HTMLElement} deps.roleButton  the role's own blank-task launch
 * @param {() => object[]} deps.allTasks  the session_task rows as the launcher holds them
 * @param {() => object[]} deps.allRoles  the job_role rows as the launcher holds them
 * @param {() => void} deps.onChange  rebuild the board (sections AND the loose tail)
 * @returns {{wrap: HTMLElement, render: () => Set<string>}}
 */
export function buildRoleSections({ taskButton, roleButton, allTasks, allRoles, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'ks-classes';

  const save = async (role, tasks) => {
    const r = await request(`/api/job-roles/${encodeURIComponent(role)}/task_family`, {
      method: 'PUT',
      json: { task_family: tasks },
    });
    if (!r.ok) {
      toast(r.message, false);
      return false;
    }
    onChange();
    return true;
  };

  /** ONE role's task family — a multi-toggle in the task menu's own clothes
   * (js/widgets.js openJobMenu: same anchoring, same dismissal grammar), staying open
   * across clicks because shelving is several toggles in a row. */
  const openEditor = (anchor, role) => {
    document.querySelector('.job-menu')?.remove();
    const m = document.createElement('div');
    m.className = 'job-menu';
    const current = () => (allRoles().find((r) => r.name === role.name)?.task_family ?? []);
    for (const k of allTasks()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'job-opt' + (current().includes(k.name) ? ' on' : '');
      b.append(
        Object.assign(document.createElement('i'), { textContent: k.icon }),
        Object.assign(document.createElement('span'), { textContent: k.label }),
      );
      b.title = k.remit || k.blurb || '';
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const now = current();
        const next = now.includes(k.name) ? now.filter((t) => t !== k.name) : [...now, k.name];
        if (await save(role.name, next)) b.classList.toggle('on', next.includes(k.name));
      });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const a = anchor.getBoundingClientRect();
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    m.style.left = Math.round(Math.max(4, Math.min(a.left, window.innerWidth - w - 4))) + 'px';
    m.style.top = Math.round(a.bottom + 4 + h > window.innerHeight ? Math.max(4, a.top - h - 4) : a.bottom + 4) + 'px';
    setTimeout(() => {
      const away = () => {
        m.remove();
        document.removeEventListener('click', away);
        document.removeEventListener('keydown', esc, true);
      };
      const esc = (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        away();
      };
      document.addEventListener('click', away);
      document.addEventListener('keydown', esc, true);
    }, 0);
  };

  const section = (role, members) => {
    const d = document.createElement('details');
    d.className = 'ks-class';
    d.open = !foldedRoles().includes(role.name);
    const sum = document.createElement('summary');
    const label = Object.assign(document.createElement('b'), { textContent: role.label || role.name });
    // Yours, or one of ours you replaced — a fact about THIS section, and the mark is
    // how re-shelving a house role announces that it stopped tracking our updates.
    addProvMark(label, role);
    sum.append(
      Object.assign(document.createElement('i'), { textContent: role.icon || '' }),
      label,
      Object.assign(document.createElement('span'), { className: 'ks-class-n', textContent: String(members.length) }),
    );
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'ks-class-edit';
    edit.textContent = '✎';
    edit.title = `Choose this role's Family — the session_tasks presented under "${role.label || role.name}", and where one leaves it`;
    edit.addEventListener('click', (e) => {
      e.preventDefault(); // a button inside <summary> must not toggle the fold
      e.stopPropagation();
      openEditor(edit, role);
    });
    sum.appendChild(edit);
    const grid = document.createElement('div');
    grid.className = 'ks-grid';
    // THE BLANK-TASK LAUNCH, first and always present: this role, doing nothing named yet.
    grid.appendChild(roleButton(role));
    for (const k of members) grid.appendChild(taskButton(k, role));
    d.append(sum, grid);
    d.addEventListener('toggle', () => rememberFold(role.name, d.open));
    d.title = `Drop a task here to add it to ${role.label || role.name}`;
    d.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      d.classList.add('drop-ready');
    });
    d.addEventListener('dragleave', (e) => {
      if (!d.contains(e.relatedTarget)) d.classList.remove('drop-ready');
    });
    d.addEventListener('drop', async (e) => {
      e.preventDefault();
      d.classList.remove('drop-ready');
      const name = e.dataTransfer.getData(DRAG_TYPE);
      const now = allRoles().find((r) => r.name === role.name)?.task_family ?? [];
      if (!name || now.includes(name)) return;
      await save(role.name, [...now, name]);
    });
    return d;
  };

  const render = () => {
    wrap.innerHTML = '';
    const tasks = allTasks();
    const byName = new Map(tasks.map((k) => [k.name, k]));
    const shelved = new Set();
    for (const role of allRoles()) {
      // A token the definitions no longer know renders nowhere and stays in the file —
      // the file is the owner's, and a stock task may come back.
      const members = (role.task_family ?? []).map((n) => byName.get(n)).filter(Boolean);
      members.forEach((k) => shelved.add(k.name));
      wrap.appendChild(section(role, members));
    }
    // A LOOSE TASK — on no role's shelf — launches with a blank job_role, which is a real
    // launch and not a leftover. It sits flat under the sections, the roster's own answer
    // for the untagged, with a heading only once sections exist.
    if (allRoles().length && shelved.size < tasks.length) {
      wrap.appendChild(
        Object.assign(document.createElement('div'), { className: 'ks-loose-h', textContent: 'no job role' }),
      );
    }
    return shelved;
  };

  return { wrap, render };
}
