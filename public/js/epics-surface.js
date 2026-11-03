/* part of the ronin-cowork client — see js/README.md */
/**
 * THE EPICS WORKBENCH'S SURFACES (owner, 2026-11-02; KAN-187, KAN-206). Epics are work items, the
 * level-1 parents (work-items.ts). Tilespace 1 holds a stone per Epic (`createEpicStones`), each
 * its title only; every Epic is also a selector card. Dragged into a tilespace, a stone places
 * that Epic there (`createEpicRecord`).
 *
 * AN EPIC PRESSED (KAN-206, the first round of WIP/EPICS_VIEW_PLAN.md): the phalanx goes one level
 * down and the rail holds one shadow per status, each with its count, in workflow order. A
 * shadow pressed brings that status's items out as stones right after it, and pressed again puts
 * them back; In Review is out on arrival. The count lives on the shadow only. The level's
 * detail is the Epic's reading, without history. An item stone is its title and its holder;
 * pressed, its reading beside the rail: the holder, which opens that Agent (or Team), the
 * statuses as plain buttons, the current one marked, then the item's reading without history.
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
import { renderItemDetail } from './work-items-surface.js';
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

/** The Epic stones; pressed, the Epic's shadows and the items brought out. */
export function createEpicStones({ epicsRead, workbench }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('epics.title', 'Epics'), className: 'setup-surface epics-records' });
  const messages = el('div', 'pr-status');
  messages.setAttribute('role', 'status');
  const say = (message) => {
    messages.replaceChildren();
    if (message) messages.append(el('div', 'pr-empty', message));
  };
  const shown = new Set(['In Review']); // the statuses brought out, kept while the bench is open
  const whole = new Map(); // id -> { seen, item }: a pressed item's whole reading, read again only when it moved

  const itemRow = (item) => {
    const holder = holderOfItem(item);
    return {
      id: item.id, item, label: item.title || item.id,
      secondary: holder ? `@${holder.name}` : t('epics.unassigned', 'Unassigned'),
      className: `epic-item${item.flagged ? ' wi-flagged' : ''}`,
      attrs: { 'data-item': item.id, 'data-status': item.status },
    };
  };
  const shadowRow = (epic, status, items) => ({
    id: `${epic.id}::${status}`, label: status,
    state: shown.has(status) ? '' : String(items.length),
    className: `epic-shadow${shown.has(status) ? ' is-out' : ''}`,
    attrs: { 'aria-pressed': String(shown.has(status)), 'data-status': status },
    action: () => { if (!shown.delete(status)) shown.add(status); paint(); },
  });
  const epicRow = (epic) => {
    const label = epic.title || epic.id;
    const items = epicsRead.items(epic.id);
    return {
      id: epic.id, epic, label, draggable: true,
      items: statusesOf(items).flatMap((status) => {
        const at = items.filter((item) => item.status === status);
        return [shadowRow(epic, status, at), ...(shown.has(status) ? at.map(itemRow) : [])];
      }),
      events: { dragstart: (event) => {
        event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.epicRecord, detail: { key: epic.id } }));
        event.dataTransfer.setData('text/plain', label);
        event.dataTransfer.effectAllowed = 'copy';
      } },
    };
  };

  /** A pressed item: its holder, its statuses, then its reading without history. */
  function renderItem(host, item) {
    const head = el('div', 'epic-item-head');
    const holder = holderOfItem(item);
    if (holder) {
      const open = el('button', 'cv-pill epic-holder', `@${holder.name}`);
      open.type = 'button';
      open.title = holder.kind === 'team' ? t('epics.open_team', 'Open this Team') : t('epics.open_agent', 'Open this Agent');
      open.addEventListener('click', () => openHolder(holder));
      head.append(open);
    } else head.append(el('span', 'epic-holder is-none', t('epics.unassigned', 'Unassigned')));
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
        // The push that follows a write redraws the stones; until then the answer says what happened.
        answer.textContent = result.ok ? `${item.id}: ${item.status} → ${status}` : result.message;
        answer.dataset.state = result.ok ? '' : 'failed';
        for (const button of moves.children) button.disabled = false;
      });
      moves.append(move);
    }
    head.append(moves);
    const reading = el('div', 'epic-reading');
    host.append(head, answer, reading);
    const seen = JSON.stringify(item);
    const kept = whole.get(item.id);
    const draw = (full) => { reading.replaceChildren(); renderItemDetail(reading, { ...full, ...item }, { holder: holder?.name || '', history: false }); };
    if (kept?.seen === seen) { draw(kept.item); return; }
    draw(item);
    void request(`/api/work-items/${encodeURIComponent(item.id)}`, { cache: 'no-store' }).then((result) => {
      if (!result.ok || !reading.isConnected) return;
      whole.set(item.id, { seen, item: result.data.item });
      draw(result.data.item);
    });
  }

  const stones = createPhalanx({
    className: 'epic-stones',
    renderDetail: (stone, host) => {
      host.scrollTop = 0;
      if (stone.item) { renderItem(host, stone.item); return; }
      const epic = epicsRead.list().find((row) => row.id === stone.id);
      if (!epic) return;
      const key = epic.external?.jira?.key;
      host.append(el('p', 'epic-source', key ? `Jira ${key}` : t('epics.ronin_only', 'Ronin only')));
      renderItemDetail(host, epic, { holder: holderOfItem(epic)?.name || '', history: false });
    },
  });
  stones.mount(out.content, { before: [messages] });
  let drawn = null;
  function paint() {
    const epics = epicsRead.list();
    say(epics.length ? '' : t('epics.none', 'No Epics yet.'));
    const next = epics.map(epicRow);
    // A push that moves nothing a stone shows leaves the stones and an open reading alone.
    const signature = JSON.stringify(next.map(({ id, label, items }) => [id, label, items.map((row) => [row.id, row.label, row.secondary, row.state])]));
    if (signature !== drawn) { drawn = signature; stones.setItems(next); } else stones.refreshDetail();
    workbench?.refreshSelector?.();
  }
  let stop = null;
  return {
    el: out.el,
    show: () => { stop ??= epicsRead.subscribe(paint); paint(); },
    destroy: () => { stop?.(); stop = null; stones.destroy(); },
  };
}

/** One Epic whole in a tilespace: its reading, without history. */
export function createEpicRecord(key, { epicsRead }) {
  const { createSurface, setSurfaceState } = WorkspaceKit.primitives;
  const out = createSurface({ label: key, className: 'setup-surface epics-record' });
  const paint = () => {
    const epic = epicsRead.list().find((row) => row.id === key);
    out.content.replaceChildren();
    if (!epic) { setSurfaceState(out.el, 'empty', t('epics.gone', 'This Epic is no longer here.')); return; }
    setSurfaceState(out.el, null, '');
    out.header.title.textContent = epic.title || epic.id;
    renderItemDetail(out.content, epic, { holder: holderOfItem(epic)?.name || '', history: false });
  };
  let stop = null;
  return {
    el: out.el,
    show: () => { stop ??= epicsRead.subscribe(paint); paint(); },
    destroy: () => { stop?.(); stop = null; },
  };
}

