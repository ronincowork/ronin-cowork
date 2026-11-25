/* part of the ronin-cowork client — see js/README.md */
/**
 * SETTINGS V2 (owner, 2026-11-25; KAN-862, KAN-867): a second Settings built beside the first, so the two can be
 * compared and what is missing seen. The sections are the agreed outline, samurai_lab wip/MACHINE_SETTINGS_V2.md;
 * no hints. Today's surfaces are reused under Settings' own card names; page designs come later.
 * When v2 is right the old Settings and its surfaces go.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { doorWorkbench, harnessKit } from './door-workbenches.js';
import { WORKBENCH_PROFILES, WORKBENCH_TYPES } from './workbench-catalog.js';
import { SETUP_SURFACE_TYPES } from './setup-surfaces.js';
import { createBehaviourSurface } from './behaviour-surface.js';
import { campaignById, loadCampaigns, normalizeSelection } from './campaigns.js';
import { createAgentDefaultsSurface } from './campaign-defaults.js';
import { createJiraItemsSurface, createJiraPairsSurface, createJiraPanel } from './jira-panel.js';
import { createIntegrationsPanel } from './integrations-panel.js';
import { createMachineStatusSurface } from './machine-status.js';
import { createFeedbackSurface } from './feedback.js';
import { createDocumentWorkspaceAdapter } from './docs.js';
import { installBehaviourReader } from './behaviour-reader.js';
import { buildStats } from './stats.js';
import { loadProviderCatalog } from './form-steps.js';

const elem = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };
const enterable = (surface) => ({ el: surface.el, show: () => surface.enter() });
const BESIDE = Object.freeze({ workspace1: 'workspace2', workspace2: 'workspace1' });


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
    seats: { workspace1: WORKBENCH_TYPES.modelStones, workspace2: WORKBENCH_TYPES.settings2ModelServices },
    loaded: () => Promise.all([loadCampaigns(), loadProviderCatalog()]),
    hints: false,
    // A harness's own card is placed by its stone; it is not offered in the selector.
    selectorFilter: (type) => type !== WORKBENCH_TYPES.modelProvider,
    // The five agreed sections (MACHINE_SETTINGS_V2.md): a heading over the first card of each.
    onSelectorRefresh: (cards) => {
      const groups = [
        [WORKBENCH_TYPES.modelStones, t('settings2.group_harness', 'Harnesses and models')],
        [WORKBENCH_TYPES.settings2AgentDefaults, t('settings2.group_defaults', 'Office defaults')],
        [SETUP_SURFACE_TYPES.roots, t('settings2.group_work', 'Workspaces and integrations')],
        [WORKBENCH_TYPES.settings2BehaviorFiles, t('settings2.group_advanced', 'Advanced')],
      ];
      for (const [type, label] of groups) {
        const first = cards.querySelector(`[data-workbench-offer-type="${type}"]`);
        if (first) first.before(elem('h3', 'wk-selector-group', label));
      }
    },
    environment: ({ bench, ctx }) => {
      const selected = () => campaignById(normalizeSelection(ctx()?.state?.campaignSelection).primary_campaign_id);
      // Behavior files' read glyph opens a file beside it, as in Settings.
      stopReader = installBehaviourReader({
        get host() { return bench().host; },
        selected: () => bench().selected(),
        place: (...args) => bench().place(...args),
      }, WORKBENCH_TYPES.document, WORKBENCH_TYPES.settings2BehaviorFiles);
      const env = harness.environment(bench);
      const jira = (workspace) => createJiraPanel(selected, {
        openItems: () => bench().place(WORKBENCH_TYPES.campaignJiraItems, BESIDE[workspace] || 'workspace2'),
        openPairs: () => bench().place(WORKBENCH_TYPES.campaignJiraPairs, BESIDE[workspace] || 'workspace2'),
      });
      return {
        ...env,
        selected,
        settings2ModelServices: ({ workspace }) => env.accounts(workspace),
        settings2ModelSetup: ({ workspace }) => env.modelsRecords(workspace),
        settings2ModelDefaults: () => env.modelDefaults(),
        settings2BehaviorFiles: ({ detail }) => createBehaviourSurface(detail),
        campaignIntegrations: ({ workspace }) => enterable(createIntegrationsPanel(selected, { panels: { jira: () => jira(workspace) } })),
        campaignJira: ({ workspace }) => enterable(jira(workspace)),
        campaignJiraItems: () => enterable(createJiraItemsSurface(selected)),
        campaignJiraPairs: () => enterable(createJiraPairsSurface(selected)),
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
