/* Work Items: a reading surface over the Jira-shaped work items, as phalanx stones grouped by
 * parent (epic, then its items, then subtasks). Changes go through the item tool. */
import { WorkspaceKit } from './workspace-kit.js';
import { carryItem } from './team-drag.js';
import { createPhalanx } from './phalanx.js';
import { subscribe } from './team-controller.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { createStep } from './form-steps.js';
import { kindMark } from './tile-island.js';

export const WORK_ITEMS_TYPE = 'work-items';
/** Jira's flag: an impediment, marked the same way on every surface. */
export const FLAG_MARK = '⚑';

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag); out.className = cls; out.textContent = text; return out;
};

/** Who works an item now: its Agent, or the lead when the Team holds it; nobody when parked. */
export const holderOf = (item, leadName) => String(item.holder || '').startsWith('agent:') ? item.holder.slice(6)
  : String(item.holder || '').startsWith('team:') ? leadName : '';

/** The Work Items surface's availability: the task_manager part installed and running. */
export function workItemsAvailability(installed) {
  const capabilities = installed?.services?.capabilities;
  return capabilities?.desired?.task_manager === true && Array.isArray(capabilities.running) && capabilities.running.includes('task_manager');
}

/** The stones, grouped by parent: each epic heads its group, then its items, each followed by
 * its subtasks. `all` is the whole reading, so a group names an epic the scope does not hold. */
export function itemStones(items, { all = items, holder = () => '' } = {}) {
  const known = new Map(all.map((item) => [item.id, item]));
  const rootOf = (item) => {
    let at = item;
    for (const seen = new Set(); at.parent && !seen.has(at.id);) {
      seen.add(at.id);
      const up = known.get(at.parent);
      if (!up) return { id: at.parent, title: '' };
      at = up;
    }
    return at;
  };
  const shown = new Set(items.map((item) => item.id));
  const order = [];
  const walk = (item) => { if (shown.has(item.id) && !order.includes(item)) order.push(item); for (const child of all.filter((other) => other.parent === item.id)) walk(child); };
  const roots = [...new Map(items.map((item) => { const root = rootOf(item); return [root.id, root]; })).values()];
  for (const root of roots) {
    if (known.has(root.id)) walk(known.get(root.id));
    else for (const item of all.filter((other) => other.parent === root.id)) walk(item);
  }
  return order.map((item) => {
    const root = rootOf(item);
    const epic = root.level === 1 || !known.has(root.id);
    const group = epic ? { id: root.id, label: [root.id, root.title].filter(Boolean).join(' · ') } : { id: 'none', label: t('work_items.no_epic', 'No epic') };
    const owner = holder(item);
    return {
      id: item.id, item, group, label: item.title || item.id,
      secondary: owner ? `@${owner}` : '',
      state: [item.id, item.kind, item.status, item.flagged ? FLAG_MARK : ''].filter(Boolean).join(' · '),
      className: `wi-level-${item.level === 1 ? 'epic' : item.level === -1 ? 'subtask' : 'item'}${item.flagged ? ' wi-flagged' : ''}`,
      attrs: { 'data-item': item.id }, draggable: true,
      events: { dragstart: (event) => carryItem(event.dataTransfer, item) }, // onto a tile: the item's reference
    };
  });
}

/** The statuses an item can move to, in workflow order (Jira's, JIRA_NAMES in src/work-items.ts),
 * and the item's own when its space names another. */
export const ITEM_STATUSES = ['To Do', 'In Progress', 'In Review', 'Done'];
export const statusChoices = (item) => [...new Set([...ITEM_STATUSES, item?.status].filter(Boolean))];

const when = (at) => String(at || '').slice(0, 16).replace('T', ' ');

/** One item's reading, in the launch forms' format (owner, 2026-11-05): a head with the kind's
 * symbol, the title and the key, then label-left steps — Status (an ERABI question that moves
 * the item: the work-item routes' transition), Objective, Details, Comments, Attachments (each
 * opens), Links and History (`history: false` leaves it out: the Epics workbench, KAN-206).
 * Every size is a form token; nothing takes the terminal's face. */
export function renderItemDetail(host, item, { holder = '', openAttachment = null, history = true } = {}) {
  const form = el('div', 'ntf-form wi-form');
  const head = el('header', 'wi-head');
  const key = el('p', 'wi-key');
  const sayKey = (status) => { key.textContent = [item.jira || item.id, item.kind, status, item.flagged ? `${FLAG_MARK} ${t('work_items.flagged', 'flagged')}` : ''].filter(Boolean).join(' · '); };
  sayKey(item.status);
  const words = el('div', 'wi-head-words');
  words.append(el('h2', 'wi-title', item.title || item.id), key);
  head.append(kindMark(item.kind), words);
  form.append(head);
  const step = (title, ...nodes) => {
    const one = createStep({ key: title, title });
    one.body.append(...nodes);
    form.append(one.el);
    return one;
  };

  // Status: any status to any status, as Jira's transition; the push that follows redraws the
  // rest of the page, and the line under the question says what happened until then.
  let status = item.status;
  const answer = el('p', 'fs-step-help wi-answer');
  answer.setAttribute('role', 'status');
  const question = ask([{ fields: [{ key: 'status', label: t('work_items.status', 'Status'),
    options: statusChoices(item).map((v) => ({ v, l: v })) }] }], {
    value: { status }, density: 'tight',
    onChange: async ({ status: next }) => {
      if (!next || next === status) return;
      const was = status;
      answer.dataset.state = '';
      answer.textContent = t('work_items.moving', 'Moving…');
      const result = await request(`/api/work-items/${encodeURIComponent(item.id)}/transition`, { method: 'POST', json: { status: next } });
      if (result.ok) { status = next; sayKey(next); answer.textContent = `${was} → ${next}`; }
      else { question.set('status', was); answer.dataset.state = 'failed'; answer.textContent = result.message || t('work_items.move_failed', 'The status did not change.'); }
    },
  });
  step(t('work_items.status', 'Status'), question.el, answer);

  if (item.objective) step(t('work_items.objective', 'Objective'), el('p', 'wi-objective', item.objective));
  const facts = el('dl', 'wi-facts');
  for (const [label, value] of [
    [t('work_items.priority', 'Priority'), item.priority || '—'],
    [t('work_items.holder', 'Holder'), holder ? `@${holder}` : t('work_items.nobody', 'nobody')],
    [t('work_items.parent', 'Parent'), item.parent || '—'],
    // A paired item's Jira fields, by Jira's own names.
    ...Object.entries(item.jiraFields || {}),
  ]) facts.append(el('dt', '', label), el('dd', '', value));
  step(t('work_items.details', 'Details'), facts);

  const section = (label, rows) => {
    if (!rows.length) return;
    const list = el('ul', 'wi-list');
    list.append(...rows);
    step(label, list);
  };
  section(t('work_items.comments', 'Comments'), (item.comments || []).map((comment) => {
    const row = el('li', 'wi-comment');
    row.append(el('small', 'wi-when', `${comment.by || ''} · ${when(comment.at)}`), el('p', 'wi-text', comment.text || ''));
    return row;
  }));
  section(t('work_items.attachments', 'Attachments'), (item.attachments || []).map((path) => {
    const row = el('li');
    // A file kept in Jira is its link, opened there; a path opens here.
    const link = /^https?:\/\//.test(path);
    const open = el(link ? 'a' : openAttachment ? 'button' : 'span', 'wi-attachment', decodeURIComponent(path.split('/').pop()));
    open.title = path;
    if (link) { open.href = path; open.target = '_blank'; open.rel = 'noopener'; }
    else if (openAttachment) { open.type = 'button'; open.addEventListener('click', () => openAttachment(path)); }
    row.append(open);
    return row;
  }));
  section(t('work_items.links', 'Links'), (item.links || []).map((link) => el('li', 'wi-text', `${link.type} ${link.to}`)));
  if (history) section(t('work_items.history', 'History'), (item.trail || []).map((line) => el('li', 'wi-when',
    [when(line.at), line.by, line.op, [line.from, line.to].filter(Boolean).join(' → '), line.note].filter(Boolean).join(' · '))));
  host.append(form);
}

/** A phalanx of item stones with the reading as its detail. */
export function createItemPhalanx({ holder = () => '', openAttachment = null, className = '' } = {}) {
  const phalanx = createPhalanx({ grouped: true, className: `wi-phalanx ${className}`.trim(), renderDetail: ({ item }, host) => {
    renderItemDetail(host, item, { holder: holder(item), openAttachment });
  } });
  return { el: phalanx.el, phalanx, setItems: (items, all = items) => phalanx.setItems(itemStones(items, { all, holder })), destroy: () => phalanx.destroy() };
}

export function createWorkItemsSurface(options = {}) {
  const { createSurface, createAction } = WorkspaceKit.primitives;
  let entered = false, read = null;
  const holder = (item) => holderOf(item, options.lead?.(item) || '');
  const refreshAction = createAction({ label: t('work_items.refresh', 'Refresh Work Items'), action: () => void refresh() });
  const surface = createSurface({ label: t('work_items.title', 'Work Items'), className: 'work-items-surface', actions: [refreshAction] });
  const notice = el('p', 'wi-notice'); notice.setAttribute('role', 'status');
  const stones = createItemPhalanx({ holder, openAttachment: options.openAttachment });
  stones.phalanx.mount(surface.content, { after: [notice] });
  async function refresh() {
    read?.abort();
    const controller = new AbortController(); read = controller;
    const { agent = '', teams = [] } = options.scope();
    notice.textContent = t('work_items.loading', 'Loading Work Items…');
    const [installed, ...results] = await Promise.all([
      request('/api/installed', { cache: 'no-store', signal: controller.signal }),
      ...teams.map((team) => request(`/api/work-items?team=${encodeURIComponent(team)}`, { cache: 'no-store', signal: controller.signal })),
    ]);
    if (controller.signal.aborted) return;
    if (!installed.ok || results.some((result) => !result.ok)) {
      notice.textContent = t('work_items.failed', 'Could not load Work Items.'); return;
    }
    if (!workItemsAvailability(installed.data)) { stones.setItems([]); notice.textContent = t('work_items.unavailable', 'Unavailable.'); return; }
    const all = [...new Map(results.flatMap((result, index) => (result.data.items || [])
      .map((item) => [item.id, { ...item, team: result.data.team || teams[index] }]))).values()];
    stones.setItems(agent ? all.filter((item) => item.holder === `agent:${agent}`) : all, all);
    notice.textContent = '';
  }
  const stop = subscribe(() => { if (entered) void refresh(); });
  return {
    el: surface.el,
    show: () => { entered = true; void refresh(); },
    leave: () => { entered = false; read?.abort(); },
    destroy: () => { entered = false; read?.abort(); stop(); stones.destroy(); },
  };
}
