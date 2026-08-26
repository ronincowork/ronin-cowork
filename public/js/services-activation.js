/* Workspace-side Services activation. Reads local state; only Check status contacts HQ. */
import { request } from './request.js';
import { t } from './lexicon.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

export function installServicesStatus() {
  const trigger = document.getElementById('servicesstate');
  if (!trigger) return;
  const pop = el('div', 'services-pop'); pop.hidden = true;
  const message = el('p', 'services-pop-message');
  const actions = el('div', 'services-pop-actions');
  const check = el('button', 'services-check', t('services.check_status', 'Check status'));
  const resend = el('button', '', t('services.resend_confirmation', 'Resend confirmation'));
  const change = el('button', '', t('services.change_email', 'Change email'));
  const cancel = el('button', '', t('services.cancel_services', 'Cancel Ronin Services'));
  for (const item of [check, resend, change, cancel]) { item.type = 'button'; actions.append(item); }
  pop.append(message, actions); document.body.append(pop);
  let state = null; let busy = false; let installTimer = null;

  const paint = (next) => {
    state = next;
    const stage = next?.stage || 'not_requested';
    trigger.hidden = ['not_requested', 'cancelled'].includes(stage);
    trigger.classList.toggle('busy', busy || ['requesting', 'installing'].includes(stage));
    trigger.textContent = stage === 'installed' ? t('services.bar_ready', 'Services ready')
      : stage === 'installing' ? t('services.bar_installing', 'Installing Ronin Services…')
      : stage === 'verified' ? t('services.bar_verified', 'Confirmation received')
      : stage === 'awaiting_email' ? t('services.bar_awaiting_email', 'Email confirmation required')
      : stage === 'expired' ? t('services.bar_expired', 'Services confirmation expired')
      : stage === 'error' ? t('services.bar_error', 'Ronin Services needs attention') : t('settei.ronin_services', 'Ronin Services');
    message.textContent = next?.error_message
      || (next?.email_masked ? t('services.confirmation_address', 'Confirmation address: {email}', { email: next.email_masked }) : t('services.activation', 'Ronin Services activation'));
    check.hidden = !(stage === 'awaiting_email'
      || (stage === 'error' && next?.error_at_stage === 'awaiting_email'));
    resend.hidden = stage !== 'awaiting_email';
    resend.disabled = Boolean(next?.resend_available_at && Date.parse(next.resend_available_at) > Date.now());
    change.hidden = cancel.hidden = !['awaiting_email', 'error', 'expired'].includes(stage);
    if (installTimer) clearTimeout(installTimer);
    // Installation is local work. Watch the local state only while it is running; this
    // never calls Shiwake and stops as soon as the installer reports ready or failed.
    if (stage === 'installing') installTimer = setTimeout(() => void refresh(), 3000);
  };
  const refresh = async () => {
    const result = await request('/api/services/activation', { cache: 'no-store' });
    if (result.ok) paint(result.data);
  };
  const act = async (button, working, route, method = 'POST', json) => {
    busy = true; button.disabled = true; button.textContent = working; paint(state);
    const result = await request(route, { method, ...(json ? { json } : {}) });
    busy = false;
    if (result.ok) paint(result.data); else { paint(state); message.textContent = result.message; }
    button.disabled = false;
  };
  check.addEventListener('click', () => void act(check, t('services.checking', 'Checking…'), '/api/services/activation/poll')
    .finally(() => { check.textContent = t('services.check_status', 'Check status'); }));
  resend.addEventListener('click', () => void act(resend, t('services.sending', 'Sending…'), '/api/services/activation/resend')
    .finally(() => { resend.textContent = t('services.resend_confirmation', 'Resend confirmation'); }));
  cancel.addEventListener('click', () => void act(cancel, t('services.cancelling', 'Cancelling…'), '/api/services/activation', 'DELETE')
    .finally(() => { cancel.textContent = t('services.cancel_services', 'Cancel Ronin Services'); pop.hidden = true; }));
  change.addEventListener('click', async () => {
    const email = window.prompt(t('services.new_confirmation_prompt', 'Send the new confirmation to:'));
    if (!email?.trim()) return;
    await act(change, t('services.changing', 'Changing…'), '/api/services/activation/address', 'POST', { email: email.trim() });
    change.textContent = t('services.change_email', 'Change email');
  });
  trigger.addEventListener('click', () => {
    pop.hidden = !pop.hidden; trigger.setAttribute('aria-expanded', String(!pop.hidden));
    const rect = trigger.getBoundingClientRect();
    pop.style.left = `${Math.max(8, rect.left)}px`; pop.style.top = `${rect.bottom + 8}px`;
  });
  document.addEventListener('ronin:services-state', (event) => paint(event.detail));
  document.addEventListener('visibilitychange', () => {
    // This is a local read. Returning to the tab never polls Shiwake.
    if (document.visibilityState === 'visible') void refresh();
  });
  void refresh();
}
