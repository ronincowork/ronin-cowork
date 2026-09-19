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
  const stateWord = (installation) => comingSoon(installation) ? t('status.coming_soon', 'Coming soon')
    : available(installation) ? t('campaign_view.on', 'On') : t('campaign_view.off', 'Off');

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
      },
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
  stoneSurface.mount(surface.content);

  const enter = async () => {
    const [catalogResult, installedResult] = await Promise.all([
      request('/api/installations'),
      request('/api/installed', { cache: 'no-store' }),
    ]);
    const rows = catalogResult.ok && Array.isArray(catalogResult.data) ? catalogResult.data : [];
    catalog = INSTALLATION_ORDER.map((name) => rows.find((row) => row.name === name)).filter(Boolean);
    installed = installedResult.ok ? installedResult.data : null;
    values = completeMap(catalog, campaign()?.config?.installations);
    context.onInstallationsState?.({ ...values });
    defaultBehaviours = Array.isArray(campaign()?.config?.defaults?.behaviours) ? [...campaign().config.defaults.behaviours] : [];
    stoneSurface.setItems(catalog.map(itemFor));
    stoneSurface.select('ronin_services');
  };

  return { el: surface.el, enter, destroy: () => stoneSurface.destroy() };
}

export function installationsSummary(campaign) {
  const values = campaign?.config?.installations;
  const map = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
  return t('campaign_view.installations_n', '{n} on', { n: Object.values(map).filter((value) => value === true).length });
}
