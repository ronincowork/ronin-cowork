/* part of the ronin-cowork client — see js/README.md */
import { t } from './lexicon.js';

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };

/**
 * @param {{ roots?: {name: string, repo?: boolean}[], root?: string, repos?: string[], branches?: Record<string,string>,
 *           worktreesOn?: boolean, branchesEditable?: boolean, rootDefaultLabel?: string, onChange?: () => void }} o
 */
export function createWhereItWorks(o = {}) {
  const details = el('details', 'tw-where'); const summary = el('summary', 'wk-field-control'); const body = el('div', 'tw-where-body'); details.append(summary, body);
  const rootRow = el('label', 'tw-config-field'); rootRow.append(el('span', null, t('where.born_in', 'Born in')));
  const rootSelect = el('select', 'wk-field-control'); rootRow.append(rootSelect); body.append(rootRow);
  const line = el('p', 'tw-config-note'); body.append(line);
  const list = el('div', 'tw-where-repos'); body.append(list);
  const state = { roots: [], root: o.root || '', repos: [...(o.repos || [])], branches: { ...(o.branches || {}) }, worktreesOn: !!o.worktreesOn, editable: o.branchesEditable !== false };
  const rows = new Map();
  const changed = () => { paint(); o.onChange?.(); };

  function buildRoots() {
    rootSelect.replaceChildren();
    if (o.rootDefaultLabel != null) rootSelect.add(new Option(o.rootDefaultLabel, ''));
    for (const root of state.roots) rootSelect.add(new Option(root.name, root.name));
    if (state.root && !state.roots.some((root) => root.name === state.root)) rootSelect.add(new Option(state.root, state.root));
    rootSelect.value = state.root;
    if (rootSelect.value !== state.root) { rootSelect.value = o.rootDefaultLabel != null ? '' : (state.roots[0]?.name ?? ''); state.root = rootSelect.value; }
  }
  function buildRows() {
    rows.clear(); list.replaceChildren();
    const head = el('div', 'tw-where-repo tw-where-head'); head.append(el('span'), el('span', null, t('where.col_repo', 'Repository')), el('span', null, t('where.col_branch', 'Branch'))); list.append(head);
    for (const root of state.roots.filter((root) => root.repo !== false)) {
      const row = el('label', 'tw-where-repo'); const tick = el('input'); tick.type = 'checkbox'; tick.checked = state.repos.includes(root.name);
      const branch = el('input', 'wk-field-control'); branch.type = 'text'; branch.spellcheck = false; branch.value = state.branches[root.name] || ''; branch.readOnly = !state.editable;
      tick.addEventListener('change', () => { state.repos = ticked(); changed(); });
      branch.addEventListener('input', () => { state.branches[root.name] = branch.value.trim(); o.onChange?.(); });
      row.append(tick, el('span', null, root.name), branch); list.append(row); rows.set(root.name, { tick, branch });
    }
  }
  const ticked = () => [...rows].filter(([, row]) => row.tick.checked).map(([name]) => name);
  function paint() {
    const on = state.worktreesOn;
    line.textContent = on
      ? t('where.worktrees_on', 'Worktrees are on (see Routines): a ticked repository opens a desk for each new Agent at birth; branches are Ronin\'s.')
      : t('where.worktrees_off', 'Worktrees are off (see Routines): a ticked repository is where this Team works, on the branch you name, or as checked out.');
    list.classList.toggle('tw-where-desks', on);
    for (const { branch } of rows.values()) branch.disabled = on;
    const names = ticked();
    summary.textContent = t('where.summary', 'born in {root} · {repos}', {
      root: rootSelect.value || o.rootDefaultLabel || t('team_config.default', 'Default'),
      repos: names.length ? (on ? t('where.desks', 'desks in {list}', { list: names.join(', ') }) : t('where.checkouts', 'works in {list}', { list: names.join(', ') })) : t('where.none', 'no auto desk'),
    });
  }
  rootSelect.addEventListener('change', () => { state.root = rootSelect.value; changed(); });
  buildRoots(); buildRows(); paint();

  return {
    el: details,
    rootSelect,
    get root() { return rootSelect.value; },
    set root(value) { state.root = value || ''; buildRoots(); paint(); },
    repos: () => ticked(),
    branches: () => Object.fromEntries([...rows].filter(([, row]) => row.tick.checked && row.branch.value.trim()).map(([name, row]) => [name, row.branch.value.trim()])),
    setRoots(roots) { state.roots = Array.isArray(roots) ? roots : []; buildRoots(); buildRows(); paint(); },
    setRepos(repos, branches) { state.repos = [...(repos || [])]; if (branches) state.branches = { ...branches }; buildRows(); paint(); },
    setWorktrees(on) { state.worktreesOn = !!on; paint(); },
    summary: () => summary.textContent,
  };
}
