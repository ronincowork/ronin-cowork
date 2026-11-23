/* part of the ronin-cowork client — see js/README.md
 *
 * THE WORK RECORD, made visible.
 *
 * Three surfaces, one payload, no second data path:
 *   the chip    a fixed-width readout in the tile header: the items held, with their status
 *   the record  the tile's Work record: the open items held first, each with its status, flag
 *               and attachments, Done waiting for the archive counted on one line; then the
 *               objective, worktrees and Teams; the brief record by part (tegami.brief); last, the brief the Agent is told (docs/architecture/brief.md, The brief),
 *               read from GET /api/sessions/:name/brief when opened
 *   the roster  the same chip as a row per session, in the commons ⌂ Roster
 *
 * A work item mirrors Jira (owner, 2026-10-22). Everything on this side is read-only: no
 * element built in this module can touch a session.
 */
import { t } from './lexicon.js';
import { isPlanRef, planAttachment } from './plan-attachment.js';
import { renderMarkdownDocument } from './markdown-reader.js';

/** One entry of the work record's `flags` in words (KAN-776): an item's by its id and reason; the
 *  Agent's own (KAN-527, no id) by what it waits on. The work record and the tile header ⚑ say it. */
export const flagWords = (flag) => (flag.id ? `${flag.id} ${flag.why || t('head.flagged', 'Flagged')}` : ({
  no_progress: t('work_record.agent_no_progress', 'No progress for 12 min: look in its terminal'),
  asking: t('work_record.agent_asking', 'Asking you: answer in its Chat'),
  stopped: t('work_record.agent_stopped', 'Stopped: its CLI exited; Resume from its Chat'),
})[flag.why] || flag.why);

export function clampTip(s, room = 120) {
  return s.length > room ? s.slice(0, room - 1) + '…' : s;
}

/** When an item went Done: its last move there (src/work-items.ts doneSince); a row from the live
 * index (w418) has no trail, so when it last changed; else its birth. */
const doneAt = (item) => [...(item.trail || [])].reverse().find((one) => (one.op === 'status' && one.to === 'Done')
  || (one.op === 'edit' && /(^|, |; )status Done(,|;|$)/.test(one.note || '')))?.at || item.moved || item.created?.at || '';
/** The Done items of a list, newest first. */
export const doneWaiting = (items) => (items || []).filter((item) => item.status === 'Done').sort((a, b) => doneAt(b).localeCompare(doneAt(a)));
/** "Done, not yet archived: N (KAN-1, KAN-2, …)": ids only, at most eight. */
export const doneLine = (done) => t('work_record.done_waiting', 'Done, not yet archived: {n} ({ids})',
  { n: done.length, ids: done.slice(0, 8).map((item) => item.id).join(', ') + (done.length > 8 ? ', …' : '') });

/** The brief record's parts, in the order the brief reads them. */
function briefParts() {
  return [
  ['session', t('work_record.part_session', 'Session')], ['user', t('work_record.part_user', 'User')],
  ['people', t('work_record.part_people', 'People')], ['setting', t('work_record.part_setting', 'Setting')],
  ['agent', t('work_record.part_agent', 'Agent')], ['work', t('work_record.part_work', 'Work')],
  ['brief_settings', t('work_record.part_brief_settings', 'Brief settings')],
  ];
}
const filled = (value) => value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && !value.length)
  && !(typeof value === 'object' && !Array.isArray(value) && !Object.values(value).some(filled));
const words = (key) => key.replace(/_/g, ' ');
/** A stored value as one line: lists by comma; a named entry (a file added) by its name and depth;
 *  any other object its filled fields, `field value` by ·. `whole` spells a person out in full. */
export function spoken(value, whole = false) {
  if (value === true) return t('work_record.yes', 'yes');
  if (value === false) return t('work_record.no', 'no');
  if (Array.isArray(value)) return value.filter(filled).map((one) => spoken(one)).join(', ');
  if (value && typeof value === 'object') {
    if (!whole && value.name) return value.depth ? `${value.name} (${value.depth})` : value.name;
    return Object.entries(value).filter(([, field]) => filled(field)).map(([key, field]) => `${words(key)} ${spoken(field)}`).join(' · ');
  }
  return String(value);
}

/** The work record: the items held with their status, flag and attachments; then what the
 *  Agent is doing, where it works and its Teams. */
export function buildWorkRecord(letter, deskEntry = null, { openDoc = null, session = '' } = {}) {
  const box = document.createElement('div');
  box.className = 'work-record';
  if (!letter) return box;

  const section = (label, cls = '') => {
    const el = document.createElement('section');
    el.className = 'wr-section' + (cls ? ' ' + cls : '');
    const head = document.createElement('h4');
    head.textContent = label;
    el.appendChild(head);
    box.appendChild(el);
    return el;
  };
  const line = (cls, text) => Object.assign(document.createElement('p'), { className: cls, textContent: text });

  const held = section(t('work_record.items', 'Work items'), 'wr-items');
  // Its flags first, one line each (KAN-776).
  for (const flag of letter.flags || []) held.appendChild(line('wr-item wr-agent-flag', `⚑ ${flagWords(flag)}`));
  // Open items only (owner, 2026-11-05; KAN-271): Done waiting for the five-day archive is one
  // line under them, ids only, newest first, at most eight.
  const open = (letter.items || []).filter((item) => item.status !== 'Done');
  const done = doneWaiting(letter.items);
  if (open.length) {
    for (const item of open) {
      const row = document.createElement('div');
      row.className = 'wr-item' + (item.flagged ? ' flagged' : '');
      // A paired item's id is its Jira issue, opened there; any other id is text.
      const action = line('wr-action', [item.status, item.flagged ? `⚑ ${t('work_items.flagged', 'flagged')}` : ''].filter(Boolean).join(' · '));
      const id = document.createElement(item.jira_url ? 'a' : 'span');
      id.textContent = item.id;
      if (item.jira_url) { id.href = item.jira_url; id.target = '_blank'; id.rel = 'noopener'; }
      action.prepend(id, ' · ');
      row.append(line('', item.title), action);
      for (const path of item.attachments || []) {
        // The epic's plan, by name: opened through the plan read, or gone (plan-attachment.js).
        if (isPlanRef(path)) { row.appendChild(planAttachment(path, { className: 'wr-doc', campaignId: item.campaign_id, open: openDoc })); continue; }
        // Where the reader can open a document (the tile's menu), each one is a press.
        // A file kept in Jira is its link, opened there.
        const link = /^https?:\/\//.test(path);
        const doc = document.createElement(link ? 'a' : openDoc ? 'button' : 'p');
        doc.className = 'wr-doc';
        doc.textContent = decodeURIComponent(path.split('/').pop());
        doc.title = path;
        if (link) { doc.href = path; doc.target = '_blank'; doc.rel = 'noopener'; }
        else if (openDoc) { doc.type = 'button'; doc.addEventListener('click', () => openDoc(path)); }
        row.appendChild(doc);
      }
      held.appendChild(row);
    }
  } else if (!done.length) held.appendChild(line('wr-empty', t('work_record.no_items', 'No work items held.')));
  if (done.length) held.appendChild(line('wr-action wr-done', doneLine(done)));

  const task = section(t('work_record.task_at_hand', 'Task at hand'), 'wr-task');
  task.appendChild(line('', letter.objective || t('work_record.task_unstated', 'No task stated in this work record.')));
  if (letter.mandate) {
    task.appendChild(line('wr-action', [t('glossary.mandate', 'mandate'),
      [letter.mandate.reach, letter.mandate.recruit, letter.mandate.output].filter(Boolean).join(' · ')].join(' · ')));
  }

  const desks = deskEntry?.desks || [];
  if (desks.length || letter.repos?.length) {
    const checkout = section(t('work_record.worktrees', 'Worktrees'), 'wr-checkout');
    for (const item of desks.length ? desks : letter.repos) {
      const row = document.createElement('div');
      row.className = 'wr-checkout-line';
      if (item.worktree) {
        const worktree = document.createElement('strong');
        worktree.className = 'wr-worktree';
        worktree.textContent = item.worktree;
        row.appendChild(worktree);
      }
      if (item.branch) {
        const branch = document.createElement('span');
        branch.className = 'wr-branch';
        branch.textContent = t('work_record.branch', 'Branch') + ' · ' + item.branch;
        row.appendChild(branch);
      }
      if (item.repo) {
        const repo = document.createElement('span');
        repo.className = 'wr-repo';
        repo.textContent = item.repo.replace(/^.*[/:]([^/]+\/[^/]+?)(\.git)?$/, '$1');
        repo.title = item.repo;
        row.appendChild(repo);
      }
      checkout.appendChild(row);
    }
  }

  if ((letter.teams ?? []).length) {
    const context = section(t('work_record.teams', 'Teams'), 'wr-context');
    for (const entry of letter.teams) context.appendChild(line('', entry.team));
  }

  // The brief record by part (owner, 2026-11-15): what Ronin wrote at birth or the last refresh
  // and builds the brief from (tegami.brief, src/brief-record.ts). Every field with a value, as stored.
  if (letter.brief) {
    for (const [part, label] of briefParts()) {
      const value = letter.brief[part];
      if (!filled(value)) continue;
      const host = section(label, `wr-record wr-record-${part}`);
      const rows = Array.isArray(value) ? value.map((entry) => ['', entry])
        : Object.entries(value).filter(([, field]) => filled(field));
      for (const [key, field] of rows) {
        const row = line('wr-record-row', '');
        if (key) row.append(Object.assign(document.createElement('span'), { className: 'wr-record-key', textContent: words(key) }), ' ');
        row.append(Array.isArray(value) ? spoken(field, true) : spoken(field));
        host.appendChild(row);
      }
    }
  }

  // The brief, for whoever wants to see what the Agent is taught: closed until opened, then read once.
  if (session) {
    const brief = section(t('work_record.brief', 'Brief'), 'wr-brief');
    const fold = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = t('work_record.brief_show', 'What this Agent is told');
    const body = document.createElement('div');
    body.className = 'wr-brief-body';
    fold.append(summary, body);
    fold.addEventListener('toggle', async () => {
      if (!fold.open || body.childElementCount) return;
      body.append(line('wr-empty', t('docs.loading', 'loading…')));
      const res = await fetch(`/api/sessions/${encodeURIComponent(session)}/brief`, { cache: 'no-store' }).catch(() => null);
      const text = res?.ok ? await res.text() : '';
      body.replaceChildren(text ? renderMarkdownDocument(text) : line('wr-empty', t('work_record.no_brief', 'No brief for this Agent.')));
    });
    brief.appendChild(fold);
  }

  return box;
}

/** `51m`, `3h`, `2d` — short enough to sit on a roster row. */
export function humanAge(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}
