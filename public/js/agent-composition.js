import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { createNewAgentView } from './new-agent.js';

export const AGENT_COMPOSITION_TYPE = 'agent.composition';

/** Configuration is the New Agent form reopened on one existing Agent. */
export function createAgentCompositionReader(agent) {
  const view = createNewAgentView(WorkspaceKit, { configure: agent, embedded: true });
  return { el: view.el, action: view.action, show: view.enter, destroy: view.destroy };
}

export function createAgentCompositionSurface(agent) {
  const reader = createAgentCompositionReader(agent);
  const surface = WorkspaceKit.primitives.createSurface({ label: t('me.configuration', 'Configuration'), className: 'agent-composition', actions: [reader.action] });
  surface.content.append(reader.el);
  return { el: surface.el, show: reader.show, destroy: reader.destroy };
}
