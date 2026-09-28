/* Workspace-side Services activation: the header badge. It reads the local state when the
 * socket opens (boot, and Ronin back from a restart) and paints each {t:'services-setup'}
 * push; only Check status contacts HQ from here. Nothing polls. */
import { request } from './request.js';
import { store } from './store.js';
import { t } from './lexicon.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

export const showsConfirmationAddress = (state) => state?.stage === 'awaiting_email'
  || state?.stage === 'expired'
  || (state?.stage === 'error' && state?.error_at_stage === 'awaiting_email');

export const showsServicesHeader = (visible, stage, readyDismissed = false) => visible
  && !['not_requested', 'cancelled'].includes(stage)
  && !(stage === 'installed' && readyDismissed);

const READY_HOLD_MS = 3000;

export function installServicesStatus() {
  const trigger = document.getElementById('servicesstate');
  const unavailable = { setVisible() {} };
  if (!trigger) return unavailable;
  const pop = el('div', 'services-pop'); pop.hidden = true;
  const message = el('p', 'services-pop-message');
  const actions = el('div', 'services-pop-actions');
  const check = el('button', 'services-check', t('services.check_status', 'Check status'));
  const resend = el('button', '', t('services.resend_confirmation', 'Resend confirmation'));
  const change = el('button', '', t('services.change_email', 'Change email'));
  const cancel = el('button', '', t('services.cancel_services', 'Cancel Ronin Services'));
  for (const item of [check, resend, change, cancel]) { item.type = 'button'; actions.append(item); }
  pop.append(message, actions); document.body.append(pop);
  let state = null; let busy = false; let readyTimer = null;
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
    trigger.classList.toggle('busy', busy || ['requesting', 'installing'].includes(stage));
    trigger.textContent = stage === 'installed' ? t('services.bar_ready', 'Services ready')
      : stage === 'installing' ? t('services.bar_installing', 'Installing Ronin Services…')
      : stage === 'verified' ? t('services.bar_verified', 'Confirmation received')
      : stage === 'awaiting_email' ? t('services.bar_awaiting_email', 'Email confirmation required')
      : stage === 'expired' ? t('services.bar_expired', 'Services confirmation expired')
      : stage === 'error' ? t('services.bar_error', 'Ronin Services needs attention') : t('settei.ronin_services', 'Ronin Services');
    message.textContent = next?.error_message
      || (showsConfirmationAddress(next) && next?.email_masked
        ? t('services.confirmation_address', 'Confirmation address: {email}', { email: next.email_masked })
        : t('services.activation', 'Ronin Services activation'));
    check.hidden = !(stage === 'awaiting_email'
      || (stage === 'error' && next?.error_at_stage === 'awaiting_email'));
    resend.hidden = stage !== 'awaiting_email';
    resend.disabled = Boolean(next?.resend_available_at && Date.parse(next.resend_available_at) > Date.now());
    change.hidden = cancel.hidden = !['awaiting_email', 'error', 'expired'].includes(stage);
    // `setVisible()` can paint before the first local-state read; that placeholder is not
    // a lifecycle transition and must not make an existing installation flash as new.
    if (next) previousStage = stage;
  };
  const refresh = async () => {
    const result = await request('/api/services/activation', { cache: 'no-store' });
    if (result.ok) paint(result.data);
  };
  const act = async (button, working, route, method = 'POST', json) => {
    busy = true; button.disabled = true; button.textContent = working; paint(state);
    const result = await request(route, { method, ...(json ? { json } : {}) });
    busy = false;
    // Check status answers with the services object; the registration presses answer with
    // the registration, and their new activation arrives by push.
    paint(result.ok ? result.data?.activation ?? state : state);
    if (!result.ok) message.textContent = result.message;
    button.disabled = false;
  };
  check.addEventListener('click', () => void act(check, t('services.checking', 'Checking…'), '/api/services/activation/poll')
    .finally(() => { check.textContent = t('services.check_status', 'Check status'); }));
  resend.addEventListener('click', () => void act(resend, t('services.sending', 'Sending…'), '/api/setup/registration/recovery', 'POST', { action: 'resend' })
    .finally(() => { resend.textContent = t('services.resend_confirmation', 'Resend confirmation'); }));
  cancel.addEventListener('click', () => void act(cancel, t('services.cancelling', 'Cancelling…'), '/api/setup/registration', 'DELETE')
    .finally(() => { cancel.textContent = t('services.cancel_services', 'Cancel Ronin Services'); pop.hidden = true; }));
  change.addEventListener('click', async () => {
    const email = window.prompt(t('services.new_confirmation_prompt', 'Send the new confirmation to:'));
    if (!email?.trim()) return;
    await act(change, t('services.changing', 'Changing…'), '/api/setup/registration/recovery', 'POST', { action: 'change_address', email: email.trim() });
    change.textContent = t('services.change_email', 'Change email');
  });
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
