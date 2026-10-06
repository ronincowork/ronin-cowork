/* part of the ronin-cowork client — see js/README.md */
/**
 * NEXT — the temporary root of the new workbench: one door per tenant, and under each the
 * names it can open, from the one collection reading. A tenant not yet standing shows its
 * door closed. Lives until the four tenants replace Ronin Home's three doors; then this
 * file, its route and Home's Next link go in one commit.
 */
import { t } from './lexicon.js';
import { createSenmaida } from './senmaida.js';
import { createThemeToggle } from './theme-toggle.js';
import { readCollection } from './collection-reading.js';
import { workbenchLaunchUrl } from './workspace.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

function DOORS() {
  return [
    { key: 'collections', glyph: '⛩', name: t('collections.title', 'Collections'), is: t('next.collections_is', 'Find, add and reassign work') },
    { key: 'team-next', glyph: '人人', name: t('campaign_home.team', 'Team'), is: t('next.team_is', 'A Team: its Agents, Commons and board') },
    { key: 'board', glyph: '卜', name: t('next.board', 'Board'), is: t('next.board_is', 'A board: its items and who holds them') },
    { key: 'workspace', glyph: '⌂', name: t('next.workspace', 'Workspace'), is: t('next.workspace_is', 'A folder: the Teams and boards in it') },
  ];
}

/** Pure: the four doors with their rows from the reading; a door not in `standing` is closed. */
export function nextDoors(reading = {}, standing = []) {
  const up = new Set(standing);
  const teams = (Array.isArray(reading.teams) ? reading.teams : []).filter((row) => !row.holding);
  const boards = Array.isArray(reading.boards) ? reading.boards : [];
  const roots = Array.isArray(reading.roots) ? reading.roots : [];
  // Unfiled is the board with no Team; it goes last.
  const ordered = [...boards].sort((a, b) => Number(!(a.teams || []).length) - Number(!(b.teams || []).length));
  const rows = {
    collections: [],
    'team-next': teams.map((row) => ({ param: row.name, label: String(row.title || '').trim() || row.name })),
    board: ordered.map((row) => ({ param: row.id, label: row.title || row.id })),
    workspace: roots.map((row) => ({ param: row.name, label: row.name })),
  };
  return DOORS().map((door) => ({ ...door, standing: up.has(door.key), rows: rows[door.key] }));
}

export function createNextHome({ standing = [] } = {}) {
  const themeToggle = createThemeToggle();
  const root = el('main', 'ch-view nx-view');
  root.append(createSenmaida('page', 'ch-horizon'));
  const frame = el('div', 'ch-frame');
  const doors = el('div', 'ch-doors');
  doors.dataset.count = '4';
  frame.append(doors);
  root.append(frame);
  let ctx = null;
  let entered = false;
  let reading = null;

  const go = (event, destination, param = '') => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    ctx?.navigate(destination, param ? { param } : {});
  };
  function paint(data = {}) {
    doors.replaceChildren();
    for (const door of nextDoors(data, standing)) {
      const card = el('section', 'ch-door nx-door');
      card.dataset.door = door.key;
      const head = el(door.standing && !door.rows.length ? 'a' : 'div', 'nx-head');
      head.append(doorGlyph(door.glyph), el('h2', null, door.name), el('p', 'ch-is', door.is));
      if (!door.standing) {
        card.dataset.unavailable = 'true';
        card.append(head, el('p', 'ch-gate', t('next.not_standing', 'Not yet standing.')));
      } else if (!door.rows.length) {
        head.href = workbenchLaunchUrl({ destination: door.key, mode: 'overlay' });
        head.addEventListener('click', (event) => go(event, door.key));
        card.append(head);
      } else {
        const list = el('ul', 'nx-rows');
        for (const row of door.rows) {
          const item = el('li');
          const link = el('a', 'nx-row', row.label);
          link.href = workbenchLaunchUrl({ destination: door.key, param: row.param, mode: 'overlay' });
          link.addEventListener('click', (event) => go(event, door.key, row.param));
          item.append(link);
          list.append(item);
        }
        card.append(head, list);
      }
      doors.append(card);
    }
  }
  function doorGlyph(glyph) {
    const host = el('span', 'ch-glyph');
    host.setAttribute('aria-hidden', 'true');
    host.textContent = glyph;
    return host;
  }

  return {
    el: root,
    glyph: '⛩',
    title: () => t('next.title', 'Next'),
    header: { actions: [themeToggle] },
    enter: (context) => {
      ctx = context;
      entered = true;
      paint();
      reading?.abort();
      const controller = new AbortController(); reading = controller;
      void readCollection({}, { signal: controller.signal }).then((result) => {
        if (!entered || controller.signal.aborted || !result.ok) return;
        paint(result.data || {});
      });
    },
    leave: () => { entered = false; reading?.abort(); },
    destroy: () => { entered = false; reading?.abort(); ctx = null; },
  };
}
