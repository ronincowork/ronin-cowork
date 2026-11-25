/* part of the ronin-cowork client — see js/README.md */
/**
 * SETTINGS V2 (owner, 2026-11-25; KAN-862): a second Settings built beside the first, so the two can be
 * compared and what is missing seen. The structure is samurai_lab wip/SETTINGS_CLEANUP.md §2: four groups,
 * no hints. Today's surfaces are reused as they are; Themes and Machine stats are new cards
 * over today's builders. When v2 is right the old Settings and its surfaces go.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { doorWorkbench, harnessKit } from './door-workbenches.js';
import { WORKBENCH_PROFILES, WORKBENCH_TYPES } from './workbench-catalog.js';
import { SETUP_SURFACE_TYPES } from './setup-surfaces.js';
import { BEHAVIOUR_SURFACE_TYPE } from './behaviour-surface.js';
import { campaignById, loadCampaigns, normalizeSelection, saveCampaign } from './campaigns.js';
import { createAgentDefaultsSurface } from './campaign-defaults.js';
import { createJiraItemsSurface, createJiraPairsSurface, createJiraPanel } from './jira-panel.js';
import { createIntegrationsPanel } from './integrations-panel.js';
import { createMachineStatusSurface } from './machine-status.js';
import { createFeedbackSurface } from './feedback.js';
import { createDocumentWorkspaceAdapter } from './docs.js';
import { installBehaviourReader } from './behaviour-reader.js';
import { buildStats } from './stats.js';
import { choice } from './campaign-desk.js';
import { setCampaignTheme, setTheme } from './theme.js';
import { loadProviderCatalog } from './form-steps.js';

const elem = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };
const enterable = (surface) => ({ el: surface.el, show: () => surface.enter() });
const BESIDE = Object.freeze({ workspace1: 'workspace2', workspace2: 'workspace1' });

/** Themes: the Desk's light or dark, for pointer and for touch surfaces. */
function createThemesSurface(campaign) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('settings2.themes', 'Themes'), className: 'cv-surface' });
  const body = elem('div', 'cv-body');
  surface.content.append(body);
  const options = () => [
    { value: 'light', label: t('campaign_view.theme_light', 'Light') },
    { value: 'dark', label: t('campaign_view.theme_dark', 'Dark') },
  ];
  const paint = () => {
    const row = campaign();
    body.replaceChildren();
    if (!row) return;
    const save = (field) => async (value) => {
      const result = await saveCampaign(row.id, { desk: { [field]: value } });
      if (result.ok) { setCampaignTheme(campaign()?.desk || {}); setTheme('auto'); }
      paint();
    };
    body.append(
      choice(t('campaign_view.theme_desktop', 'Desktop'), options(), row.desk?.theme || 'light', t('campaign_view.theme_help', 'Light or dark for pointer surfaces.'), save('theme')),
      choice(t('campaign_view.theme_mobile', 'Mobile'), options(), row.desk?.theme_mobile || 'light', t('campaign_view.theme_mobile_help', 'Light or dark for touch surfaces — iPad and phone.'), save('theme_mobile')),
    );
  };
  return { el: surface.el, show: paint };
}

/** A room built by one of today's builders (stats), on a surface of its own. */
function roomSurface(label, room, build) {
  const surface = WorkspaceKit.primitives.createSurface({ label, className: 'cv-surface' });
  const host = elem('div', `desk-pane desk-${room} show`);
  surface.content.append(host);
  let built = null;
  return { el: surface.el, show: () => { built ||= build(host); built?.enter?.(); } };
}

export function createSettingsV2View() {
  const harness = harnessKit();
  let stopReader = () => {};
  return doorWorkbench({
    id: 'settings2', profile: WORKBENCH_PROFILES.settings2, label: t('settings2.title', 'Settings v2'),
    seats: { workspace1: SETUP_SURFACE_TYPES.roots, workspace2: WORKBENCH_TYPES.campaignIntegrations },
    loaded: () => Promise.all([loadCampaigns(), loadProviderCatalog()]),
    hints: false,
    // A harness's own card is placed by its stone; it is not offered in the selector.
    selectorFilter: (type) => type !== WORKBENCH_TYPES.modelProvider,
    // The group heading over the first card of each group.
    onSelectorRefresh: (cards) => {
      const groups = [
        [SETUP_SURFACE_TYPES.roots, t('settings2.group_work', 'Workspaces and integrations')],
        [WORKBENCH_TYPES.modelStones, t('settings2.group_harness', 'Harness')],
        [WORKBENCH_TYPES.accountsRecords, t('settings2.group_models', 'Models')],
        [WORKBENCH_TYPES.settings2BehaviorDefaults, t('settings2.group_behaviors', 'Behaviors')],
        [WORKBENCH_TYPES.campaignMachineStatus, t('settings2.group_machine', 'Machine')],
      ];
      for (const [type, label] of groups) {
        const first = cards.querySelector(`[data-workbench-offer-type="${type}"]`);
        if (first) first.before(elem('h3', 'wk-selector-group', label));
      }
    },
    environment: ({ bench, ctx }) => {
      const selected = () => campaignById(normalizeSelection(ctx()?.state?.campaignSelection).primary_campaign_id);
      // Behaviors' read glyph opens a file beside it, as in Settings.
      stopReader = installBehaviourReader({
        get host() { return bench().host; },
        selected: () => bench().selected(),
        place: (...args) => bench().place(...args),
      }, WORKBENCH_TYPES.document, BEHAVIOUR_SURFACE_TYPE);
      const jira = (workspace) => createJiraPanel(selected, {
        openItems: () => bench().place(WORKBENCH_TYPES.campaignJiraItems, BESIDE[workspace] || 'workspace2'),
        openPairs: () => bench().place(WORKBENCH_TYPES.campaignJiraPairs, BESIDE[workspace] || 'workspace2'),
      });
      return {
        ...harness.environment(bench),
        selected,
        campaignIntegrations: ({ workspace }) => enterable(createIntegrationsPanel(selected, { panels: { jira: () => jira(workspace) } })),
        campaignJira: ({ workspace }) => enterable(jira(workspace)),
        campaignJiraItems: () => enterable(createJiraItemsSurface(selected)),
        campaignJiraPairs: () => enterable(createJiraPairsSurface(selected)),
        settings2Themes: () => createThemesSurface(selected),
        campaignDefaults: () => enterable(createAgentDefaultsSurface(selected)),
        campaignMachineStatus: () => createMachineStatusSurface(),
        settings2Stats: () => roomSurface(t('settings2.stats', 'Machine stats'), 'stats', (host) => buildStats(host)),
        feedback: () => createFeedbackSurface(() => bench().place(SETUP_SURFACE_TYPES.roots, bench().selected())),
        document: (detail = {}) => createDocumentWorkspaceAdapter({ root: detail.root, path: detail.path || detail.key }),
      };
    },
    destroy: () => { stopReader(); harness.destroy(); },
  });
}
