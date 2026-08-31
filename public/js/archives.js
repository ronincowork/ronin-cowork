/* part of the ronin-cowork client — see js/README.md */
import { deleteArchivedSession, fetchArchivedSessions, fetchSessions, rehydrateSession } from './api.js';
import { humanAge } from './shingo.js';
import { toast } from './ui.js';
import { t } from './lexicon.js';

/** A team tag said as a title, the same way the Cowork page falls back: parts, capitalized. */
const readableTag = (tag) => tag.split(/[_-]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

/**
 * The disk-backed Archived room — the Commons tab and the Cowork workbench's Rehydrate
 * Archived surface are the same list. Nothing here enters the live session set.
 *
 * REHYDRATE IS A BUTTON, NOT THE ROW (owner, 2026-08-31): the row used to be one big
 * click that rehydrated at once — nothing said so, and a person reading the list woke
 * sessions by accident. The row is now a reading; the one act on it is the labelled
 * button beside it. Rows sit under their Team of record — the tags the session carried
 * when it was archived — with the tagless under Ronin, which is an ordinary state.
 */
export function buildArchives(tile, host) {
  host.className = 'home-archives';
  const head = document.createElement('div');
  head.className = 'home-archived-head';
  const title = document.createElement('b');
  title.textContent = t('archives.title', 'Archived sessions');
  const count = document.createElement('span');
  head.append(title, count);
  const list = document.createElement('div');
  list.className = 'home-archive-list';
  host.append(head, list);

  let generation = 0;
  const enter = async () => {
    const mine = ++generation;
    let rows;
    try {
      rows = await fetchArchivedSessions();
    } catch {
      if (mine !== generation) return;
      count.textContent = t('archives.unavailable', 'unavailable');
      list.replaceChildren(Object.assign(document.createElement('span'), { className: 'home-empty', textContent: t('archives.read_failed', 'archive could not be read') }));
      return;
    }
    if (mine !== generation) return;
    count.textContent = String(rows.length);
    list.innerHTML = '';
    if (!rows.length) {
      list.replaceChildren(Object.assign(document.createElement('span'), { className: 'home-empty', textContent: t('archives.empty', 'no archived sessions') }));
      return;
    }
    // GROUPED BY THE TEAM OF RECORD. The first tag is the group; the rest ride the
    // detail line. Groups alphabetical, Ronin (no team) last, newest first inside.
    const groups = new Map();
    for (const item of rows) {
      const key = item.tags?.[0] ?? '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const keys = [...groups.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    for (const key of keys) {
      if (groups.size > 1 || key) {
        list.appendChild(Object.assign(document.createElement('span'), {
          className: 'home-archive-group',
          textContent: key ? readableTag(key) : t('archives.group_none', 'Ronin — no team'),
        }));
      }
      const members = groups.get(key).sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
      for (const item of members) list.appendChild(archiveRow(item, tile, enter));
    }
  };

  return { enter };
}

/** One archived session: the reading, then its two labelled acts. */
function archiveRow(item, tile, enter) {
  const row = document.createElement('div');
  row.className = 'home-archive-row';
  const info = document.createElement('div');
  info.className = 'home-archive-info';
  const name = document.createElement('b');
  name.textContent = item.name;
  const detail = document.createElement('span');
  detail.textContent = [
    item.agent,
    ...(item.tags ?? []).slice(1).map(readableTag),
    item.archived_at ? t('archives.ago', '{age} ago', { age: humanAge(Date.now() - Date.parse(item.archived_at)) }) : '',
  ].filter(Boolean).join(' · ');
  info.append(name, detail);
  const revive = document.createElement('button');
  revive.type = 'button';
  revive.className = 'home-archive-rehydrate';
  revive.textContent = t('archives.rehydrate_btn', 'Rehydrate');
  revive.title = t('archives.rehydrate', 'Rehydrate {name}', { name: item.name });
  revive.addEventListener('click', async () => {
    revive.disabled = true;
    revive.textContent = t('archives.rehydrating', 'rehydrating…');
    try {
      const liveName = await rehydrateSession(item.id);
      await fetchSessions();
      await enter();
      tile.connect(liveName);
    } catch (e) {
      revive.disabled = false;
      revive.textContent = t('archives.rehydrate_btn', 'Rehydrate');
      toast('could not rehydrate it — ' + e.message, false);
    }
  });
  const hard = document.createElement('button');
  hard.type = 'button';
  hard.className = 'home-archive-delete';
  hard.textContent = '\u{1F5D1}';
  hard.setAttribute('aria-label', t('archives.delete_aria', 'Permanently delete archived session {name}', { name: item.name }));
  hard.title = t('archives.delete_title', 'Hard delete this archive');
  hard.addEventListener('click', async () => {
    if (!confirm(t('archives.delete_confirm', 'Hard delete archived session "{name}"? Its saved Ronin record cannot be rehydrated after this.', { name: item.name }))) return;
    hard.disabled = true;
    try {
      await deleteArchivedSession(item.id);
      await enter();
    } catch (e) {
      hard.disabled = false;
      toast('could not hard delete the archive — ' + e.message, false);
    }
  });
  row.append(info, revive, hard);
  return row;
}
