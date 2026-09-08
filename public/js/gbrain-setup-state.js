/* Pure Setup presentation for gbrain: three questions with plain answers. Is it installed?
 * Is it available to Agents? Which accounts are linked? Browser-free; gbrain.js paints it. */
import { t } from './lexicon.js';

export const GBRAIN_SETUP_STATES = Object.freeze([
  'reading', 'services_needed', 'services_off', 'not_installed', 'installing', 'install_failed', 'removing',
  'provider_first', 'ready', 'stopped', 'unreadable',
]);

const action = (id, label, place = 'installed') => ({ id, label, place });

/** The plain name of an account gbrain can link, by its integration id; the label otherwise. */
const ACCOUNT_NAMES = Object.freeze({
  'email-to-brain': 'Gmail',
  'calendar-to-brain': 'Google Calendar',
  'x-to-brain': 'X',
  'meeting-sync': 'Meeting transcripts',
});

/** Which accounts gbrain can link and whether each is: read from its own integrations list, never assumed. */
export function gbrainAccounts(data) {
  if (data?.integrationsKnown !== true) return null;
  return (data.integrations || [])
    .filter((item) => item.category === 'senses' && !/deprecated/i.test(item.label || ''))
    .map((item) => ({ id: item.id, name: ACCOUNT_NAMES[item.id] || item.label, linked: item.state === 'connected' }));
}

/**
 * @param {{ok:boolean,status?:number,data?:object}|null|undefined} result  the /api/gbrain read; undefined before it lands
 * @param {{installed?:boolean,active?:boolean,services?:{installed?:boolean,active?:boolean},activated_count?:number}|null} availability
 *   Ronin's own runtime facts: the gbrain part, the Services install it rides with, and how many model providers are activated
 */
export function gbrainSetupModel(result, availability = null) {
  const knownInstalled = availability?.installed === true;
  const base = { installed: false, tone: '', hint: '', action: null, accounts: null, log: null, polling: false, summary: null };
  const answer = (state, text, extra = {}) => ({ ...base, state, answer: text, ...extra });
  // No read yet: the surface paints at once and says it is checking. The real read shells
  // out to the gbrain CLI and can take seconds; an empty body in that window is a defect.
  if (result === undefined) return answer('reading', t('gbrain.setup_checking', 'Checking…'));
  if (!result?.ok) {
    if (availability?.services?.installed === true && availability.services.active !== true) {
      return answer('services_off', t('gbrain.setup_services_off', 'Installed · Ronin Services is switched off'), {
        tone: 'warn', summary: knownInstalled ? 'installed' : 'not installed',
        hint: t('gbrain.setup_services_off_hint', 'Turn Services on for this Cowork in Team Configuration.'),
        action: action('open_services', t('gbrain.setup_open_services', 'Open Ronin Services')) });
    }
    if (knownInstalled) {
      return answer('unreadable', t('gbrain.setup_unreadable', 'Could not read'), { tone: 'warn', summary: 'installed',
        hint: t('gbrain.status_diagnosis', 'Setup could not read the local gbrain status. Nothing was changed.'),
        action: action('check_again', t('gbrain.check_again', 'Check again')) });
    }
    return answer('services_needed', t('gbrain.setup_not_installed', 'Not installed'), { summary: 'not installed',
      hint: t('gbrain.setup_services_needed_hint', 'gbrain comes with Ronin Services.'),
      action: action('open_services', t('gbrain.setup_open_services', 'Open Ronin Services')) });
  }
  const data = result.data || {};
  const install = data.install || {};
  const log = Array.isArray(install.log) ? install.log : [];
  if (install.state === 'running') {
    const removing = install.op === 'uninstall';
    return answer(removing ? 'removing' : 'installing', removing ? t('gbrain.setup_removing', 'Removing…') : t('gbrain.setup_installing', 'Installing…'), {
      tone: 'warn', polling: true, summary: removing ? 'removing' : 'installing', hint: log.length ? log[log.length - 1] : '' });
  }
  if (!data.installed) {
    if (install.state === 'failed' && install.op !== 'uninstall') {
      return answer('install_failed', t('gbrain.setup_failed', 'Install did not finish'), { tone: 'bad', summary: 'not installed', log,
        action: action('retry', t('gbrain.retry_install', 'Retry install')) });
    }
    return answer('not_installed', t('gbrain.setup_not_installed', 'Not installed'), { summary: 'not installed',
      hint: t('gbrain.setup_load_hint', 'One press. Downloads come from github.com and huggingface.co.'),
      action: action('load', t('gbrain.load', 'Load gbrain')) });
  }
  const accounts = gbrainAccounts(data);
  if (data.process?.state !== 'running') {
    return answer('stopped', t('gbrain.setup_stopped', 'Installed · not running'), { installed: true, tone: 'warn', summary: 'installed', accounts,
      hint: t('gbrain.setup_stopped_hint', 'Turn Ronin Services off and on in Team Configuration, or ask an Agent to look.'),
      action: action('check_assistant', t('gbrain.setup_check_assistant', 'Ask an Agent to check gbrain')) });
  }
  const keywordOnly = data.search?.weights !== 'running';
  const running = keywordOnly ? t('gbrain.setup_running_keyword', 'Installed · running · keyword-only search') : t('gbrain.setup_running', 'Installed · running');
  if (Number(availability?.activated_count ?? 1) === 0) {
    return answer('provider_first', running, { installed: true, tone: 'ok', summary: 'running', accounts,
      action: action('open_providers', t('gbrain.setup_open_providers', 'Open Model providers'), 'next') });
  }
  return answer('ready', running, { installed: true, tone: 'ok', summary: 'running', accounts,
    action: action('start_assistant', t('gbrain.setup_start_assistant', 'Start your first Personal Assistant'), 'next') });
}

/** The request the surface hands to a new Agent when gbrain is not answering. */
export function gbrainAssistantPrompt() {
  return 'Check why the local gbrain process is not running. Explain what you find before changing anything.';
}
