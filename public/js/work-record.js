/* part of the ronin-cowork client — see js/README.md
 *
 * THE WORK RECORD, made visible.
 *
 * Three surfaces, one payload, no second data path:
 *   the chip    a fixed-width readout in the tile header: the items held, with their status
 *   the record  the tile's Work record: the items held first, each with its status, flag and
 *               attachments; then the objective, worktrees and Teams
 *   the roster  the same chip as a row per session, in the commons ⌂ Roster
 *
 * A work item mirrors Jira (owner, 2026-10-22). Everything on this side is read-only: no
 * element built in this module can touch a session.
 */
import { t } from './lexicon.js';

export function clampTip(s, room = 120) {
  return s.length > room ? s.slice(0, room - 1) + '…' : s;
}

/** Every attachment of the items held, once each: the tile's Docs list. */
export const heldAttachments = (letter) => [...new Set((letter?.items || []).flatMap((item) => item.attachments || []))];

/** The work record: the items held with their status, flag and attachments; then what the
 *  Agent is doing, where it works and its Teams. */
export function buildWorkRecord(letter, deskEntry = null, { openDoc = null } = {}) {
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
  if (letter.items?.length) {
    for (const item of letter.items) {
      const row = document.createElement('div');
      row.className = 'wr-item' + (item.flagged ? ' flagged' : '');
      row.append(line('', item.title),
        line('wr-action', [item.id, item.status, item.flagged ? `⚑ ${t('work_items.flagged', 'flagged')}` : ''].filter(Boolean).join(' · ')));
      for (const path of item.attachments || []) {
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
  } else held.appendChild(line('wr-empty', t('work_record.no_items', 'No work items held.')));

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
