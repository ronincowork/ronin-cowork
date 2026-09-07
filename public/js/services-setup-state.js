/* Pure Setup presentation for Ronin Services: the installed facts, the registration answer
 * and the activation record → one status line, one next sentence, and the three steps —
 * Register · Install · On — each in the same shape, reading Done once it is.
 * Installation and registration are two measured facts: installed parts are shown installed
 * and usable whether or not anyone registered. Browser-free; setup-surfaces.js paints it. */
import { t } from './lexicon.js';

export const SERVICES_SETUP_STATES = Object.freeze([
  'unregistered', 'anonymous', 'sending', 'awaiting_email', 'expired', 'send_failed',
  'entitled', 'installing', 'install_failed', 'switched_off', 'restart_needed', 'active',
]);

const step = (id, caption, label, { done = false, enabled = true, act = null, title = '' } = {}) => ({ id, caption, label, done, enabled, act, title });

/** Where the registration stands: its state, tone words, and the Register step. */
function registrationRow(registration, record) {
  const reg = registration?.ok ? registration.data || {} : {};
  const stage = record.stage || reg.services_activation || 'not_requested';
  const caption = t('services_setup.step_register', 'Register');
  const row = (state, tone, status, next, stepIn, polling = false) => ({ state, tone, status, next, step: stepIn, polling });
  if (reg.services_entitled === true) {
    return row('entitled', 'ok', t('services_setup.status_entitled', 'Registered · Ready to install'),
      t('services_setup.next_entitled', 'Install fetches Services from Ronin HQ, verifies it, and restarts Ronin’s server. The page blinks; sessions are untouched.'),
      step('register', caption, t('services_setup.done', 'Done'), { done: true, enabled: false }));
  }
  if (!registration?.ok || !reg.status || reg.status === 'optional') {
    return row('unregistered', '', t('services_setup.status_not_installed', 'Not installed on this machine'),
      t('services_setup.next_register', 'Register with an email address and Ronin installs Services from HQ. Local Ronin keeps working without it.'),
      step('register', caption, t('services_setup.register', 'Register'), { act: 'register' }));
  }
  if (reg.status === 'anonymous') {
    return row('anonymous', '', t('services_setup.status_anonymous', 'Not installed · anonymous hello sent'),
      t('services_setup.next_anonymous', 'The hosted install goes to an email address. Register with one to continue.'),
      step('register', caption, t('services_setup.register', 'Register'), { act: 'register' }));
  }
  if (stage === 'requesting') {
    return row('sending', 'warn', t('services_setup.status_sending', 'Sending the confirmation email…'),
      t('services_setup.next_sending', 'Ronin is asking HQ to send it. This surface checks again in a moment.'),
      step('register', caption, t('services_setup.sending', 'Sending…'), { enabled: false }), true);
  }
  if (stage === 'expired') {
    return row('expired', 'bad', t('services_setup.status_expired', 'Confirmation link expired'),
      t('services_setup.next_expired', 'Ask for a fresh email from Register. Nothing else changed.'),
      step('register', caption, t('services_setup.register', 'Register'), { act: 'register' }));
  }
  if (stage === 'error' && record.error_at_stage !== 'installing') {
    return row('send_failed', 'bad', t('services_setup.status_send_failed', 'Waiting to send'),
      t('services_setup.next_send_failed', 'HQ could not be reached. Ronin retries on its own; Check status asks again now.'),
      step('register', caption, t('services_setup.check', 'Check status'), { act: 'check' }));
  }
  const email = reg.email_masked || record.email_masked || '';
  return row('awaiting_email', 'warn',
    email ? t('services_setup.status_awaiting_to', 'Confirmation email sent to {email}', { email }) : t('services_setup.status_awaiting', 'Confirmation email sent'),
    t('services_setup.next_awaiting', 'Open the link in that email; any device works. Resend or change the address from Register.'),
    step('register', caption, t('services_setup.check', 'Check status'), { act: 'check' }), true);
}

/**
 * @param {{ok:boolean,data?:object}|null} registration  GET /api/setup/registration
 * @param {{ok:boolean,data?:object}|null} installed     GET /api/installed
 * @param {{ok:boolean,data?:object}|null} activation    GET /api/services/activation
 */
export function servicesSetupModel(registration, installed, activation = null) {
  const facts = installed?.ok ? installed.data?.services || {} : {};
  const record = activation?.ok ? activation.data || {} : {};
  const stage = record.stage || facts.stage || 'not_requested';
  const parts = facts.installed === true || (Array.isArray(facts.parts) && facts.parts.length > 0);
  const entitled = registration?.ok && registration.data?.services_entitled === true;
  const on = facts.switched_on === true;
  const reg = registrationRow(registration, record);
  const installCaption = t('services_setup.step_install', 'Install');
  const switchCaption = t('services_setup.step_switch', 'Switch');
  const installing = !parts && entitled && stage === 'installing';
  const installFailed = !parts && entitled && stage === 'error' && record.error_at_stage === 'installing';

  const installStep = parts ? step('install', installCaption, t('services_setup.done', 'Done'), { done: true, enabled: false })
    : installing ? step('install', installCaption, t('services_setup.installing', 'Installing…'), { enabled: false })
    : installFailed ? step('install', installCaption, t('services_setup.try_again', 'Try again'), { act: 'install' })
    : step('install', installCaption, t('services_setup.install', 'Install'), { act: 'install', enabled: entitled, title: entitled ? '' : t('services_setup.register_first', 'Register first') });
  // The switch is a toggle, never Done: it drives the Campaign's choice and cascades to new teams and Agents.
  const switchStep = on ? { ...step('switch', switchCaption, t('services_setup.turn_off', 'Turn off'), { act: 'switch_off' }), pressed: true }
    : { ...step('switch', switchCaption, t('services_setup.turn_on', 'Turn on'), { act: 'switch_on', enabled: parts, title: parts ? '' : t('services_setup.install_first', 'Install first') }), pressed: false };
  const steps = [reg.step, installStep, switchStep];
  const model = (state, tone, status, next, polling = false) => ({ state, tone, status, next, steps, polling, summary: '' });

  if (!parts) {
    if (installing) {
      return { ...model('installing', 'warn', t('services_setup.status_installing', 'Installing Services…'),
        t('services_setup.next_installing', 'Fetch, verify, contract check, restart. The page blinks at the restart; sessions are untouched.'), true), summary: t('services_setup.summary_installing', 'installing') };
    }
    if (installFailed) {
      return { ...model('install_failed', 'bad', t('services_setup.status_install_failed', 'Install did not finish'),
        record.error_message || t('services_setup.next_install_failed', 'The installer did not finish. Nothing else was changed.')), summary: t('services_setup.summary_install_failed', 'install failed') };
    }
    const summary = {
      entitled: t('services_setup.summary_ready', 'ready to install'), sending: t('services_setup.summary_sending', 'sending'),
      awaiting_email: t('services_setup.summary_awaiting', 'confirm email'), expired: t('services_setup.summary_expired', 'link expired'),
      send_failed: t('services_setup.summary_send_failed', 'waiting to send'),
    }[reg.state] || t('services_setup.summary_not_installed', 'not installed');
    return { ...model(reg.state, reg.tone, reg.status, reg.next, reg.polling), summary };
  }

  // Installed: the parts are here and usable; registration stays its own optional step.
  const counts = { parts: (facts.parts || []).length, loaded: (facts.loaded || []).length };
  if (!on) {
    return { ...model('switched_off', '', t('services_setup.status_switched_off', 'Installed · switched off'),
      facts.restart_needed
        ? t('services_setup.next_switched_off_running', 'Switched off, but still running in this copy of Ronin. Ask any of your Agents to restart Ronin and it stops; sessions are untouched.')
        : t('services_setup.next_switched_off', 'Turn it on here: it sets the Campaign’s choice and cascades to new teams and Agents; a team can differ in its Team Configuration. {loaded} of {parts} parts are running now.', counts),
      reg.polling), summary: t('services_setup.summary_switched_off', 'switched off') };
  }
  if (facts.restart_needed) {
    return { ...model('restart_needed', 'warn', t('services_setup.status_restart', 'Switched on · not yet running'),
      t('services_setup.next_restart', 'Ask any of your Agents to restart Ronin. Unlocked views and the other parts then start on their own; only new Agents are born with the Services reading. Sessions are untouched.'), reg.polling), summary: t('services_setup.summary_restart', 'restart needed') };
  }
  return { ...model('active', 'ok', t('services_setup.status_active', 'Active on this Cowork'),
    t('services_setup.next_active', '{loaded} of {parts} parts are running for new Agents.', counts), reg.polling), summary: t('services_setup.summary_active', 'active') };
}
