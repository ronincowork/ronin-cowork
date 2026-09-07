/* Pure Setup presentation for Ronin Services: the registration answer, the installed facts
 * and the activation record → one status line, one next sentence, at most one action.
 * Browser-free; createServicesSurface() in setup-surfaces.js paints it. */
import { t } from './lexicon.js';

export const SERVICES_SETUP_STATES = Object.freeze([
  'unregistered', 'anonymous', 'sending', 'awaiting_email', 'expired', 'send_failed',
  'entitled', 'installing', 'install_failed', 'switched_off', 'restart_needed', 'active',
]);

const action = (id, label) => ({ id, label });

/**
 * @param {{ok:boolean,data?:object}|null} registration  GET /api/setup/registration
 * @param {{ok:boolean,data?:object}|null} installed     GET /api/installed
 * @param {{ok:boolean,data?:object}|null} activation    GET /api/services/activation
 */
export function servicesSetupModel(registration, installed, activation = null) {
  const reg = registration?.ok ? registration.data || {} : {};
  const facts = installed?.ok ? installed.data?.services || {} : {};
  const record = activation?.ok ? activation.data || {} : {};
  const stage = record.stage || reg.services_activation || facts.stage || 'not_requested';
  const entitled = reg.services_entitled === true;
  const parts = facts.installed === true;
  const model = (state, tone, summary, status, next, act = null, polling = false) => ({ state, tone, summary, status, next, action: act, polling });
  const register = action('register', t('services_setup.register', 'Register'));
  const check = action('check', t('services_setup.check', 'Check status'));

  if (!entitled) {
    // The registration row: the path to entitlement, before anything else can happen.
    let row;
    if (!registration?.ok || !reg.status || reg.status === 'optional') {
      row = model('unregistered', '', t('services_setup.summary_not_active', 'not active'),
        t('services_setup.status_not_active', 'Not active on this machine'),
        t('services_setup.next_register', 'Register with an email address to unlock Services. Local Ronin keeps working without it.'), register);
    } else if (reg.status === 'anonymous') {
      row = model('anonymous', '', t('services_setup.summary_not_active', 'not active'),
        t('services_setup.status_anonymous', 'Not active · anonymous hello sent'),
        t('services_setup.next_anonymous', 'Services entitlement goes to an email address. Register with one to continue.'), register);
    } else if (stage === 'requesting') {
      row = model('sending', 'warn', t('services_setup.summary_sending', 'sending'),
        t('services_setup.status_sending', 'Sending the confirmation email…'),
        t('services_setup.next_sending', 'Ronin is asking HQ to send it. This surface checks again in a moment.'), null, true);
    } else if (stage === 'expired') {
      row = model('expired', 'bad', t('services_setup.summary_expired', 'link expired'),
        t('services_setup.status_expired', 'Confirmation link expired'),
        t('services_setup.next_expired', 'Ask for a fresh email from Register. Nothing else changed.'),
        action('register', t('services_setup.open_register', 'Open Register')));
    } else if (stage === 'error' && record.error_at_stage !== 'installing') {
      row = model('send_failed', 'bad', t('services_setup.summary_send_failed', 'waiting to send'),
        t('services_setup.status_send_failed', 'Waiting to send'),
        t('services_setup.next_send_failed', 'HQ could not be reached. Ronin retries on its own; Check status asks again now.'), check);
    } else {
      const email = reg.email_masked || record.email_masked || '';
      row = model('awaiting_email', 'warn', t('services_setup.summary_awaiting', 'confirm email'),
        email ? t('services_setup.status_awaiting_to', 'Confirmation email sent to {email}', { email }) : t('services_setup.status_awaiting', 'Confirmation email sent'),
        t('services_setup.next_awaiting', 'Open the link in that email; any device works. Resend or change the address from Register.'), check, true);
    }
    if (parts) {
      // Installed without an entitlement: the parts are here, the activation is not.
      return { ...row, summary: t('services_setup.summary_not_activated', 'not activated'), status: t('services_setup.status_not_activated', 'Installed · not activated') };
    }
    return row;
  }

  if (stage === 'installing' && !parts) {
    return model('installing', 'warn', t('services_setup.summary_installing', 'installing'),
      t('services_setup.status_installing', 'Installing Services…'),
      t('services_setup.next_installing', 'Fetch, verify, contract check, restart. The page blinks at the restart; sessions are untouched.'), null, true);
  }
  if (stage === 'error' && record.error_at_stage === 'installing' && !parts) {
    return model('install_failed', 'bad', t('services_setup.summary_install_failed', 'install failed'),
      t('services_setup.status_install_failed', 'Install did not finish'),
      record.error_message || t('services_setup.next_install_failed', 'The installer did not finish. Nothing else was changed.'),
      action('install', t('services_setup.try_again', 'Try again')));
  }
  if (!parts) {
    return model('entitled', 'ok', t('services_setup.summary_ready', 'ready to install'),
      t('services_setup.status_entitled', 'Access confirmed · Ready to install'),
      t('services_setup.next_entitled', 'Install fetches Services from Ronin HQ, verifies it, and restarts Ronin’s server. The page blinks; sessions are untouched.'),
      action('install', t('services_setup.install', 'Install Services')));
  }
  if (facts.switched_on !== true) {
    return model('switched_off', '', t('services_setup.summary_switched_off', 'switched off'),
      t('services_setup.status_switched_off', 'Installed and activated · switched off'),
      facts.restart_needed
        ? t('services_setup.next_switched_off_running', 'Switched off, but still running in this copy of Ronin until it restarts.')
        : t('services_setup.next_switched_off', 'Turn it on for new Agents on the Campaign’s Routines and Installs; a team can differ in its Team Configuration.'));
  }
  if (facts.restart_needed) {
    return model('restart_needed', 'warn', t('services_setup.summary_restart', 'restart needed'),
      t('services_setup.status_restart', 'Switched on · not yet running'),
      t('services_setup.next_restart', 'Restart Ronin to start it. Sessions are untouched.'));
  }
  return model('active', 'ok', t('services_setup.summary_active', 'active'),
    t('services_setup.status_active', 'Active on this Cowork'),
    t('services_setup.next_active', 'The template library, background assistant, voice, and memory are on for new Agents.'));
}
