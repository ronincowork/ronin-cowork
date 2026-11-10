/* Workspace-side Services activation: the header badge. It reads the local state when the
 * socket opens (boot, and Ronin back from a restart) and paints each {t:'services-setup'}
 * push. Nothing here contacts HQ, and nothing polls. */
import { request } from './request.js';
import { store } from './store.js';
import { t } from './lexicon.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

export const showsServicesHeader = (visible, stage, readyDismissed = false) => visible
  && stage !== 'not_requested'
  && !(stage === 'installed' && readyDismissed);

const READY_HOLD_MS = 3000;

export function installServicesStatus() {
  const trigger = document.getElementById('servicesstate');
  const unavailable = { setVisible() {} };
  if (!trigger) return unavailable;
  const pop = el('div', 'services-pop'); pop.hidden = true;
  const message = el('p', 'services-pop-message');
  pop.append(message); document.body.append(pop);
  let state = null; let readyTimer = null;
  let visible = false; let previousStage = null; let readyDismissed = false;

  const paint = (next) => {
    state = next;
    const stage = next?.stage || 'not_requested';
    if (stage === 'installed' && previousStage !== 'installed') {
      // A successful transition gets a short acknowledgement. An already-installed
      // workspace starts quiet instead of restoring a permanent status badge.
      readyDismissed = previousStage == null;
      if (!readyDismissed) {
        if (readyTimer) clearTimeout(readyTimer);
        readyTimer = setTimeout(() => {
          readyDismissed = true;
          trigger.hidden = true;
          pop.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          readyTimer = null;
        }, READY_HOLD_MS);
      }
    } else if (stage !== 'installed') {
      if (readyTimer) clearTimeout(readyTimer);
      readyTimer = null;
      readyDismissed = false;
    }
    trigger.hidden = !showsServicesHeader(visible, stage, readyDismissed);
    trigger.classList.toggle('busy', stage === 'installing');
    trigger.textContent = stage === 'installed' ? t('services.bar_ready', 'Services ready')
      : stage === 'installing' ? t('services.bar_installing', 'Installing Ronin Services…')
      : stage === 'error' ? t('services.bar_error', 'Ronin Services needs attention') : t('settei.ronin_services', 'Ronin Services');
    message.textContent = next?.error_message || t('services.activation', 'Ronin Services activation');
    // `setVisible()` can paint before the first local-state read; that placeholder is not
    // a lifecycle transition and must not make an existing installation flash as new.
    if (next) previousStage = stage;
  };
  const refresh = async () => {
    const result = await request('/api/services/activation', { cache: 'no-store' });
    if (result.ok) paint(result.data);
  };
  trigger.addEventListener('click', () => {
    pop.hidden = !pop.hidden; trigger.setAttribute('aria-expanded', String(!pop.hidden));
    const rect = trigger.getBoundingClientRect();
    pop.style.left = `${Math.max(8, rect.left)}px`; pop.style.top = `${rect.bottom + 8}px`;
  });
  store.listen('services-setup', (m) => paint(m.services?.activation ?? state));
  store.onOpen(() => { void refresh(); });
  return { setVisible(next) {
    visible = next === true;
    paint(state);
    if (!visible) {
      pop.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  } };
}
