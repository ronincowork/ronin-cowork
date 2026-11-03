/* part of the ronin-cowork client — see js/README.md */
/**
 * THE EPICS WORKBENCH'S SURFACES (owner, 2026-11-02; KAN-187, KAN-206). Epics are work items, the
 * level-1 parents (work-items.ts). Tilespace 1 holds a stone per Epic (`createEpicStones`), each
 * its title only; every Epic is also a selector card. Dragged into a tilespace, a stone places
 * that Epic there (`createEpicRecord`).
 *
 * AN EPIC PRESSED (KAN-206, the first round of WIP/EPICS_VIEW_PLAN.md; reworked on the owner's
 * word, no side rail): the stones stay at rest and the pressed Epic opens in Tilespace 2 as its
 * worksurface (`createEpicRecord`), as a dragged stone or its selector card places it anywhere.
 * The worksurface: one line of where it comes from (its Jira key, or Ronin only) and who holds
 * it; one row of statuses, a hidden one carrying its count, an out one plain, an empty one not
 * shown; under it, each status that is out as its items' cards, In Review out on arrival. A
 * card is its title, whole, and its holder, which opens that Agent (or Team); pressed, it
 * opens in place to the statuses as buttons (the current one marked), the objective and the
 * comments. No history, no Jira fields.
 *
 * The Epics and their items are the store's pushed `epics` and `epicItems` (js/store.js;
 * KAN-190), narrowed to the Campaign this tab looks at (`createEpicsRead`). Nothing asks the
 * server on a push: the only requests are a pressed item's whole reading and a status change.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createPhalanx } from './phalanx.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { subscribe as hear } from './store.js';
import { SURFACE_DRAG } from './workbench.js';
import { WORKBENCH_TYPES } from './workbench-catalog.js';
import { openWorkspaceTab, reserveWorkspaceTab } from './workspace.js';

/** The statuses in workflow order (Jira's, the store's default); a space's own extra names follow. */
export const STATUSES = ['To Do', 'In Progress', 'In Review', 'Done'];
export const statusesOf = (items) => [...STATUSES, ...new Set((items || []).map((item) => item.status).filter((status) => status && !STATUSES.includes(status)))];

/** The Epics of a reading: its level-1 items, by title. */
export const epicsOf = (items) => (items || []).filter((item) => item.level === 1)
  .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)));

/** Who works an item: { kind: 'agent' | 'team', name }, or null when nobody holds it. */
export function holderOfItem(item) {
  const [kind, ...rest] = String(item?.holder || '').split(':');
  const name = rest.join(':');
  return (kind === 'agent' || kind === 'team') && name ? { kind, name } : null;
}

/** The bench's Epics and their items: the pushed `epics` and `epicItems` of the Campaign this
 * tab looks at (all, when none). Each `subscribe` hears them now and on every push that moved them. */
export function createEpicsRead(campaignId) {
  let pushed = [];
  let under = [];
  const mine = (item) => !campaignId() || item.campaign_id === campaignId();
  return {
    list: () => epicsOf(pushed.filter(mine)),
    items: (epicId) => under.filter((item) => item.epic === epicId)
      .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id))),
    subscribe: (listener) => {
      const stopItems = hear('epicItems', (next) => { under = Array.isArray(next) ? next : []; listener(); });
      const stopEpics = hear('epics', (next) => { pushed = Array.isArray(next) ? next : []; listener(); });
      return () => { stopItems(); stopEpics(); };
    },
  };
}

/** The selector's Epics: one card each, drawn onto a tile as that Epic. */
export const epicOffers = (epicsRead) => epicsRead.list().map((epic) => ({ key: epic.id, label: epic.title || epic.id }));

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
};

/** Open the holder's own workbench in a new tab: an Agent's, or a Team's. */
function openHolder({ kind, name }) {
  const tab = reserveWorkspaceTab();
  return openWorkspaceTab(kind === 'team' ? 'team' : 'agent', name, tab);
}

/** The Epic stones, at rest; pressed, the Epic opens in Tilespace 2. */
export function createEpicStones({ epicsRead, workbench }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('epics.title', 'Epics'), className: 'setup-surface epics-records' });
  const messages = el('div', 'pr-status');
  messages.setAttribute('role', 'status');
  const say = (message) => {
    messages.replaceChildren();
    if (message) messages.append(el('div', 'pr-empty', message));
  };
  const stones = createPhalanx({ className: 'epic-stones' });
  stones.mount(out.content, { before: [messages] });
  let drawn = null;
  function paint() {
    const epics = epicsRead.list();
    say(epics.length ? '' : t('epics.none', 'No Epics yet.'));
    const next = epics.map((epic) => {
      const label = epic.title || epic.id;
      return {
        id: epic.id, label,
        secondary: epic.external?.jira?.key || t('epics.ronin_only', 'Ronin only'),
        action: () => workbench?.place?.(WORKBENCH_TYPES.epicRecord, 'workspace2', { key: epic.id }),
        draggable: true,
        events: { dragstart: (event) => {
          event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.epicRecord, detail: { key: epic.id } }));
          event.dataTransfer.setData('text/plain', label);
          event.dataTransfer.effectAllowed = 'copy';
        } },
      };
    });
    const signature = JSON.stringify(next.map(({ id, label, secondary }) => [id, label, secondary]));
    if (signature !== drawn) { drawn = signature; stones.setItems(next); }
    workbench?.refreshSelector?.();
  }
  let stop = null;
  return {
    el: out.el,
    show: () => { stop ??= epicsRead.subscribe(paint); paint(); },
    destroy: () => { stop?.(); stop = null; stones.destroy(); },
  };
}

/** One Epic's worksurface: its statuses in one row, the items of each status out as cards. */
export function createEpicRecord(key, { epicsRead }) {
  const { createSurface, setSurfaceState } = WorkspaceKit.primitives;
  const out = createSurface({ label: key, className: 'setup-surface epics-record' });
  const shown = new Set(['In Review']); // the statuses out, kept while the surface lives
  const open = new Set(); // the cards opened in place
  const whole = new Map(); // id -> { seen, item }: an opened card's whole reading, read again only when it moved

  const holderButton = (item) => {
    const holder = holderOfItem(item);
    if (!holder) return el('span', 'epic-holder is-none', t('epics.unassigned', 'Unassigned'));
    const button = el('button', 'epic-holder', `@${holder.name}`);
    button.type = 'button';
    button.title = holder.kind === 'team' ? t('epics.open_team', 'Open this Team') : t('epics.open_agent', 'Open this Agent');
    button.addEventListener('click', () => openHolder(holder));
    return button;
  };

  /** An opened card: the statuses as buttons, then the objective and the comments. */
  function body(item) {
    const host = el('div', 'epic-card-body');
    const moves = el('div', 'epic-statuses');
    moves.setAttribute('role', 'group');
    moves.setAttribute('aria-label', t('epics.status', 'Status'));
    const answer = el('p', 'epic-answer');
    answer.setAttribute('role', 'status');
    for (const status of statusesOf([item])) {
      const move = el('button', 'cv-pill epic-status', status);
      move.type = 'button';
      move.setAttribute('aria-pressed', String(status === item.status));
      move.addEventListener('click', async () => {
        if (status === item.status) return;
        for (const button of moves.children) button.disabled = true;
        const result = await request(`/api/work-items/${encodeURIComponent(item.id)}/transition`, { method: 'POST', json: { status } });
        // The push that follows a write redraws the cards; until then the answer says what happened.
        answer.textContent = result.ok ? `${item.id}: ${item.status} → ${status}` : result.message;
        answer.dataset.state = result.ok ? '' : 'failed';
        for (const button of moves.children) button.disabled = false;
      });
      moves.append(move);
    }
    const reading = el('div', 'epic-card-reading');
    host.append(moves, answer, reading);
    const draw = (full) => {
      reading.replaceChildren();
      if (full.objective) reading.append(el('p', 'epic-objective', full.objective));
      for (const comment of (full.comments || []).slice(-3)) {
        const row = el('div', 'epic-comment');
        row.append(el('small', '', `${comment.by || ''} · ${String(comment.at || '').slice(0, 10)}`), el('p', '', comment.text || ''));
        reading.append(row);
      }
    };
    const seen = JSON.stringify(item);
    const kept = whole.get(item.id);
    if (kept?.seen === seen) draw(kept.item);
    else void request(`/api/work-items/${encodeURIComponent(item.id)}`, { cache: 'no-store' }).then((result) => {
      if (!result.ok || !reading.isConnected) return;
      whole.set(item.id, { seen, item: result.data.item });
      draw(result.data.item);
    });
    return host;
  }

  function card(item) {
    const node = el('article', `epic-card${item.flagged ? ' is-flagged' : ''}`);
    node.dataset.item = item.id;
    const title = el('button', 'epic-card-title', item.title || item.id);
    title.type = 'button';
    title.setAttribute('aria-expanded', String(open.has(item.id)));
    title.addEventListener('click', () => { if (!open.delete(item.id)) open.add(item.id); paint(); });
    const meta = el('div', 'epic-card-meta');
    meta.append(holderButton(item), el('span', 'epic-card-key', item.jira || item.id));
    node.append(title, meta);
    if (open.has(item.id)) node.append(body(item));
    return node;
  }

  function paint() {
    const epic = epicsRead.list().find((row) => row.id === key);
    if (!epic) { out.content.replaceChildren(); setSurfaceState(out.el, 'empty', t('epics.gone', 'This Epic is no longer here.')); return; }
    setSurfaceState(out.el, null, '');
    out.header.title.textContent = epic.title || epic.id;
    const items = epicsRead.items(epic.id);
    const source = el('div', 'epic-source');
    source.append(el('span', '', epic.external?.jira?.key ? `Jira ${epic.external.jira.key}` : t('epics.ronin_only', 'Ronin only')), holderButton(epic));
    const row = el('div', 'epic-filter');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', t('epics.status', 'Status'));
    const groups = el('div', 'epic-groups');
    for (const status of statusesOf(items)) {
      const at = items.filter((item) => item.status === status);
      const isOut = shown.has(status);
      if (!at.length && !isOut) continue;
      const chip = el('button', 'epic-chip', status);
      chip.type = 'button';
      chip.dataset.status = status;
      chip.setAttribute('aria-pressed', String(isOut));
      if (!isOut) chip.append(el('span', 'epic-count', String(at.length)));
      chip.addEventListener('click', () => { if (!shown.delete(status)) shown.add(status); paint(); });
      row.append(chip);
      if (!isOut) continue;
      const section = el('section', 'epic-group');
      section.dataset.status = status;
      section.append(el('h3', 'epic-group-heading', status));
      const cards = el('div', 'epic-cards');
      if (at.length) cards.append(...at.map(card));
      else cards.append(el('p', 'epic-empty', t('epics.none_here', 'Nothing here.')));
      section.append(cards);
      groups.append(section);
    }
    if (!items.length) groups.append(el('p', 'epic-empty', t('epics.no_items', 'No work items under this Epic yet.')));
    else if (!groups.children.length) groups.append(el('p', 'epic-empty', t('epics.pick', 'Pick a status to bring its items out.')));
    const scroll = out.content.scrollTop;
    out.content.replaceChildren(source, row, groups);
    out.content.scrollTop = scroll;
  }
  let stop = null;
  return {
    el: out.el,
    show: () => { stop ??= epicsRead.subscribe(paint); paint(); },
    destroy: () => { stop?.(); stop = null; },
  };
}
