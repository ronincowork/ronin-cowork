/* part of the ronin-cowork client — see js/README.md */
import { deleteArchivedSession, fetchArchivedSessions, fetchSessions, rehydrateSession } from './api.js';
import { humanAge } from './shingo.js';
import { toast } from './ui.js';

/** The Commons' disk-backed Archived room. Nothing here enters the live session set. */
export function buildArchives(tile, host) {
  host.className = 'home-archives';
  const head = document.createElement('div');
  head.className = 'home-archived-head';
  const title = document.createElement('b');
  title.textContent = 'Archived sessions';
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
      count.textContent = 'unavailable';
      list.innerHTML = '<span class="home-empty">archive could not be read</span>';
      return;
    }
    if (mine !== generation) return;
    count.textContent = String(rows.length);
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = '<span class="home-empty">no archived sessions</span>';
      return;
    }
    for (const item of rows) {
      const row = document.createElement('div');
      row.className = 'home-archive-row';
      const resume = document.createElement('button');
      resume.type = 'button';
      resume.className = 'home-archive-resume';
      const name = document.createElement('b');
      name.textContent = item.name;
      const detail = document.createElement('span');
      detail.textContent = [item.agent, item.archived_at ? `${humanAge(Date.now() - Date.parse(item.archived_at))} ago` : '']
        .filter(Boolean).join(' · ');
      resume.append(name, detail);
      resume.title = `Rehydrate ${item.name}`;
      resume.addEventListener('click', async () => {
        resume.disabled = true;
        try {
          const liveName = await rehydrateSession(item.id);
          await fetchSessions();
          await enter();
          tile.connect(liveName);
        } catch (e) {
          resume.disabled = false;
          toast('could not rehydrate it — ' + e.message, false);
        }
      });
      const hard = document.createElement('button');
      hard.type = 'button';
      hard.className = 'home-archive-delete';
      hard.textContent = '🗑';
      hard.setAttribute('aria-label', `Permanently delete archived session ${item.name}`);
      hard.title = 'Hard delete this archive';
      hard.addEventListener('click', async () => {
        if (!confirm(`Hard delete archived session "${item.name}"? Its saved Ronin record cannot be rehydrated after this.`)) return;
        hard.disabled = true;
        try {
          await deleteArchivedSession(item.id);
          await enter();
        } catch (e) {
          hard.disabled = false;
          toast('could not hard delete the archive — ' + e.message, false);
        }
      });
      row.append(resume, hard);
      list.appendChild(row);
    }
  };
  return { enter };
}
