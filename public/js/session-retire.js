/* part of the ronin-cowork client — see js/README.md */
import { archiveSession, deleteSession } from './api.js';
import { sheet, toast } from './ui.js';

/** The tile trash boundary: exactly the two lifecycle choices, dismissible by Escape/scrim. */
export function retireSession(name, tileIndex, onDone) {
  const dlg = sheet({ id: `endsession-${tileIndex}`, cls: 'end-session-card', label: `Retire ${name}` });
  const title = document.createElement('h2');
  title.textContent = name;
  const copy = document.createElement('p');
  copy.textContent = 'Archive stops the session and frees its RAM, while keeping it available to rehydrate. Hard delete permanently removes its Ronin record.';
  const actions = document.createElement('div');
  actions.className = 'end-session-actions';
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.className = 'primary';
  archive.textContent = 'Archive';
  const hard = document.createElement('button');
  hard.type = 'button';
  hard.className = 'danger';
  hard.textContent = 'Hard delete';
  actions.append(archive, hard);
  dlg.card.append(title, copy, actions);

  const finish = async (action, failure) => {
    for (const button of actions.querySelectorAll('button')) button.disabled = true;
    try {
      await action();
    } catch (e) {
      toast(failure + ' — ' + e.message, false);
      for (const button of actions.querySelectorAll('button')) button.disabled = false;
      return;
    }
    dlg.close();
    dlg.el.remove();
    await onDone();
  };
  archive.addEventListener('click', () => void finish(() => archiveSession(name), 'could not archive it'));
  hard.addEventListener('click', () => void finish(() => deleteSession(name), 'could not hard delete it'));
  dlg.open();
}
