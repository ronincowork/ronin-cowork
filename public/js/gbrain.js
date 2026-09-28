/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { store } from './store.js';
import { t } from './lexicon.js';
import { gbrainAssistantPrompt, gbrainSetupModel } from './gbrain-setup-state.js';

/**
 * gbrain's Ronin Setup work surface: the measured installation and linked accounts, then
 * one next step, painted from gbrain-setup-state.js.
 *
 * OPEN (`enter`) reads GET /api/gbrain once and listens for {t:'gbrain', snapshot}; an
 * install or removal pushes the same answer as it moves and once when it ends. A press
 * paints its own request's answer. CLOSE (`close`) stops listening. Nothing polls.
 */
export function buildGbrain(root, askPersonalAssistant, options = {}) {
  const renderSetup = (result) => {
    const model = gbrainSetupModel(result, options.availability?.());
    if (model.summary) options.onState?.(model.summary, model);
    const make = (tag, className, text) => {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (text != null) el.textContent = text;
      return el;
    };
    const wrap = make('section', 'setup-gbrain-compact');
    wrap.dataset.state = model.state;
    const lockup = make('header', 'setup-gbrain-lockup');
    const glyph = make('i', 'setup-gbrain-glyph', '◇');
    glyph.setAttribute('aria-hidden', 'true');
    const identity = make('div', 'setup-gbrain-identity');
    identity.append(make('h2', '', t('pane.gbrain', 'gbrain')), make('p', 'setup-lede', t('gbrain.setup_intro', 'A shared, searchable memory for your Agents.')));
    lockup.append(glyph, identity);
    wrap.append(lockup);
    if (options.maturity === 'comingSoon') {
      wrap.append(make('p', 'status-marker', t('status.coming_soon', 'Coming soon')));
      root.replaceChildren(wrap);
      return;
    }

    const answers = make('dl', 'setup-gbrain-answers');
    const row = (question, tone = '') => {
      const item = make('div', 'setup-gbrain-answer');
      if (tone) item.dataset.tone = tone;
      const dd = make('dd');
      item.append(make('dt', '', question), dd);
      answers.append(item);
      return dd;
    };
    const button = (act, className = 'wk-action') => {
      const el = make('button', className, act.label);
      el.type = 'button';
      el.dataset.action = act.id;
      return el;
    };
    const outcome = make('p', 'setup-notice setup-gbrain-outcome');
    outcome.setAttribute('role', 'status');
    const press = async (act, el) => {
      if (act.id === 'open_services') { options.openServices?.(); return; }
      if (act.id === 'open_providers') { options.openProviders?.(); return; }
      if (act.id === 'check_assistant') { askPersonalAssistant(gbrainAssistantPrompt()); return; }
      if (act.id === 'start_assistant') {
        // The same launch the Personal Assistant preset makes, in a new tab.
        if (typeof options.startAssistant !== 'function') { askPersonalAssistant(gbrainAssistantPrompt()); return; }
        el.disabled = true;
        outcome.textContent = t('gbrain.setup_launching', 'Launching…');
        const launched = await options.startAssistant();
        el.disabled = false;
        outcome.textContent = launched?.ok ? t('gbrain.setup_launched', 'Launched in a new tab.') : (launched?.message || t('gbrain.setup_launch_failed', 'Launch failed.'));
        return;
      }
      if (act.id === 'check_again') { void load(); return; }
      // Load and Retry start the installer; the answer is the snapshot with it running,
      // and each step after that arrives by push.
      el.disabled = true;
      const result = await request('/api/gbrain/install', { method: 'POST', json: {} });
      if (result.ok) { reads++; renderSetup(result); return; }
      el.disabled = false;
      outcome.textContent = result.message;
      el.after(outcome);
    };

    // 1. Installed?
    const installed = row(t('gbrain.setup_q_installed', 'Installed'), model.tone);
    const line = make('p', 'setup-gbrain-line');
    line.setAttribute('aria-live', 'polite');
    line.append(make('strong', '', model.answer));
    installed.append(line);
    if (model.hint) installed.append(make('p', 'setup-gbrain-hint', model.hint));
    if (model.log?.length) {
      const log = make('details', 'setup-gbrain-log');
      log.append(make('summary', '', t('gbrain.setup_install_log', 'Install log')), make('pre', '', model.log.join('\n')));
      installed.append(log);
    }
    if (model.action && model.action.place === 'installed') {
      const el = button(model.action);
      el.addEventListener('click', () => void press(model.action, el));
      installed.append(el);
    }

    if (options.installationControls) {
      const available = row(t('campaign_view.available', 'Available'));
      available.append(options.installationControls.available);
      const defaults = row(t('campaign_view.default_for_all_agents', 'Default for all Agents'));
      defaults.append(options.installationControls.defaultForAll, options.installationControls.defaultNote);
    }

    // Which accounts are linked? Yes or no, per account, from gbrain's own list.
    if (model.installed) {
      const accounts = row(t('gbrain.setup_q_accounts', 'Accounts linked'));
      if (!model.accounts) accounts.append(make('p', 'setup-gbrain-line', t('gbrain.setup_unreadable', 'Could not read')));
      else if (!model.accounts.length) accounts.append(make('p', 'setup-gbrain-line', t('gbrain.setup_no_accounts', 'None to link on this install.')));
      else {
        const list = make('ul', 'setup-gbrain-accounts');
        for (const account of model.accounts) {
          const item = make('li');
          item.dataset.linked = String(account.linked);
          item.append(make('span', '', account.name), make('b', '', account.linked ? t('gbrain.setup_linked', 'Linked') : t('gbrain.setup_not_linked', 'Not linked')));
          list.append(item);
        }
        accounts.append(list, make('p', 'setup-gbrain-hint', t('gbrain.setup_accounts_hint', 'Your Personal Assistant links one when you ask, with your approval.')));
      }
    }
    wrap.append(answers);
    if (options.installationControls) wrap.append(options.installationControls.notice);

    // The one next step.
    if (model.action && model.action.place === 'next') {
      const next = make('div', 'setup-gbrain-next');
      if (model.state === 'provider_first') next.append(make('p', 'setup-gbrain-line', t('gbrain.setup_provider_first', 'A model provider comes first.')));
      else next.append(make('p', 'setup-gbrain-line', t('gbrain.setup_ready', 'Everything is good to go.')));
      const el = button(model.action);
      el.addEventListener('click', () => void press(model.action, el));
      next.append(el, outcome);
      wrap.append(next);
    }
    root.replaceChildren(wrap);
  };

  // The body paints before the first read and keeps the last paint until the next answer
  // lands; `reads` makes sure an older slow read never overwrites a newer answer or push.
  let reads = 0;
  const load = async () => {
    if (!root.querySelector('.setup-gbrain-compact')) renderSetup(undefined);
    const mine = ++reads;
    const result = await request('/api/gbrain');
    if (mine === reads) renderSetup(result);
  };
  let unlisten = null;

  return {
    enter() {
      void load();
      unlisten ??= store.listen('gbrain', (message) => { reads++; renderSetup({ ok: true, data: message.snapshot }); });
    },
    close() {
      unlisten?.();
      unlisten = null;
    },
  };
}
