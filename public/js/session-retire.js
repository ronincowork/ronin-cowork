/* part of the ronin-cowork client — see js/README.md */
import { fetchSessionShutdown, startSessionShutdown } from './api.js';
import { sheet, toast } from './ui.js';
import { t } from './lexicon.js';

export async function runShutdownPolling(name, {
  mode = 'shutdown',
  start = startSessionShutdown,
  poll = fetchSessionShutdown,
  onProgress = () => {},
  now = () => Date.now(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 30_000,
  pollTimeoutMs = 5_000,
} = {}) {
  onProgress({ state: 'running', phase: 'resolving_agent', message: 'Resolving Agent…' });
  const started = await start(name, mode);
  const deadline = now() + timeoutMs;
  let state = started;
  while (state.state === 'running') {
    onProgress(state);
    if (now() >= deadline) throw new Error('shutdown timed out; the Agent and any remaining desks were left available — try again');
    await wait(150);
    let timer;
    try {
      state = await Promise.race([
        poll(started.id),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('shutdown status check timed out; controls restored — try again')), pollTimeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  onProgress(state);
  if (state.state !== 'complete') throw new Error(state.error || 'safe shutdown failed');
  return state;
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
export function retireSession(name, tileIndex, onDone) {
  const submit = createSubmitGate();
  const dlg = sheet({ id: `endsession-${tileIndex}`, cls: 'end-session-card', label: t('retire.sheet', 'Retire {name}', { name }) });
  const title = document.createElement('h2');
  title.textContent = name;
  const copy = document.createElement('p');
  copy.textContent = t('retire.copy', 'Archive keeps this Agent available to rehydrate. Shut down Agent safely closes clean, handed-in desks and then ends the Agent. It never discards desk work.');
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
  const hard = document.createElement('button');
  hard.type = 'button';
  hard.className = 'danger';
  hard.textContent = t('retire.shutdown', 'Shut down Agent');
  actions.append(archive, hard);
  dlg.card.append(title, copy, progress, actions);

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
    progress.textContent = t('retire.resolving', 'Resolving Agent…');
    try {
      await action();
    } catch (e) {
      toast(failure + ' — ' + e.message, false);
      progress.textContent = e.message;
      for (const button of buttons) button.disabled = false;
      pressed.textContent = was;
      return;
    }
    dlg.close();
    dlg.el.remove();
    await onDone();
  };
  const safeShutdown = async () => {
    const state = await runShutdownPolling(name, { onProgress: (value) => { progress.textContent = value.message; } });
    toast(state.message, true);
  };
  archive.addEventListener('click', () => void submit(() => finish(archive, async () => {
    const state = await runShutdownPolling(name, { mode: 'archive', onProgress: (value) => { progress.textContent = value.message; } });
    toast(state.message, true);
  }, t('retire.archive_failed', 'could not archive it'), t('retire.archiving', 'starting archive…'))));
  hard.addEventListener('click', () => void submit(() => finish(hard, safeShutdown, t('retire.shutdown_failed', 'could not safely shut it down'), t('retire.shutting_down', 'starting shutdown…'))));
  dlg.open();
}
