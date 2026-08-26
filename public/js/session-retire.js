/* part of the ronin-cowork client — see js/README.md */
import { archiveSession, deleteSession } from './api.js';
import { sheet, toast } from './ui.js';
import { t } from './lexicon.js';

/** The tile trash boundary: exactly the two lifecycle choices, dismissible by Escape/scrim. */
export function retireSession(name, tileIndex, onDone) {
  const dlg = sheet({ id: `endsession-${tileIndex}`, cls: 'end-session-card', label: t('retire.sheet', 'Retire {name}', { name }) });
  const title = document.createElement('h2');
  title.textContent = name;
  const copy = document.createElement('p');
  copy.textContent = t('retire.copy', 'Archive stops the session and frees its RAM, while keeping it available to rehydrate. Hard delete permanently removes its Ronin record.');
  const actions = document.createElement('div');
  actions.className = 'end-session-actions';
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.className = 'primary';
  archive.textContent = t('retire.archive', 'Archive');
  const hard = document.createElement('button');
  hard.type = 'button';
  hard.className = 'danger';
  hard.textContent = t('retire.hard_delete', 'Hard delete');
  actions.append(archive, hard);
  dlg.card.append(title, copy, actions);

  /* SAY THAT IT IS WORKING. Both buttons are disabled for the whole request — archiving
     stops a tmux session, so there is a real wait — and a greyed pair alone still does not
     tell you which one you hit or that anything is underway. The pressed button says so in
     words and puts its label back if the action fails, the same shape js/koshi.js uses for
     its restart ('restarting…'). CSS carries the rest of the answer; see
     `.end-session-actions` in style.css. */
  const finish = async (pressed, action, failure, pending) => {
    const buttons = [...actions.querySelectorAll('button')];
    const was = pressed.textContent;
    for (const button of buttons) button.disabled = true;
    pressed.textContent = pending;
    try {
      await action();
    } catch (e) {
      toast(failure + ' — ' + e.message, false);
      for (const button of buttons) button.disabled = false;
      pressed.textContent = was;
      return;
    }
    dlg.close();
    dlg.el.remove();
    await onDone();
  };
  archive.addEventListener('click', () => void finish(archive, () => archiveSession(name), 'could not archive it', 'archiving…'));
  hard.addEventListener('click', () => void finish(hard, () => deleteSession(name), 'could not hard delete it', 'deleting…'));
  dlg.open();
}
