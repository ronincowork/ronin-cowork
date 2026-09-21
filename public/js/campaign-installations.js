/* part of the ronin-cowork client — see js/README.md */
/** Campaign installation choices, presented through the shared Setup stone work surface. */
import { t } from './lexicon.js';
import { request } from './request.js';
import { saveCampaign } from './campaigns.js';
import { WorkspaceKit } from './workspace-kit.js';
import { ask } from './ask.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { completeInstallationMap as completeMap } from './installation-map.js';
import { createStatusMarker } from './status-marker.js';
import { createSetupZone, setupStep, watchSetupProgress } from './setup-zone.js';

const INSTALLATION_ORDER = ['ronin_services', 'gbrain', 'trello', 'perplexity'];
const el = (tag, cls = '', text = null) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

export const completeInstallationMap = completeMap;

export function createInstallationsSurface(campaign, context = {}) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('campaign_view.installations', 'Installations'), className: 'cv-surface' });
  let catalog = [];
  let installed = null;
  let values = {};
  let defaultBehaviours = [];
  let stoneSurface = null;

  const available = (installation) => values[installation.name] === true;
  const defaultForAll = (installation) => {
    const provided = Array.isArray(installation.provides) ? installation.provides : [];
    return provided.length > 0 && provided.every((name) => defaultBehaviours.includes(name));
  };
  const comingSoon = (installation) => installation.maturity === 'comingSoon';
  const measuredInstallation = (installation) => installed?.installations?.find((row) => row.name === installation.name);
  const stateWord = (installation) => {
    if (comingSoon(installation)) return t('status.coming_soon', 'Coming soon');
    if (!installed) return t('campaign_view.status_unreadable', 'Status unreadable');
    if (installation.name === 'ronin_services' && installed.services?.installed !== true) return t('campaign_view.not_installed', 'Not installed');
    if (installation.effect === 'provider' && measuredInstallation(installation)?.available !== true) return t('campaign_view.not_installed', 'Not installed');
    return available(installation) ? t('campaign_view.on', 'On') : t('campaign_view.not_configured', 'Not configured');
  };

  const servicesReady = () => values.ronin_services === true && (installed?.services?.parts || []).length > 0;
  const gated = (name) => (name === 'trello' || name === 'perplexity') && !servicesReady();
  const blockedReason = (installation) => comingSoon(installation) ? t('status.coming_soon', 'Coming soon')
    : gated(installation.name) ? t('campaign_view.services_required', 'Ronin Services required') : '';
  const itemFor = (installation) => ({
    ...installation,
    id: installation.name,
    label: installation.label || installation.name,
    marker: createStatusMarker(installation.maturity),
    state: stateWord(installation),
    attrs: blockedReason(installation)
      ? { 'data-gated': 'true', title: blockedReason(installation) }
      : {},
  });
  const refreshStoneMarks = () => {
    for (const installation of catalog) {
      const stone = stoneSurface.el.querySelector(`[data-sws-id="${installation.name}"]`);
      if (!stone) continue;
      const reason = blockedReason(installation);
      const state = stone.querySelector('.sws-state');
      if (state) state.textContent = stateWord(installation);
      stone.toggleAttribute('data-gated', Boolean(reason));
      stone.title = reason;
    }
  };
  const acceptInstalled = (facts) => {
    installed = facts;
    refreshStoneMarks();
    paintZone();
  };

  const saveAvailability = async (installation, on, notice) => {
    const row = campaign();
    if (!row) return;
    notice.textContent = t('campaign.saving', 'saving…');
    const installations = { ...completeMap(catalog, row.config?.installations), [installation.name]: on };
    const result = await saveCampaign(row.id, { config: { installations } });
    notice.textContent = result.ok ? t('settei.saved', 'saved') : result.message;
    notice.dataset.tone = result.ok ? 'success' : 'failed';
    if (result.ok) {
      values = installations;
      refreshStoneMarks();
      context.onInstallationChange?.(installation.name, on);
      context.onInstallationsState?.({ ...values });
    }
    return result;
  };

  const saveDefault = async (installation, on, notice) => {
    const row = campaign();
    if (!row) return;
    notice.textContent = t('campaign.saving', 'saving…');
    const provided = new Set(Array.isArray(installation.provides) ? installation.provides : []);
    const kept = defaultBehaviours.filter((name) => !provided.has(name));
    const behaviours = on ? [...kept, ...provided] : kept;
    const defaults = { ...(row.config?.defaults || {}), behaviours };
    const result = await saveCampaign(row.id, { config: { defaults } });
    notice.textContent = result.ok ? t('settei.saved', 'saved') : result.message;
    notice.dataset.tone = result.ok ? 'success' : 'failed';
    if (result.ok) defaultBehaviours = behaviours;
    return result;
  };

  const featureProviderControls = (installation) => {
    const reason = blockedReason(installation);
    const notice = el('p', 'setup-notice');
    const unavailable = el('p', 'setup-gbrain-hint', t('campaign_view.turn_available_on', 'turn Available on first'));
    const availableQuestion = ask([{ fields: [{
      key: 'available', label: t('campaign_view.available', 'Available'), switch: [t('campaign_view.on', 'On'), t('campaign_view.off', 'Off')],
      off: reason,
    }] }], {
      className: 'campaign-installation-switch', value: { available: available(installation) },
      onChange: async (answer) => {
        const before = available(installation);
        const result = await saveAvailability(installation, answer.available, notice);
        if (!result?.ok) availableQuestion.set('available', before);
        refreshGates();
      },
    });
    const defaultQuestion = ask([{ fields: [{
      key: 'defaultForAll', label: t('campaign_view.default_for_all_agents', 'Default for all Agents'), switch: [t('campaign_view.on', 'On'), t('campaign_view.off', 'Off')],
      off: reason,
    }] }], {
      className: 'campaign-installation-switch', value: { defaultForAll: defaultForAll(installation) },
      onChange: async (answer) => {
        const before = defaultForAll(installation);
        const result = await saveDefault(installation, answer.defaultForAll, notice);
        if (!result?.ok) defaultQuestion.set('defaultForAll', before);
      },
    });
    const refreshGates = () => {
      const availableControl = availableQuestion.el.querySelector('[data-ask-key="available"]');
      if (availableControl) { availableControl.disabled = Boolean(reason); availableControl.title = reason; }
      const control = defaultQuestion.el.querySelector('[data-ask-key="defaultForAll"]');
      const off = !available(installation) || Boolean(reason);
      if (control) { control.disabled = off; control.title = reason || (off ? unavailable.textContent : ''); }
      unavailable.hidden = !off || Boolean(reason);
    };
    refreshGates();
    return {
      available: availableQuestion.el, defaultForAll: defaultQuestion.el, defaultNote: unavailable, notice,
      destroy: () => { availableQuestion.destroy(); defaultQuestion.destroy(); },
    };
  };

  const renderDetail = (installation, host) => {
    const controls = installation.effect === 'provider' ? featureProviderControls(installation) : null;
    const sharedContext = {
      ...context,
      installationMaturity: installation.maturity,
      tenant: { ...(context.tenant || {}), campaign: campaign()?.id },
      installationControls: controls,
      onInstallationChange: (name, on) => {
        values = { ...values, [name]: on };
        refreshStoneMarks();
        context.onInstallationChange?.(name, on);
      },
      onInstalledState: acceptInstalled,
    };
    const page = context.createInstallationSurface?.(installation.id, sharedContext) || null;
    if (page) {
      host.append(page.el);
      void page.show?.();
      return () => { controls?.destroy(); page.destroy?.(); };
    }
    if (controls) {
      const rows = el('dl', 'setup-gbrain-answers campaign-installation-answers');
      const controlRow = (label, control, note = null) => {
        const item = el('div', 'setup-gbrain-answer');
        const answer = el('dd'); answer.append(control); if (note) answer.append(note);
        item.append(el('dt', '', label), answer); rows.append(item);
      };
      controlRow(t('campaign_view.available', 'Available'), controls.available);
      controlRow(t('campaign_view.default_for_all_agents', 'Default for all Agents'), controls.defaultForAll, controls.defaultNote);
      host.append(rows, controls.notice);
    }
    return () => controls?.destroy();
  };

  stoneSurface = createStoneWorkSurface({ items: [], className: 'campaign-installations-stones', renderDetail });
  const reading = el('p', 'setup-notice');
  reading.setAttribute('role', 'status');

  /**
   * Step 4's header zone, in Setup only — Settings shows the same stones without one.
   * The states are the STEP's and never a single stone's (designer, 2026-09-20): a stone's
   * own condition already has .status-marker and .sws-state to live on, which is where
   * 'Coming soon' and a registration gate belong. So the zone says whether anything at all
   * is installed, and never names Ronin Services, gbrain, Trello or Perplexity.
   */
  const environment = context.environment;
  const zone = environment?.answerSetupStep ? createSetupZone() : null;
  let registered = null; // null until read: unknown is not the same as unregistered
  const anythingInstalled = () => installed?.services?.installed === true
    || (installed?.installations || []).some((row) => row.available === true);
  const paintZone = () => {
    if (!zone) return;
    const step = setupStep(environment, 'installations');
    // Answered is the checkmark's own condition, so the zone and the card cannot disagree.
    if (step?.answered) { zone.paint(); return; }
    if (anythingInstalled()) {
      // Nothing else answers step 4 — the Setup scan answers only provider and workspace, and
      // onInstallationChoice fires only when a choice is MADE here. Something already being
      // installed is not an answer, so the pick still has to give one; once it lands the step
      // is answered and this zone hides on the repaint.
      zone.paint({ state: 'Installed.', picks: [
        { label: 'Keep these', action: () => environment?.answerSetupStep?.('installations', 'acted') },
      ] });
      return;
    }
    const noThankYou = { label: 'No thank you', action: () => environment?.answerSetupStep?.('installations', 'not_now') };
    // Registration gates the ones Ronin maintains, so say so before offering to skip.
    if (registered === false) {
      zone.paint({
        state: 'Nothing installed. Registration required.',
        picks: [{ label: 'Register first', action: () => environment?.navigateToSurface?.('setup.register') }, noThankYou],
      });
      return;
    }
    zone.paint({ state: 'Nothing installed.', picks: [noThankYou] });
  };

  // Answering does not reload this surface, so the zone listens for the record it reads.
  const stopProgress = watchSetupProgress(environment, paintZone);
  stoneSurface.mount(surface.content, { before: zone ? [zone.el, reading] : [reading] });

  const enter = async () => {
    const [catalogResult, installedResult] = await Promise.all([
      request('/api/installations'),
      request('/api/installed', { cache: 'no-store' }),
    ]);
    if (!catalogResult.ok) {
      catalog = [];
      installed = null;
      reading.textContent = t('campaign_view.installations_read_failed', 'Installations could not be read. Nothing was changed; try again.');
      reading.dataset.tone = 'failed';
      stoneSurface.setItems([]);
      return;
    }
    const rows = Array.isArray(catalogResult.data) ? catalogResult.data : [];
    catalog = INSTALLATION_ORDER.map((name) => rows.find((row) => row.name === name)).filter(Boolean);
    acceptInstalled(installedResult.ok ? installedResult.data : null);
    if (zone && registered === null) {
      void request('/api/setup/registration', { cache: 'no-store' }).then((result) => {
        registered = result.ok ? result.data?.status === 'registered' : null;
        paintZone();
      });
    }
    reading.textContent = installedResult.ok ? '' : t('campaign_view.installation_status_read_failed', 'Installation status could not be read. Choices are shown, but their machine status is unknown.');
    reading.dataset.tone = installedResult.ok ? '' : 'failed';
    values = completeMap(catalog, campaign()?.config?.installations);
    context.onInstallationsState?.({ ...values });
    defaultBehaviours = Array.isArray(campaign()?.config?.defaults?.behaviours) ? [...campaign().config.defaults.behaviours] : [];
    stoneSurface.setItems(catalog.map(itemFor));
    // A collection surface opens showing its collection. Forcing Ronin Services open put the
    // surface straight into operation mode, which is the one view the header zone is not in.
  };

  return { el: surface.el, enter, destroy: () => { stopProgress(); stoneSurface.destroy(); } };
}

export function installationsSummary(campaign) {
  const values = campaign?.config?.installations;
  const map = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
  return t('campaign_view.installations_n', '{n} on', { n: Object.values(map).filter((value) => value === true).length });
}
