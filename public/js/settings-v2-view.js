/* part of the ronin-cowork client — see js/README.md */
/**
 * SETTINGS (owner, 2026-11-25/26; KAN-857): the one Settings; built as "Settings v2" beside the old one,
 * which is gone. Its route and code keep the name settings2. Four sections, a heading over the first card of
 * each (docs/architecture/settings.md): Harnesses and models (the harness stones, Model services), Office
 * defaults, Workspaces and integrations, Advanced. No hints.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { doorWorkbench, harnessKit } from './door-workbenches.js';
import { WORKBENCH_PROFILES, WORKBENCH_TYPES } from './workbench-catalog.js';
import { createWorkspaceStones } from './workspaces-surface.js';
import { createWorkspacesRead } from './workspaces-read.js';
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
import { loadHarnessCatalog } from './form-steps.js';
import { createModelDefaults } from './models-surface.js';
import { createModelServicesSurface } from './model-services-surface.js';
import { createMembersSeeSurface } from './members-see-surface.js';
import { folderWorkbenches } from './folder-workbenches.js';

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

/** Agent defaults (KAN-871), under Advanced: the models new Agents and Team leads start on, then mandate, launch mode and behaviors. */
function officeDefaults(selected) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('settings2.agent_defaults', 'Agent defaults'), className: 'cv-surface settings2-defaults' });
  const models = createModelDefaults();
  const rest = createAgentDefaultsSurface(selected, { modelsHere: true });
  surface.content.append(
    elem('p', 'cv-note', t('settings2.defaults_example', 'A default saved here reaches what is made next. Change it today and a Workspace made tomorrow starts with it; a Team made tomorrow inside an older Workspace starts with that Workspace’s own saved default.')),
    elem('h3', 'cv-brief-head', t('settings2.defaults_models', 'Models')), models.el, rest.el,
  );
  return { el: surface.el, show: async () => { await Promise.all([models.show(), rest.enter()]); } };
}

export function createSettingsV2View() {
  const harness = harnessKit();
  let stopReader = () => {};
  return doorWorkbench({
    id: 'settings2', profile: WORKBENCH_PROFILES.settings2, label: t('settings2.title', 'Settings'),
    seats: { workspace1: WORKBENCH_TYPES.modelStones, workspace2: WORKBENCH_TYPES.settings2ModelServices },
    loaded: () => Promise.all([loadCampaigns(), loadHarnessCatalog()]),
    hints: false,
    // A harness's own card is placed by its stone; it is not offered in the selector.
    selectorFilter: (type) => type !== WORKBENCH_TYPES.modelHarness,
    // The five agreed sections (MACHINE_SETTINGS_V2.md): a heading over the first card of each.
    onSelectorRefresh: (cards) => {
      const groups = [
        [WORKBENCH_TYPES.modelStones, t('settings2.group_harness', 'Harnesses and models')],
        [WORKBENCH_TYPES.settings2MembersSee, t('settings2.appliance_access', 'Appliance Access')],
        [WORKBENCH_TYPES.campaignRoots, t('settings2.group_work', 'Workspaces and integrations')],
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
        settings2ModelServices: ({ detail }) => createModelServicesSurface({ tab: detail?.tab || 'gateway', serviceId: detail?.key || '' }),
        settings2AgentDefaults: () => officeDefaults(selected),
        settings2MembersSee: () => createMembersSeeSurface(),
        // Appliance Access is offered only when an appliance is set up (KAN-973).
        appliances: () => folderWorkbenches(),
        // Workspaces (owner, 26 Nov; KAN-900): a stone each, its Configuration alone, and New Workspace's doors.
        rootsSummary: () => t('campaign_view.roots_summary', 'Each Workspace and the folders it works in.'),
        campaignRoots: () => createWorkspaceStones({ workspacesRead: createWorkspacesRead(), workbench: bench(), withNew: true, configOnly: true }),
        settings2BehaviorFiles: ({ detail }) => createBehaviourSurface(detail),
        campaignIntegrations: ({ workspace }) => enterable(createIntegrationsPanel(selected, { panels: { jira: () => jira(workspace) } })),
        campaignJiraItems: () => enterable(createJiraItemsSurface(selected)),
        campaignJiraPairs: () => enterable(createJiraPairsSurface(selected)),
        campaignMachineStatus: () => createMachineStatusSurface(),
        settings2Stats: () => roomSurface(t('settings2.stats', 'Machine stats'), 'stats', (host) => buildStats(host)),
        feedback: () => createFeedbackSurface(() => bench().place(WORKBENCH_TYPES.campaignRoots, bench().selected())),
        document: (detail = {}) => createDocumentWorkspaceAdapter({ root: detail.root, path: detail.path || detail.key }),
      };
    },
    destroy: () => { stopReader(); harness.destroy(); },
  });
}
