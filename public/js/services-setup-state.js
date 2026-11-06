/* Pure Setup presentation for Ronin Services: the installed facts, the registration answer
 * and the activation record → one status line, one next sentence, and the three steps —
 * Register · Install · On — each in the same shape, reading Done once it is.
 * Installation and registration are two measured facts: installed parts are shown installed
 * and usable whether or not anyone registered. Browser-free; setup-surfaces.js paints it. */
import { t } from './lexicon.js';

const step = (id, caption, label, { done = false, enabled = true, act = null, title = '' } = {}) => ({ id, caption, label, done, enabled, act, title });

/** Where the registration stands: its state, tone words, and the Register step. Submitting
 * the form completes registration (email or anonymous); no confirmation is asked for. */
function registrationRow(registration) {
  const reg = registration?.ok ? registration.data || {} : {};
  const caption = t('services_setup.step_register', 'Register');
  const row = (state, tone, status, next, stepIn) => ({ state, tone, status, next, step: stepIn });
  if (reg.status === 'registered' || reg.status === 'anonymous') {
    return row('registered', 'ok', t('services_setup.status_registered', 'Registered · Ready to install'),
      t('services_setup.next_registered', 'Install fetches Services, verifies it, and restarts Ronin’s server. The page reconnects when Ronin returns.'),
      step('register', caption, t('services_setup.done', 'Done'), { done: true, enabled: false }));
  }
  return row('unregistered', '', t('services_setup.status_not_installed', 'Not installed on this machine'),
    t('services_setup.next_register', 'Register and Ronin installs Services. Local Ronin keeps working without it.'),
    step('register', caption, t('services_setup.register', 'Register'), { act: 'register' }));
}

/**
 * @param {{ok:boolean,data?:object}|null} registration  GET /api/setup/registration
 * @param {{ok:boolean,data?:object}|null} installed     GET /api/installed
 * @param {{ok:boolean,data?:object}|null} activation    GET /api/services/activation (carries `office`, the office record view)
 */
export function servicesSetupModel(registration, installed, activation = null) {
  const facts = installed?.ok ? installed.data?.services || {} : {};
  const record = activation?.ok ? activation.data || {} : {};
  const stage = record.stage || facts.stage || 'not_requested';
  const parts = facts.installed === true || (Array.isArray(facts.parts) && facts.parts.length > 0);
  const on = facts.switched_on === true;
  const reg = registrationRow(registration);
  const installCaption = t('services_setup.step_install', 'Install');
  const switchCaption = t('services_setup.step_switch_on', 'Switch on');
  const installing = !parts && stage === 'installing';
  const installFailed = !parts && stage === 'error' && record.error_at_stage === 'installing';

  const installStep = parts ? step('install', installCaption, t('services_setup.done', 'Done'), { done: true, enabled: false })
    : installing ? step('install', installCaption, t('services_setup.installing', 'Installing…'), { enabled: false })
    : installFailed ? step('install', installCaption, t('services_setup.try_again', 'Try again'), { act: 'install' })
    : step('install', installCaption, t('services_setup.install', 'Install'), { act: 'install' });
  // The switch is a toggle, never Done: it drives the Campaign's choice and cascades to new teams and Agents.
  const switchStep = on ? { ...step('switch', switchCaption, t('services_setup.turn_off', 'Turn off'), { act: 'switch_off' }), pressed: true }
    : { ...step('switch', switchCaption, t('services_setup.turn_on', 'Turn on'), { act: 'switch_on', enabled: parts, title: parts ? '' : t('services_setup.install_first', 'Install first') }), pressed: false };
  // A moved switch waits on a restart of Ronin; the Restart control appears only then.
  const restartStep = parts && facts.restart_needed ? step('restart', t('services_setup.step_restart', 'Restart'), t('services_setup.restart', 'Restart'), { act: 'restart' }) : null;
  // An office on an office_park: Services came with the office image, and the office is already
  // registered with Ronin HQ by its provisioning. Register and Install are not offered; a missing
  // install there is a provisioning fault, said as such.
  // A record that will not read is a fault, never self-hosted: Register and Install are not offered either.
  const hosting = record.office?.hosting;
  const hosted = hosting === 'office_unit' || hosting === 'unreadable';
  const steps = hosted ? [switchStep, ...(restartStep ? [restartStep] : [])] : [reg.step, installStep, switchStep, ...(restartStep ? [restartStep] : [])];
  const model = (state, tone, status, next) => ({ state, tone, status, next, steps, summary: '' });

  if (hosting === 'unreadable') {
    return { ...model('office_record_unreadable', 'bad', t('services_setup.status_office_unreadable', 'Office record unreadable'),
      t('services_setup.next_office_unreadable', 'office.json is present but wrong: {error}. Nothing here is self-hosted; fix the record before anything else.', { error: record.office.error || '—' })), summary: t('services_setup.summary_office_unreadable', 'office record unreadable') };
  }
  if (hosted && !parts) {
    return { ...model('office_missing_services', 'bad', t('services_setup.status_office_missing', 'Hosted office · Services missing'),
      t('services_setup.next_office_missing', 'This office runs on an office_park and its image should carry Services. Nothing here installs them; tell Ronin.')), summary: t('services_setup.summary_office_missing', 'services missing') };
  }
  if (!parts) {
    if (installing) {
      return { ...model('installing', 'warn', t('services_setup.status_installing', 'Installing Services…'),
        t('services_setup.next_installing', 'Fetch, verify, contract check, restart. The page reconnects when Ronin returns.')), summary: t('services_setup.summary_installing', 'installing') };
    }
    if (installFailed) {
      return { ...model('install_failed', 'bad', t('services_setup.status_install_failed', 'Install did not finish'),
        record.error_message || t('services_setup.next_install_failed', 'The installer did not finish. Nothing else was changed.')), summary: t('services_setup.summary_install_failed', 'install failed') };
    }
    const summary = {
      registered: t('services_setup.summary_ready', 'ready to install'),
    }[reg.state] || t('services_setup.summary_not_installed', 'not installed');
    return { ...model(reg.state, reg.tone, reg.status, reg.next), summary };
  }

  // Installed: the parts are here and usable; registration stays its own optional step.
  const counts = { parts: (facts.parts || []).length, loaded: (facts.loaded || []).length };
  if (!on) {
    return { ...model('switched_off', '', t('services_setup.status_switched_off', 'Installed · switched off'),
      facts.restart_needed
        ? t('services_setup.next_switched_off_running', 'Switched off, but still running in this copy of Ronin. Press Restart, or ask any of your Agents to restart Ronin, and it stops when Ronin returns.')
        : t('services_setup.next_switched_off', 'Turn it on here: it sets the Campaign’s choice and cascades to new teams and Agents; a team can differ in its Team Configuration. {loaded} of {parts} parts are running now.', counts)),
      summary: t('services_setup.summary_switched_off', 'switched off') };
  }
  if (facts.restart_needed) {
    return { ...model('restart_needed', 'warn', t('services_setup.status_restart', 'Switched on · not yet running'),
      t('services_setup.next_restart', 'Press Restart, or ask any of your Agents to restart Ronin. Unlocked views and the other parts then start on their own; only new Agents are born with the Services reading. Sessions are untouched.')), summary: t('services_setup.summary_restart', 'restart needed') };
  }
  return { ...model('active', 'ok', t('services_setup.status_active', 'Active on this Cowork'),
    t('services_setup.next_active', '{loaded} of {parts} parts are running for new Agents.', counts)), summary: t('services_setup.summary_active', 'active') };
}
