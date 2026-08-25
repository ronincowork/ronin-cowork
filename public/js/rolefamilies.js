/* part of the ronin-cowork client — see js/README.md */
/**
 * ROLE FAMILIES — the sections of the ＋ New board, and DELIBERATELY nothing more.
 *
 * These were the owner's Job Group shelves, briefly promoted to a session axis, and
 * demoted again by R35 (2026-08-23): **a family is PRESENTATION** — it groups the
 * session_role buttons for viewing and seeds a Build-Team template, and it never rides
 * a launch, a letter, or a session. This board keeps ordering, folding, and a role on
 * several shelves at once; Customize owns the membership interaction.
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
 * MEMBERSHIP AUTHORING LIVES IN CUSTOMIZE. This board presents the resolved families and
 * launches their members; it does not carry a second mutation path.
 *
 * NO CREATE, NO DELETE, DELIBERATELY. Authoring a family is the next build-out.
 *
 * EDITING A HOUSE FAMILY SHADOWS IT (src/definitions.ts): the first re-shelving makes
 * the owner's `developer.md` the definition and ours stops applying. The provenance
 * mark on the section says so.
 */
import { addProvMark } from './provenance.js';

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
 * @returns {{wrap: HTMLElement, render: () => Set<string>}}
 */
export function buildRoleSections({ taskButton, allTasks, allRoles }) {
  const wrap = document.createElement('div');
  wrap.className = 'ks-classes';

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
    const grid = document.createElement('div');
    grid.className = 'ks-grid';
    // Members only — a family is not launchable (R35). The default_lead_role arrives
    // first in `members` because the reader pins it (src/definitions.ts).
    for (const k of members) grid.appendChild(taskButton(k, role));
    d.append(sum, grid);
    d.addEventListener('toggle', () => rememberFold(role.name, d.open));
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
