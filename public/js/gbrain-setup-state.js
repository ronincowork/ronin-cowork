/* Pure Setup presentation for gbrain: one measured snapshot → one status line, one next
 * sentence, at most one action, and a plain reading of each measurement. Browser-free;
 * the renderer in gbrain.js paints it. */
import { t } from './lexicon.js';

export const GBRAIN_SETUP_STATES = Object.freeze([
  'reading', 'services_needed', 'services_off', 'not_installed', 'installing', 'install_failed', 'removing',
  'provider_first', 'ready', 'running', 'stopped', 'unreadable',
]);

const word = (v) => ({
  running: t('gbrain.running', '● running'),
  stopped: t('gbrain.stopped', '○ stopped'),
  vm_only: t('gbrain.vm_only', 'VM only'),
  network: t('gbrain.network', 'network reachable'),
  none: t('gbrain.none', 'none'),
  configured: t('gbrain.configured', 'configured'),
  unknown: t('gbrain.unknown', 'unknown'),
}[v] || String(v ?? 'unknown').replaceAll('_', ' '));

const action = (id, label) => ({ id, label });

/** The plain name of an account gbrain can link, by its integration id; the label otherwise. */
const ACCOUNT_NAMES = Object.freeze({
  'email-to-brain': 'Gmail',
  'calendar-to-brain': 'Google Calendar',
  'x-to-brain': 'X',
  'meeting-sync': 'meeting transcripts',
});
const linkable = (data) => (data.integrations || [])
  .filter((item) => item.category === 'senses' && !/deprecated/i.test(item.label || ''))
  .map((item) => ({ ...item, name: ACCOUNT_NAMES[item.id] || item.label }));
const list = (names) => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * What each measurement means, in a sentence a person can act on. Every value is the
 * snapshot's own; the sentence is what that value means for them, never a guess.
 */
export function gbrainReadings(data) {
  const process = data.process?.state;
  const weights = data.search?.weights;
  const scope = data.listener?.scope;
  const outside = data.externalModelProvider;
  const accounts = linkable(data);
  const linked = accounts.filter((item) => item.state === 'connected');
  const known = data.integrationsKnown === true;
  return [
    {
      key: 'process', value: word(process), tone: process === 'running' ? 'ok' : process === 'stopped' ? 'bad' : 'warn',
      sentence: process === 'running' ? t('gbrain.read_process_on', 'gbrain is running on this machine.')
        : process === 'stopped' ? t('gbrain.read_process_off', 'The local gbrain process is not answering.')
          : t('gbrain.read_process_unknown', 'Whether the local process is running could not be read.'),
    },
    {
      key: 'embeddings', value: word(weights), tone: weights === 'running' ? 'ok' : 'warn',
      sentence: weights === 'running' ? t('gbrain.read_embeddings_on', 'Search by meaning is on: the local embedding weights are running.')
        : weights === 'stopped' ? t('gbrain.read_embeddings_off', 'Search is keyword-only until the local embedding weights are running.')
          : t('gbrain.read_embeddings_unknown', 'Whether search by meaning is on could not be read.'),
    },
    {
      key: 'reach', value: word(scope), tone: scope === 'vm_only' ? 'ok' : 'warn',
      sentence: scope === 'vm_only' ? t('gbrain.read_reach_local', 'Only this machine can reach it. Nothing is open to the network.')
        : scope === 'network' ? t('gbrain.read_reach_network', 'It is reachable from the network. Make sure that is what you want.')
          : t('gbrain.read_reach_unknown', 'Where it listens could not be read.'),
    },
    {
      key: 'outside', value: word(outside), tone: outside === 'none' ? 'ok' : 'warn',
      sentence: outside === 'none' ? t('gbrain.read_outside_none', 'No outside model is used. Your Agents do the thinking on your own subscription.')
        : outside === 'configured' ? t('gbrain.read_outside_configured', 'An outside model key is configured, so gbrain can call out on its own.')
          : t('gbrain.read_outside_unknown', 'Whether an outside model is configured could not be read.'),
    },
    {
      key: 'accounts', tone: !known ? 'warn' : linked.length ? 'ok' : '',
      value: !known ? word('unknown') : linked.length ? t('gbrain.n_linked', '{n} linked', { n: linked.length }) : word('none'),
      sentence: !known ? t('gbrain.read_accounts_unknown', 'Whether any accounts are linked could not be read.')
        : linked.length ? t('gbrain.read_accounts_linked', 'Linked: {names}.', { names: list(linked.map((item) => item.name)) })
          : accounts.length > 1
            ? t('gbrain.read_accounts_none', 'No accounts are linked yet. {names} can each be linked by your Personal Assistant, one at a time, with your approval.', { names: list(accounts.map((item) => item.name)) })
            : accounts.length === 1
              ? t('gbrain.read_accounts_none_one', 'No accounts are linked yet. {names} can be linked by your Personal Assistant when you ask, with your approval.', { names: accounts[0].name })
              : t('gbrain.read_accounts_none_short', 'No accounts are linked yet. Your Personal Assistant can link one when you ask, with your approval.'),
    },
  ];
}

/**
 * @param {{ok:boolean,status?:number,data?:object}|null|undefined} result  the /api/gbrain read; undefined before it lands
 * @param {{installed?:boolean,active?:boolean,services?:{installed?:boolean,active?:boolean},activated_count?:number}|null} availability
 *   Ronin's own runtime facts: the gbrain part, the Services install it rides with, and how many model providers are activated
 */
export function gbrainSetupModel(result, availability = null) {
  const knownInstalled = availability?.installed === true;
  const base = { readings: [], log: null, polling: false, observedAt: null };
  // No read yet: the surface paints at once and says it is reading. The real read shells
  // out to the gbrain CLI and can take seconds; an empty body in that window is a defect.
  if (result === undefined) {
    return { ...base, state: 'reading', tone: '', summary: null,
      status: t('gbrain.setup_status_reading', 'Reading local gbrain status…'),
      next: t('gbrain.setup_next_reading', 'Ronin is asking the local process, the embedding weights, and the integrations list.'),
      action: null };
  }
  if (!result?.ok) {
    // Services installed but switched off: the part is on disk and its status route is not loaded.
    if (availability?.services?.installed === true && availability.services.active !== true) {
      return { ...base, state: 'services_off', tone: 'warn', summary: knownInstalled ? 'installed' : 'not installed',
        status: t('gbrain.setup_status_services_off', 'Installed · Ronin Services is switched off'),
        next: t('gbrain.setup_next_services_off', 'gbrain runs as part of Ronin Services. Turn Services on for this Cowork in Team Configuration, then come back here.'),
        action: action('open_services', t('gbrain.setup_open_services', 'Open Ronin Services')) };
    }
    if (knownInstalled) {
      return { ...base, state: 'unreadable', tone: 'warn', summary: 'installed',
        status: t('gbrain.setup_status_unreadable', 'Status could not be read'),
        next: t('gbrain.status_diagnosis', 'Setup could not read the local gbrain status. Nothing was changed.'),
        action: action('check_again', t('gbrain.check_again', 'Check again')) };
    }
    return { ...base, state: 'services_needed', tone: '', summary: 'not installed',
      status: t('gbrain.setup_status_not_installed', 'Not installed on this machine'),
      next: t('gbrain.setup_next_services', 'gbrain arrives with Ronin Services. Set up Services first, then load gbrain here.'),
      action: action('open_services', t('gbrain.setup_open_services', 'Open Ronin Services')) };
  }
  const data = result.data || {};
  const install = data.install || {};
  const log = Array.isArray(install.log) ? install.log : [];
  const observedAt = data.observedAt || null;
  if (install.state === 'running') {
    const removing = install.op === 'uninstall';
    const latest = log.length ? log[log.length - 1] : '';
    return { ...base, state: removing ? 'removing' : 'installing', tone: 'warn', summary: removing ? 'removing' : 'installing', polling: true, observedAt,
      status: removing ? t('gbrain.setup_status_removing', 'Removing…') : t('gbrain.setup_status_installing', 'Installing…'),
      next: latest || (removing
        ? t('gbrain.setup_next_removing', 'Units, wiring, and shelves are being removed. Your brain repo is kept.')
        : t('gbrain.setup_next_installing', 'Weights, gbrain, cabinet, and wiring are being set up. This surface checks again every few seconds.')),
      action: null };
  }
  if (!data.installed) {
    if (install.state === 'failed' && install.op !== 'uninstall') {
      return { ...base, state: 'install_failed', tone: 'bad', summary: 'not installed', log, observedAt,
        status: t('gbrain.setup_status_failed', 'Install did not finish'),
        next: t('gbrain.setup_next_failed', 'The install log says where it stopped. Nothing else was changed.'),
        action: action('retry', t('gbrain.retry_install', 'Retry install')) };
    }
    return { ...base, state: 'not_installed', tone: '', summary: 'not installed', observedAt,
      status: t('gbrain.setup_status_not_installed', 'Not installed on this machine'),
      next: t('gbrain.setup_next_load', 'Load once to install gbrain, local embedding weights, and Agent wiring. Downloads come from github.com and huggingface.co.'),
      action: action('load', t('gbrain.load', 'Load gbrain')) };
  }
  const readings = gbrainReadings(data);
  if (data.process?.state !== 'running') {
    return { ...base, state: 'stopped', tone: 'warn', summary: 'installed', readings, observedAt,
      status: t('gbrain.setup_status_stopped', 'Installed · not running'),
      next: t('gbrain.setup_next_stopped', 'The local gbrain process is not answering. Turn Ronin Services off and on in Team Configuration, or ask an Agent: the button opens the launcher with the request written for you.'),
      action: action('check_assistant', t('gbrain.setup_check_assistant', 'Ask an Agent to check gbrain')) };
  }
  // Running. What comes next is mechanical: a Personal Assistant needs one activated model
  // provider; with one, the only thing left is to start it.
  if (Number(availability?.activated_count ?? 1) === 0) {
    return { ...base, state: 'provider_first', tone: 'ok', summary: 'running', readings, observedAt,
      status: t('gbrain.setup_status_provider_first', 'gbrain is ready · a model provider comes first'),
      next: t('gbrain.setup_next_provider_first', 'Activate one model provider, then come back and start your first Personal Assistant: an Agent that remembers through gbrain.'),
      action: action('open_providers', t('gbrain.setup_open_providers', 'Open Model providers')) };
  }
  const notes = readings.filter((row) => row.tone !== 'ok' && row.key !== 'accounts');
  if (notes.length) {
    return { ...base, state: 'running', tone: 'ok', summary: 'running', readings, observedAt,
      status: t('gbrain.setup_status_running_note', 'Running, with a note'),
      next: `${notes[0].sentence} ${t('gbrain.setup_next_start_anyway', 'You can still start your first Personal Assistant: an Agent that remembers through gbrain. It opens in a new tab.')}`,
      action: action('start_assistant', t('gbrain.setup_start_assistant', 'Start your first Personal Assistant')) };
  }
  return { ...base, state: 'ready', tone: 'ok', summary: 'running', readings, observedAt,
    status: t('gbrain.setup_status_ready', 'Everything is good to go'),
    next: t('gbrain.setup_next_ready', 'Start your first Personal Assistant: an Agent that remembers through gbrain. It opens in a new tab. Link accounts from there, one at a time, when you want them.'),
    action: action('start_assistant', t('gbrain.setup_start_assistant', 'Start your first Personal Assistant')) };
}

/** The request the surface hands to a new Agent when gbrain is not answering. */
export function gbrainAssistantPrompt(state) {
  return state === 'ready' || state === 'running'
    ? 'Help me start using gbrain. Show me how to save and find shared knowledge, and explain any outside connection before asking me to approve it.'
    : 'Check why the local gbrain process is not running. Explain what you find before changing anything.';
}
