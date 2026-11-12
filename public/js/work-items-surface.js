/* Work Items: a reading surface over the Jira-shaped work items, as phalanx stones grouped by
 * parent (epic, then its items, then subtasks). Changes go through the item tool. */
import { WorkspaceKit } from './workspace-kit.js';
import { carryItem } from './team-drag.js';
import { createPhalanx } from './phalanx.js';
import { membersOfTeam, subscribe } from './team-controller.js';
import { request } from './request.js';
import { subscribe as hear } from './store.js';
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { createStep } from './form-steps.js';
import { kindMark } from './tile-island.js';
import { isPlanRef, planAttachment } from './plan-attachment.js';

export const WORK_ITEMS_TYPE = 'work-items';
/** Jira's flag: an impediment, marked the same way on every surface. */
export const FLAG_MARK = '⚑';

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag); out.className = cls; out.textContent = text; return out;
};

/** A Team's lead, from the Team's members as the page reads them; '' when it has none. */
export const teamLead = (team) => membersOfTeam(team).find((member) => member.team_lead)?.name || '';

/** One holder in words (owner via pm_lead, w299): an Agent is "@<agent>"; a Team is "Team <name>
 * (lead <lead>)", so a Team's item never reads as its lead's own. `holder` is { kind, name } or a
 * label (team:<name>, agent:<name>). The one wording: the reader, the stones, the Epic cards and
 * Waiting on you (epics-surface.js holderButton) all say a holder this way. */
export function holderWords(holder, lead = null) {
  const one = typeof holder === 'string' ? (() => { const [kind, ...rest] = holder.split(':'); return rest.length ? { kind, name: rest.join(':') } : { kind: 'agent', name: kind }; })() : holder;
  if (!one?.name) return '';
  if (one.kind === 'workspace') return t('work_items.workspace_held', 'Workspace {workspace}', { workspace: one.name });
  if (one.kind !== 'team') return `@${one.name}`;
  const led = lead ?? teamLead(one.name);
  return led ? t('work_items.team_held_by', 'Team {team} (lead {lead})', { team: one.name, lead: led }) : t('work_items.team_held', 'Team {team}', { team: one.name });
}

/** Who holds an item, in words: every holder when there are several (`held_by`, the item read's
 * labels), else the one it is found on; '' when nobody holds it. `leadName` names the lead of
 * the Team it is read under, when the caller knows it better than the page. */
export const holderOf = (item, leadName = '') => [...new Set(Array.isArray(item?.held_by) && item.held_by.length ? item.held_by : [item?.holder].filter(Boolean))]
  .map((label) => holderWords(label, String(label).startsWith('team:') && leadName ? leadName : null)).filter(Boolean).join(', ');

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
      secondary: owner,
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

/** An item's hand-in as one line of steps, each a word and a time (owner, KAN-311): not yet
 * promoted, "Handed in by item_pills 2026-11-05 10:33 · on team line · with the lead"; promoted,
 * "… · on team line · promoted to dev 10:34" in place of "with the lead"; '' when it was never
 * handed in. The last hand-in counts; promoted only when that promotion came after it (the
 * island's handInSignal, tile-island.js). "· live" is added by the reader once the promotion's
 * receipt says it restarted and passed health (`promotionToCheck`, /api/promotions). */
export function handInRecord(item) {
  const last = (Array.isArray(item?.hand_ins) && item.hand_ins.at(-1)) || item?.handed_in || null;
  if (!last?.at) return '';
  const steps = [t('work_items.handed_in_by', 'Handed in by {who} {at}', { who: last.by || '—', at: when(last.at) }), t('work_items.on_team_line', 'on team line')];
  if (!(item.on_dev?.at && item.on_dev.at >= last.at)) return [...steps, t('work_items.with_lead', 'with the lead')].join(' · ');
  const at = when(item.on_dev.at);
  return [...steps, t('work_items.promoted_at', 'promoted to dev {at}', { at: at.slice(0, 10) === when(last.at).slice(0, 10) ? at.slice(11) : at })].join(' · ');
}

/** The promotion whose receipt says whether the hand-in went live: the one that put this hand-in on dev, or ''. */
export function promotionToCheck(item) {
  const last = (Array.isArray(item?.hand_ins) && item.hand_ins.at(-1)) || item?.handed_in || null;
  return last?.at && item?.on_dev?.at >= last.at ? String(item.on_dev.promotion || '') : '';
}

/** Where an item started (w299): "from Jira (<reporter>)" when Jira made it (created.by
 * jira:<user>), else "Ronin (<who>)"; '—' when the reading does not say. */
export function originWords(item) {
  const by = String(item?.created?.by || '');
  if (!by) return '—';
  if (by.startsWith('jira:')) return t('work_items.from_jira', 'from Jira ({who})', { who: String(item.jiraFields?.Reporter || by.slice(5)).replace(/^jira:/, '') });
  return t('work_items.from_ronin', 'Ronin ({who})', { who: by });
}

/** The comment headed "Handed in: " (src/work-items.ts HANDED_IN): what the user can try. */
export const HANDED_IN = 'Handed in: ';
/** The item's last Handed in comment, or null. */
export const handedInComment = (item) => [...(item?.comments || [])].reverse().find((comment) => String(comment.text || '').startsWith(HANDED_IN)) || null;

/** Which sections of an item's reading are open, kept for the page's life so a fold stays
 * where the owner left it from one item to the next. Done starts folded. */
const FOLDS = new Map([['done', false]]);
const isDone = (item) => /done|closed|resolved|complete/i.test(String(item?.status || ''));

/** One item's reading, in the launch forms' format (owner, 2026-11-05): a head with the kind's
 * symbol, the title and the key, then label-left steps — what the user reads first, the
 * Objective and the Handed in note (ITEM_HANDOVER), then Status (an ERABI question that moves
 * the item: the work-item routes' transition), Details, Subtasks, Done (the Subtasks that are,
 * owner w297), Comments (the others, folded, and a box: the comment route, whose notice reaches
 * the Agents holding the item), Attachments (each opens), Links and History (`history: false`
 * leaves it out: the Epics workbench, KAN-206). Every step folds with the form steps' own fold
 * (form-steps.js), showing its one-line answer folded. Every size is a form token. */
export function renderItemDetail(host, item, { holder = '', openAttachment = null, history = true, children = [], openChild = null, onClose = null } = {}) {
  const form = el('div', 'ntf-form wi-form');
  const head = el('header', 'wi-head');
  const key = el('p', 'wi-key');
  const sayKey = (status) => { key.textContent = [item.jira || item.id, item.kind, status, item.flagged ? `${FLAG_MARK} ${t('work_items.flagged', 'flagged')}` : ''].filter(Boolean).join(' · '); };
  sayKey(item.status);
  const words = el('div', 'wi-head-words');
  words.append(el('h2', 'wi-title', item.title || item.id), key);
  head.append(kindMark(item.kind), words);
  // EXPAND AND MINIMIZE (owner, 2026-11-12, KAN-431): where a bar opens into this reading, the bar
  // goes and this head stands for it. Pressed, it minimizes, as does the tile header's own
  // minimize mark (tilehead.js minimizeBtn, the − in a box) at its end.
  if (onClose) {
    head.classList.add('wi-head-closes');
    head.tabIndex = 0;
    head.setAttribute('role', 'button');
    head.setAttribute('aria-expanded', 'true');
    head.title = t('work_items.minimize', 'Minimize');
    head.addEventListener('click', () => onClose());
    head.addEventListener('keydown', (event) => { if (event.target === head && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClose(); } });
    const minimize = el('button', 'window-control minimize', '−');
    minimize.type = 'button';
    minimize.title = t('work_items.minimize', 'Minimize');
    minimize.setAttribute('aria-label', minimize.title);
    minimize.addEventListener('click', (event) => { event.stopPropagation(); onClose(); });
    head.append(minimize);
  }
  form.append(head);
  /** A folding step: `id` keys its fold, `meta()` is its folded answer. */
  const step = (id, title, meta, ...nodes) => {
    const one = createStep({ key: id, title, onToggle: () => { FOLDS.set(id, !(FOLDS.get(id) ?? true)); paint(); } });
    const paint = () => one.setCollapsed(!(FOLDS.get(id) ?? true), meta(), true);
    one.body.append(...nodes);
    paint();
    form.append(one.el);
    return { ...one, paint };
  };

  // What the user reads first: what done looks like, and what to try.
  if (item.objective) step('objective', t('work_items.objective', 'Objective'), () => item.objective.split('\n')[0], el('p', 'wi-objective', item.objective));
  const handed = handedInComment(item);
  // LOOK AT (owner, 2026-11-12, KAN-429): straight after the Objective, the hand-in note in full,
  // wrapped — what the owner should look at. Handed in below keeps only who, when and the promotion.
  if (handed) step('look_at', t('work_items.look_at', 'Look at'), () => handed.text.slice(HANDED_IN.length).split('\n')[0],
    el('p', 'wi-objective wi-handed-in', handed.text.slice(HANDED_IN.length)), el('small', 'wi-when', `${handed.by || ''} · ${when(handed.at)}`));
  // The hand-in itself (owner, 2026-11-05: "the pill has the hand in status but it's not in the
  // item overlay"): who handed it in and when, and the promotion that put it on dev, from the
  // item's own record — the same facts the island's pill marks. Its note is Look at, above.
  const record = handInRecord(item);
  if (record) {
    const line = el('p', 'wi-text wi-handin', record);
    // Live: that promotion restarted and passed health (its ledger receipt); a --no-restart one never reads live.
    const promotion = promotionToCheck(item);
    if (promotion) void request(`/api/promotions/${encodeURIComponent(promotion)}/live`, { cache: 'no-store' }).then((result) => {
      if (result.ok && result.data?.live && line.isConnected) line.textContent = `${record} · ${t('work_items.live', 'live')}`;
    });
    step('handed_in', t('work_items.handed_in', 'Handed in'), () => record, line);
  }

  // Status: any status to any status, as Jira's transition; the push that follows redraws the
  // rest of the page, and the line under the question says what happened until then.
  // FLAGGED BESIDE IT (owner, 2026-11-12, KAN-428): Jira's flag is a field, not a status, so it is
  // a switch next to the Status box, setting and clearing the flag (Add flag / Remove flag).
  let status = item.status;
  let flagged = Boolean(item.flagged);
  const answer = el('p', 'fs-step-help wi-answer');
  answer.setAttribute('role', 'status');
  let statusStep = null;
  const flaggedWords = [t('work_items.flag_on', 'Yes'), t('work_items.flag_off', 'No')];
  const question = ask([{ fields: [{ key: 'status', label: t('work_items.status', 'Status'),
    options: statusChoices(item).map((v) => ({ v, l: v })) },
  { key: 'flagged', label: t('work_items.flagged_label', 'Flagged'), switch: flaggedWords }] }], {
    value: { status, flagged }, density: 'tight',
    onChange: async ({ status: next, flagged: flag }) => {
      if (Boolean(flag) !== flagged) {
        const want = Boolean(flag);
        answer.dataset.state = '';
        answer.textContent = t('work_items.saving', 'Saving…');
        const result = await request(`/api/work-items/${encodeURIComponent(item.id)}/${want ? 'flag' : 'unflag'}`, { method: 'POST', json: {} });
        if (result.ok) { flagged = want; item.flagged = want; sayKey(status); statusStep?.paint(); answer.textContent = want ? t('work_items.now_flagged', 'Flagged') : t('work_items.now_unflagged', 'Flag removed'); }
        else { question.set('flagged', flagged); answer.dataset.state = 'failed'; answer.textContent = result.message || t('work_items.flag_failed', 'The flag did not change.'); }
        return;
      }
      if (!next || next === status) return;
      const was = status;
      answer.dataset.state = '';
      answer.textContent = t('work_items.moving', 'Moving…');
      const result = await request(`/api/work-items/${encodeURIComponent(item.id)}/transition`, { method: 'POST', json: { status: next } });
      if (result.ok) { status = next; sayKey(next); statusStep?.paint(); answer.textContent = `${was} → ${next}`; }
      else { question.set('status', was); answer.dataset.state = 'failed'; answer.textContent = result.message || t('work_items.move_failed', 'The status did not change.'); }
    },
  });
  statusStep = step('status', t('work_items.status', 'Status'), () => [status, flagged ? t('work_items.flagged_label', 'Flagged') : ''].filter(Boolean).join(' · '), question.el, answer);

  const facts = el('dl', 'wi-facts');
  for (const [label, value] of [
    [t('work_items.id', 'Id'), [item.id, item.jira && item.jira !== item.id ? item.jira : ''].filter(Boolean).join(' · ')],
    [t('work_items.kind', 'Kind'), [item.kind, item.level].filter((part) => part !== undefined && part !== null && part !== '').join(' · ')],
    [t('work_items.origin', 'Started in'), originWords(item)],
    [t('work_items.holder', 'Holder'), holder || t('work_items.nobody', 'nobody')],
    [t('work_items.priority', 'Priority'), item.priority || '—'],
    [t('work_items.parent', 'Parent'), item.parent || '—'],
    // A paired item's Jira fields, by Jira's own names.
    ...Object.entries(item.jiraFields || {}),
  ]) facts.append(el('dt', '', label), el('dd', '', value));
  step('details', t('work_items.details', 'Details'), () => [item.priority, holder].filter(Boolean).join(' · '), facts);

  // A Task's Subtasks sit under it (owner, 2026-11-05): each its symbol, key, title and status,
  // opening in the Task's place when there is somewhere to open it. The Done ones have their
  // own section, folded to begin with (w297), so the open ones and the comments stay in reach.
  const childList = (rows) => {
    const list = el('ul', 'wi-list wi-children');
    for (const child of rows) {
      const row = el('li');
      const open = el(openChild ? 'button' : 'div', 'wi-child');
      if (openChild) { open.type = 'button'; open.addEventListener('click', () => openChild(child)); }
      const words = el('span', 'wi-child-words');
      words.append(el('span', 'wi-child-title', child.title || child.id), el('span', 'wi-when', [child.jira || child.id, child.status].filter(Boolean).join(' · ')));
      open.append(kindMark(child.kind), words);
      row.append(open);
      list.append(row);
    }
    return list;
  };
  const counted = (n) => t('work_items.count', '{n}', { n });
  const open = children.filter((child) => !isDone(child));
  const done = children.filter(isDone);
  if (open.length) step('subtasks', t('work_items.subtasks', 'Subtasks'), () => counted(open.length), childList(open));
  if (done.length) step('done', t('work_items.done_n', 'Done ({n})', { n: done.length }), () => null, childList(done)); // its name carries the count;

  const section = (id, label, rows, ...after) => {
    if (!rows.length && !after.length) return null;
    const list = el('ul', 'wi-list');
    list.append(...rows);
    return { list, step: step(id, label, () => counted(list.children.length), list, ...after) };
  };
  const commentCount = (n) => `${n} ${n === 1 ? t('work_items.comment_one', 'comment') : t('work_items.comment_many', 'comments')}`;
  const commentRow = (comment) => {
    const row = el('li', 'wi-comment');
    row.append(el('small', 'wi-when', `${comment.by || ''} · ${when(comment.at)}`), el('p', 'wi-text', comment.text || ''));
    return row;
  };
  // The comment box: the work-item comment route; its notice is sent by the store to the Agents
  // holding the item (src/work-items.ts noticesOf), straight to their dialog box.
  const compose = el('div', 'wi-compose');
  const box = el('textarea', 'wi-compose-words');
  box.rows = 3;
  box.setAttribute('aria-label', t('work_items.comment_box', 'Add a comment'));
  box.placeholder = t('work_items.comment_box', 'Add a comment');
  const said = el('p', 'fs-step-help wi-answer');
  said.setAttribute('role', 'status');
  const { createAction } = WorkspaceKit.primitives;
  let comments = null;
  const post = createAction({ label: t('work_items.comment_send', 'Comment'), size: 'compact', endsEdit: true, action: async () => {
    const text = box.value.trim();
    if (!text) { box.focus(); return; }
    post.el.disabled = true;
    said.dataset.state = '';
    said.textContent = t('work_items.comment_sending', 'Sending…');
    const result = await request(`/api/work-items/${encodeURIComponent(item.id)}/comment`, { method: 'POST', json: { text } });
    post.el.disabled = false;
    if (!result.ok) { said.dataset.state = 'failed'; said.textContent = result.message || t('work_items.comment_failed', 'The comment was not added.'); return; }
    const added = result.data?.item?.comments?.at(-1) || { by: '', at: new Date().toISOString(), text };
    comments.list.append(commentRow(added));
    comments.step.paint();
    box.value = '';
    const told = result.data?.notified || [];
    said.textContent = told.length ? t('work_items.comment_told', 'Added; sent to {names}.', { names: told.map((name) => `@${name}`).join(', ') })
      : t('work_items.comment_nobody', 'Added. No Agent holds this item, so nobody was sent it.');
  } });
  compose.append(box, post.el, said);
  // The comments the Handed in note does not show, folded (KAN-259): the decisions between Agent
  // and lead are the item's record, one press away; the box stays open under them (w297).
  const folded = el('details', 'wi-comments');
  const summary = el('summary', '');
  comments = { list: el('ul', 'wi-list') };
  comments.list.append(...(item.comments || []).filter((comment) => comment !== handed).map(commentRow));
  const recount = () => { summary.textContent = commentCount(comments.list.children.length); folded.hidden = !comments.list.children.length; };
  folded.append(summary, comments.list);
  recount();
  comments.step = step('comments', t('work_items.comments', 'Comments'), () => commentCount(comments.list.children.length), folded, compose);
  const paintComments = comments.step.paint;
  comments.step.paint = () => { recount(); paintComments(); };

  section('attachments', t('work_items.attachments', 'Attachments'), (item.attachments || []).map((path) => {
    const row = el('li');
    // The epic's plan, by name: opened through the plan read, or gone (plan-attachment.js).
    if (isPlanRef(path)) { row.append(planAttachment(path, { className: 'wi-attachment', campaignId: item.campaign_id, open: openAttachment })); return row; }
    // A file kept in Jira is its link, opened there; a path opens here.
    const link = /^https?:\/\//.test(path);
    const opener = el(link ? 'a' : openAttachment ? 'button' : 'span', 'wi-attachment', decodeURIComponent(path.split('/').pop()));
    opener.title = path;
    if (link) { opener.href = path; opener.target = '_blank'; opener.rel = 'noopener'; }
    else if (openAttachment) { opener.type = 'button'; opener.addEventListener('click', () => openAttachment(path)); }
    row.append(opener);
    return row;
  }));
  section('links', t('work_items.links', 'Links'), (item.links || []).map((link) => el('li', 'wi-text', `${link.type} ${link.to}`)));
  if (history) section('history', t('work_items.history', 'History'), (item.trail || []).map((line) => el('li', 'wi-when',
    [when(line.at), line.by, line.op, [line.from, line.to].filter(Boolean).join(' → '), line.note].filter(Boolean).join(' · '))));
  host.append(form);
}

/** A phalanx of item stones with the reading as its detail. */
export function createItemPhalanx({ holder = () => '', openAttachment = null, className = '' } = {}) {
  const phalanx = createPhalanx({ grouped: true, className: `wi-phalanx ${className}`.trim(), renderDetail: ({ item }, host) => {
    // Its head minimizes it back to the stones (KAN-431).
    renderItemDetail(host, item, { holder: holder(item), openAttachment, onClose: () => phalanx.select('') });
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
    scopeSaid = scopeOf();
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
  // A RE-READ ONLY WHEN SOMETHING OF ITS OWN MOVED (owner, 2026-11-12, KAN-414): the epics push,
  // which carries every live item and moves on every item write, or this surface's scope (its
  // Teams, its Agent). A sessions push, every few seconds, moves neither, and reads nothing.
  // The phalanx then repaints only the stones whose item moved.
  const scopeOf = () => JSON.stringify(options.scope());
  let scopeSaid = null;
  const stopScope = subscribe(() => { if (!entered) return; const now = scopeOf(); if (now !== scopeSaid) void refresh(); });
  let heardItems = false; // the store hands what it holds at once; that first hand-over is not a change
  const stopItems = hear('epicItems', () => { if (heardItems && entered) void refresh(); heardItems = true; });
  const stop = () => { stopScope(); stopItems(); };
  return {
    el: surface.el,
    show: () => { entered = true; void refresh(); },
    leave: () => { entered = false; read?.abort(); },
    destroy: () => { entered = false; read?.abort(); stop(); stones.destroy(); },
  };
}
