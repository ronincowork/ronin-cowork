/* Pure Setup presentation for gbrain: one measured snapshot → one status line, one next
 * sentence, at most one action. Browser-free; the renderer in gbrain.js paints it. */
import { t } from './lexicon.js';

export const GBRAIN_SETUP_STATES = Object.freeze([
  'services_needed', 'not_installed', 'installing', 'install_failed', 'removing', 'running', 'stopped', 'unreadable',
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

// The house posture reads as ok: a running local process, loopback only, no outside model.
const toneOf = (v) => (['running', 'vm_only', 'none'].includes(v) ? 'ok' : v === 'stopped' ? 'bad' : 'warn');

const action = (id, label) => ({ id, label });

/** The measured rows a running or stopped install can show. Never asserted: every value is the snapshot's own. */
function facts(data) {
  const connected = data.integrationsKnown ? (data.integrations || []).filter((item) => item.state === 'connected').length : null;
  const integrations = connected === null ? word('unknown') : connected ? t('gbrain.n_connected', '{n} connected', { n: connected }) : word('none');
  return [
    [t('gbrain.process', 'Local gbrain process'), word(data.process?.state), toneOf(data.process?.state)],
    [t('gbrain.embeddings', 'Local embeddings'), word(data.search?.weights), toneOf(data.search?.weights)],
    [t('gbrain.setup_reach', 'Reach'), word(data.listener?.scope), toneOf(data.listener?.scope)],
    [t('gbrain.setup_outside_model', 'Outside model use'), word(data.externalModelProvider), toneOf(data.externalModelProvider)],
    [t('gbrain.integrations', 'Integrations'), integrations, connected === null ? 'warn' : connected ? 'warn' : 'ok'],
  ];
}

/**
 * @param {{ok:boolean,status?:number,data?:object}|null} result  the /api/gbrain read
 * @param {{installed?:boolean,active?:boolean}|null} availability  Ronin's own runtime fact about the gbrain part
 */
export function gbrainSetupModel(result, availability = null) {
  const knownInstalled = availability?.installed === true;
  const base = { facts: [], log: null, polling: false, observedAt: null };
  if (!result?.ok) {
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
  const running = data.process?.state === 'running';
  if (running) {
    const mode = data.search?.mode;
    return { ...base, state: 'running', tone: 'ok', summary: 'running', facts: facts(data), observedAt,
      status: t('gbrain.setup_status_running', 'Running on this machine'),
      next: mode === 'hybrid'
        ? t('gbrain.setup_next_hybrid', 'Search is hybrid: by keyword and by meaning. Agents connect through MCP.')
        : mode === 'keyword_only'
          ? t('gbrain.setup_next_keyword', 'Search is keyword-only until the local embedding weights are running. Agents connect through MCP.')
          : t('gbrain.setup_next_running', 'Agents connect through MCP.'),
      action: action('start_assistant', t('gbrain.setup_start_assistant', 'Start with Personal Assistant')) };
  }
  return { ...base, state: 'stopped', tone: 'warn', summary: 'installed', facts: facts(data), observedAt,
    status: t('gbrain.setup_status_stopped', 'Installed · not running'),
    next: t('gbrain.setup_next_stopped', 'The local gbrain process is not answering. Ask Personal Assistant to check it before anything changes.'),
    action: action('check_assistant', t('gbrain.setup_check_assistant', 'Ask Personal Assistant to check gbrain')) };
}

/** The two requests the surface hands to Personal Assistant, by state. */
export function gbrainAssistantPrompt(state) {
  return state === 'running'
    ? 'Help me start using gbrain. Show me how to save and find shared knowledge, and explain any outside connection before asking me to approve it.'
    : 'Check why the local gbrain process is not running. Explain what you find before changing anything.';
}
