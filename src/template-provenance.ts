import { mandate, type Mandate } from './agent-defaults.js';
import { listAgentTemplates } from './definitions.js';
import type { StatedBy } from './launch-profile.js';

export interface TemplateProvenanceInput {
  template?: string;
  prompt?: string;
  mandate?: Partial<Mandate>;
  behaviours?: string[];
}

/** Compare, never apply: a preset is provenance only after its values reach the form. */
export async function templateProvenance(form: TemplateProvenanceInput) {
  // The launch's template token is an AGENT template — a cast never rides one launch.
  const templates = await listAgentTemplates();
  const template = templates.find((row) => row.name === form.template);
  return {
    template,
    source: template ? [{ layer: 'template', source: template.name }] as StatedBy[] : undefined,
    brief: !!template?.brief && form.prompt === template.brief,
    mandate: !!template?.mandate
      && JSON.stringify(mandate(form.mandate)) === JSON.stringify(mandate(template.mandate)),
    behaviours: !!template?.behaviours
      && JSON.stringify([...(form.behaviours ?? [])].sort()) === JSON.stringify([...template.behaviours].sort()),
    ignored: form.template && !template ? [`template[${form.template}]`] : [],
  };
}
