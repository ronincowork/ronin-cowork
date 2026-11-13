/* part of the ronin-cowork client — see js/README.md */
import { archiveSession, startSessionShutdown } from './api.js';
import { confirmDialog, sheet, toast } from './ui.js';
import { t } from './lexicon.js';
import { renew, store } from './store.js';

/**
 * One shutdown: the POST starts it, and each phase arrives as {t:'shutdown', id, ...} until
 * it is complete or failed; nothing polls. The socket can go silent — a dropped connection
 * loses the pushes sent while it was down — so a reopen asks for the state on the socket
 * ({t:'want', resource:'shutdown', id}) and it arrives like any other phase; an overall
 * deadline gives the controls back if the answer never comes.
 */
export function runShutdown(name, {
  requestBody,
  start = startSessionShutdown,
  want = (id) => store.send({ t: 'want', resource: 'shutdown', id }),
  listen = (fn) => store.listen('shutdown', fn),
  onOpen = (fn) => store.onOpen(fn),
  onProgress = () => {},
  later = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle),
  timeoutMs = requestBody?.mode === 'hard_delete' ? 125_000 : 35_000,
} = {}) {
  onProgress({ state: 'running', phase: 'resolving_agent', message: 'Resolving Agent…' });
  return new Promise((resolve, reject) => {
    let id = null;
    const early = []; // pushes that land before the POST has named the shutdown
    const end = (settle) => { stopPush(); stopOpen(); cancel(deadline); settle(); };
    const step = (state) => {
      onProgress(state);
      if (state.state === 'complete') end(() => resolve(state));
      else if (state.state !== 'running') end(() => reject(new Error(state.error || 'safe shutdown failed')));
    };
    const stopPush = listen((message) => { if (id === null) early.push(message); else if (message.id === id) step(message); });
    const stopOpen = onOpen(() => { if (id !== null) want(id); });
    const deadline = later(() => end(() => reject(new Error('shutdown timed out; the Agent and any remaining desks were left available — try again'))), timeoutMs);
    Promise.resolve(start(name, requestBody)).then((started) => {
      id = started.id;
      step(started);
      for (const message of early.splice(0)) if (message.id === id) step(message);
    }, (error) => end(() => reject(error)));
  });
}

export function createSubmitGate() {
  let pending = false;
  return async (action) => {
    if (pending) return false;
    pending = true;
    try { await action(); }
    finally { pending = false; }
    return true;
  };
}

/** The tile trash boundary: exactly the two lifecycle choices, dismissible by Escape/scrim. */
export function retireSession(name, retirementId, onDone = () => {}) {
  const submit = createSubmitGate();
  // Dismissal removes the node, not just the `open` class: ^C raises this sheet as
  // readily as × does, and a scrim-tapped one left in the body would stack a dead
  // `.ui-sheet` per press — including the `.ui-sheet.open` probe メ's Escape rule reads.
  // Tile.kill reads the node's presence to keep one sheet per tile.
  const dlg = sheet({
    id: `endsession-${retirementId}`,
    cls: 'end-session-card',
    label: t('retire.sheet', 'Retire {name}', { name }),
    onClose: () => dlg.el.remove(),
  });
  const title = document.createElement('h2');
  title.textContent = name;
  const copy = document.createElement('p');
  copy.textContent = t('retire.copy', 'Archive is resumable and leaves desks alone. Delete safely closes only clean, handed-in desks. Hard Delete irreversibly removes the Agent and every owned desk after preserving destructive evidence.');
  const progress = document.createElement('p');
  progress.className = 'end-session-progress';
  progress.setAttribute('role', 'status');
  progress.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div');
  actions.className = 'end-session-actions';
  const archive = document.createElement('button');
  archive.type = 'button';
  archive.className = 'primary';
  archive.textContent = t('retire.archive', 'Archive');
  const safeDelete = document.createElement('button');
  safeDelete.type = 'button';
  safeDelete.textContent = t('retire.shutdown', 'Delete');
  const destructive = document.createElement('button');
  destructive.type = 'button';
  destructive.className = 'danger';
  destructive.textContent = t('retire.hard_delete', 'Hard Delete');
  actions.append(archive, safeDelete, destructive);
  dlg.card.append(title, copy, progress, actions);

  /* SAY THAT IT IS WORKING. Both buttons are disabled for the whole request — archiving
     stops a tmux session, so there is a real wait — and a greyed pair alone still does not
     tell you which one you hit or that anything is underway. The pressed button says so in
     words and puts its label back if the action fails, the same shape js/koshi.js uses for
     its restart ('restarting…'). CSS carries the rest of the answer; see
     `.end-session-actions` in style.css. */
  /* THE ITEM CHECK (src/routes/sessions-api.ts heldItemsRefusal), a nudge, never a wall: every
     way out is refused once while the Agent holds work In Progress or In Review it has not
     flagged. The refusal names the items, and the kit's confirm says the nudge in one line; yes sends the same action again with ignore_items, and
     the pressed button says it is working again. Each item still goes to the Team, flagged. */
  const closeAnyway = (held) => confirmDialog({
    label: t('retire.items_label', 'Work still held'),
    message: t('retire.items_confirm', '{name} holds {items}, not flagged: finish or flag it and hand in its desks first, or close anyway; it goes to the Team flagged, its lead told.', {
      name, items: held.map((item) => `${item.id} (${item.status})`).join(', '),
    }),
    confirmLabel: t('retire.items_anyway', 'Close anyway'),
    cancelLabel: t('retire.items_keep', 'Keep it open'),
  });
  const finish = async (pressed, action, failure, pending) => {
    const buttons = [...actions.querySelectorAll('button')];
    const was = pressed.textContent;
    for (const button of buttons) button.disabled = true;
    pressed.textContent = pending;
    progress.textContent = t('retire.resolving', 'Resolving Agent…');
    try {
      try {
        await action({ ignoreItems: false });
      } catch (e) {
        if (!e.itemsHeld) throw e;
        progress.textContent = e.message;
        if (!await closeAnyway(e.itemsHeld)) {
          for (const button of buttons) button.disabled = false;
          pressed.textContent = was;
          return;
        }
        pressed.textContent = pending;
        progress.textContent = t('retire.resolving', 'Resolving Agent…');
        await action({ ignoreItems: true });
      }
    } catch (e) {
      // It ended by itself and this page never heard: say so, and take a fresh feed, which
      // is sent the list whole and drops the row.
      if (e.gone) {
        toast(t('retire.already_ended', '{name} had already ended; its row is removed.', { name }), true);
        renew({ force: true });
        dlg.close();
        await onDone();
        return;
      }
      toast(failure + ' — ' + e.message, false);
      progress.textContent = e.message;
      for (const button of buttons) button.disabled = false;
      pressed.textContent = was;
      return;
    }
    dlg.close();
    await onDone();
  };
  const safeShutdown = async ({ ignoreItems }) => {
    const state = await runShutdown(name, {
      ...(ignoreItems ? { requestBody: { ignore_items: true } } : {}),
      onProgress: (value) => { progress.textContent = value.message; },
    });
    toast(state.message, true);
  };
  archive.addEventListener('click', () => void submit(() => finish(archive, (opts) => archiveSession(name, opts), t('retire.archive_failed', 'could not archive it'), t('retire.archiving', 'archiving…'))));
  safeDelete.addEventListener('click', () => void submit(() => finish(safeDelete, safeShutdown, t('retire.shutdown_failed', 'could not safely shut it down'), t('retire.shutting_down', 'starting shutdown…'))));
  destructive.addEventListener('click', () => {
    const exact = `HARD DELETE ${name} AND OWNED DESKS`;
    if (!confirm(t('retire.hard_delete_confirm', 'Hard Delete is irreversible. Delete Agent {name} and every desk it owns, including dirty and unhanded work? Destructive evidence will be preserved.\n\nConfirm exact targets: {exact}', { name, exact }))) return;
    void submit(() => finish(destructive, async ({ ignoreItems }) => {
      const state = await runShutdown(name, {
        requestBody: { mode: 'hard_delete', confirmation: exact, ...(ignoreItems ? { ignore_items: true } : {}) },
        onProgress: (value) => { progress.textContent = value.message; },
      });
      toast(state.message, true);
    }, t('retire.hard_delete_failed', 'could not hard delete it'), t('retire.hard_deleting', 'starting Hard Delete…')));
  });
  dlg.open();
}
