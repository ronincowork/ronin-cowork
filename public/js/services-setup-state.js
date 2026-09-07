/* Pure Setup presentation for Ronin Services: the installed facts, the registration answer
 * and the activation record → one status line, one next sentence, at most one action, and a
 * separate optional account line. Installation and registration are two measured facts:
 * installed parts are shown installed and usable whether or not anyone registered.
 * Browser-free; createServicesSurface() in setup-surfaces.js paints it. */
import { t } from './lexicon.js';

export const SERVICES_SETUP_STATES = Object.freeze([
  'unregistered', 'anonymous', 'sending', 'awaiting_email', 'expired', 'send_failed',
  'entitled', 'installing', 'install_failed', 'switched_off', 'restart_needed', 'active',
]);

const action = (id, label) => ({ id, label });

/** The registration path, as one row: where the account stands and its one next step. */
function registrationRow(registration, record) {
  const reg = registration?.ok ? registration.data || {} : {};
  const stage = record.stage || reg.services_activation || 'not_requested';
  const register = action('register', t('services_setup.register', 'Register'));
  const check = action('check', t('services_setup.check', 'Check status'));
  const row = (state, tone, summary, status, next, act = null, polling = false) => ({ state, tone, summary, status, next, action: act, polling });
  if (reg.services_entitled === true) {
    return row('entitled', 'ok', t('services_setup.summary_ready', 'ready to install'),
      t('services_setup.status_entitled', 'Registered · Ready to install'),
      t('services_setup.next_entitled', 'Install fetches Services from Ronin HQ, verifies it, and restarts Ronin’s server. The page blinks; sessions are untouched.'),
      action('install', t('services_setup.install', 'Install Services')));
  }
  if (!registration?.ok || !reg.status || reg.status === 'optional') {
    return row('unregistered', '', t('services_setup.summary_not_installed', 'not installed'),
      t('services_setup.status_not_installed', 'Not installed on this machine'),
      t('services_setup.next_register', 'Register with an email address and Ronin installs Services from HQ. Local Ronin keeps working without it.'), register);
  }
  if (reg.status === 'anonymous') {
    return row('anonymous', '', t('services_setup.summary_not_installed', 'not installed'),
      t('services_setup.status_anonymous', 'Not installed · anonymous hello sent'),
      t('services_setup.next_anonymous', 'The hosted install goes to an email address. Register with one to continue.'), register);
  }
  if (stage === 'requesting') {
    return row('sending', 'warn', t('services_setup.summary_sending', 'sending'),
      t('services_setup.status_sending', 'Sending the confirmation email…'),
      t('services_setup.next_sending', 'Ronin is asking HQ to send it. This surface checks again in a moment.'), null, true);
  }
  if (stage === 'expired') {
    return row('expired', 'bad', t('services_setup.summary_expired', 'link expired'),
      t('services_setup.status_expired', 'Confirmation link expired'),
      t('services_setup.next_expired', 'Ask for a fresh email from Register. Nothing else changed.'),
      action('register', t('services_setup.open_register', 'Open Register')));
  }
  if (stage === 'error' && record.error_at_stage !== 'installing') {
    return row('send_failed', 'bad', t('services_setup.summary_send_failed', 'waiting to send'),
      t('services_setup.status_send_failed', 'Waiting to send'),
      t('services_setup.next_send_failed', 'HQ could not be reached. Ronin retries on its own; Check status asks again now.'), check);
  }
  const email = reg.email_masked || record.email_masked || '';
  return row('awaiting_email', 'warn', t('services_setup.summary_awaiting', 'confirm email'),
    email ? t('services_setup.status_awaiting_to', 'Confirmation email sent to {email}', { email }) : t('services_setup.status_awaiting', 'Confirmation email sent'),
    t('services_setup.next_awaiting', 'Open the link in that email; any device works. Resend or change the address from Register.'), check, true);
}

/** The optional account line beside an installed Services: never a gate, only what registration adds. */
function accountLine(registration, record, row) {
  const reg = registration?.ok ? registration.data || {} : {};
  if (reg.services_entitled === true) return { line: t('services_setup.account_registered', 'Registered · the template library and hosted parts are unlocked.'), action: null };
  const said = {
    unregistered: t('services_setup.account_optional', 'Registration is optional. It unlocks the template library and the hosted parts.'),
    anonymous: t('services_setup.account_anonymous', 'Anonymous hello sent. Registering with an email unlocks the template library and the hosted parts.'),
    sending: row.status, expired: row.status, send_failed: row.status,
    awaiting_email: row.status,
  }[row.state] || row.status;
  return { line: said, action: row.action };
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
  const registration_ = registrationRow(registration, record);
  const model = (state, tone, summary, status, next, act = null, polling = false) => ({ state, tone, summary, status, next, action: act, polling, account: null });

  if (!parts) {
    // Nothing installed: the registration path is the install path, so it is the one block.
    if (registration_.state === 'entitled' && stage === 'installing') {
      return model('installing', 'warn', t('services_setup.summary_installing', 'installing'),
        t('services_setup.status_installing', 'Installing Services…'),
        t('services_setup.next_installing', 'Fetch, verify, contract check, restart. The page blinks at the restart; sessions are untouched.'), null, true);
    }
    if (registration_.state === 'entitled' && stage === 'error' && record.error_at_stage === 'installing') {
      return model('install_failed', 'bad', t('services_setup.summary_install_failed', 'install failed'),
        t('services_setup.status_install_failed', 'Install did not finish'),
        record.error_message || t('services_setup.next_install_failed', 'The installer did not finish. Nothing else was changed.'),
        action('install', t('services_setup.try_again', 'Try again')));
    }
    return { ...registration_, account: null };
  }

  // Installed: the parts are here and usable; registration is a separate, optional fact.
  const counts = { parts: (facts.parts || []).length, loaded: (facts.loaded || []).length };
  const account = accountLine(registration, record, registration_);
  const polling = registration_.polling;
  if (facts.switched_on !== true) {
    return { ...model('switched_off', '', t('services_setup.summary_switched_off', 'switched off'),
      t('services_setup.status_switched_off', 'Installed · switched off'),
      facts.restart_needed
        ? t('services_setup.next_switched_off_running', 'Switched off, but still running in this copy of Ronin until it restarts.')
        : t('services_setup.next_switched_off', 'Turn it on for new Agents on the Campaign’s Routines and Installs; a team can differ in its Team Configuration. {loaded} of {parts} parts are running now.', counts),
      null, polling), account };
  }
  if (facts.restart_needed) {
    return { ...model('restart_needed', 'warn', t('services_setup.summary_restart', 'restart needed'),
      t('services_setup.status_restart', 'Switched on · not yet running'),
      t('services_setup.next_restart', 'Restart Ronin to start it. Sessions are untouched.'), null, polling), account };
  }
  return { ...model('active', 'ok', t('services_setup.summary_active', 'active'),
    t('services_setup.status_active', 'Active on this Cowork'),
    t('services_setup.next_active', '{loaded} of {parts} parts are running for new Agents.', counts), null, polling), account };
}
