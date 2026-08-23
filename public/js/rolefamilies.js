/* part of the ronin-cowork client — see js/README.md */
/**
 * ROLE FAMILIES — the sections of the ＋ New board, and DELIBERATELY nothing more.
 *
 * These were the owner's Job Group shelves, briefly promoted to a session axis, and
 * demoted again by R35 (2026-08-23): **a family is PRESENTATION** — it groups the
 * session_role buttons for viewing and seeds a Build-Team template, and it never rides
 * a launch, a letter, or a session. Everything the interaction always did survives —
 * ordering, folding, drag and drop, a role on several shelves at once, membership the
 * owner owns.
 *
 * THE PIN: a family's `default_lead_role` is presented FIRST in its section (the reader
 * pins it — src/definitions.ts), because it is the suggested first launch when a team
 * is built from this shelf. A pin is a default, never the `team_lead` designation on a
 * live session.
 *
 * ONE BUTTON PER MEMBER, no blank-family launch: a family is not launchable, because a
 * family is not an axis. `PersonalAssistant` and `MikaAssist` are ordinary
 * session_roles with their own buttons.
 *
 * THE ROSTER'S OWN GRAMMAR, on purpose (js/roster.js): dragging a role onto a family
 * ADDS it there — `copy`, never a move — and the ✎ editor is the same multi-toggle the
 * drag cannot express: it is where membership is REMOVED, and what keeps every edit
 * reachable on touch. An edit that would orphan the pinned `default_lead_role` is
 * refused by the server, naming the fix.
 *
 * NO CREATE, NO DELETE, DELIBERATELY. Authoring a family is the next build-out.
 *
 * EDITING A HOUSE FAMILY SHADOWS IT (src/definitions.ts): the first re-shelving makes
 * the owner's `developer.md` the definition and ours stops applying. The provenance
 * mark on the section says so.
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
const FOLD_KEY = 'ronin.roleFamilysClosed';
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
 * @param {() => object[]} deps.allTasks  the session_role rows as the launcher holds them
 * @param {() => object[]} deps.allRoles  the role_family rows as the launcher holds them
 * @param {() => void} deps.onChange  rebuild the board (sections AND the loose tail)
 * @returns {{wrap: HTMLElement, render: () => Set<string>}}
 */
export function buildRoleSections({ taskButton, allTasks, allRoles, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'ks-classes';

  const save = async (role, tasks) => {
    const r = await request(`/api/role-families/${encodeURIComponent(role)}/session_roles`, {
      method: 'PUT',
      json: { session_roles: tasks },
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
    const current = () => (allRoles().find((r) => r.name === role.name)?.session_roles ?? []);
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
    edit.title = `Choose this role's Family — the session_roles presented under "${role.label || role.name}", and where one leaves it`;
    edit.addEventListener('click', (e) => {
      e.preventDefault(); // a button inside <summary> must not toggle the fold
      e.stopPropagation();
      openEditor(edit, role);
    });
    sum.appendChild(edit);
    const grid = document.createElement('div');
    grid.className = 'ks-grid';
    // Members only — a family is not launchable (R35). The default_lead_role arrives
    // first in `members` because the reader pins it (src/definitions.ts).
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
      const now = allRoles().find((r) => r.name === role.name)?.session_roles ?? [];
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
      const members = (role.session_roles ?? []).map((n) => byName.get(n)).filter(Boolean);
      members.forEach((k) => shelved.add(k.name));
      wrap.appendChild(section(role, members));
    }
    // A LOOSE session_role — on no family's shelf — is a real button and not a leftover.
    // It sits flat under the sections, with a heading only once sections exist.
    if (allRoles().length && shelved.size < tasks.length) {
      wrap.appendChild(
        Object.assign(document.createElement('div'), { className: 'ks-loose-h', textContent: 'no role' }),
      );
    }
    return shelved;
  };

  return { wrap, render };
}
