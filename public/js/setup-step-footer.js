import { WorkspaceKit } from './workspace-kit.js';

const node = (tag, cls = '', text = '') => { const made = document.createElement(tag); made.className = cls; made.textContent = text; return made; };

export function createSetupStepFooter({ number, status, answered = false, actions = [] }) {
  const footer = node('footer', 'setup-step-footer');
  const reading = node('p', 'setup-step-answer');
  reading.dataset.answered = String(answered);
  reading.append(`Step ${number} · `, node('b', '', status));
  footer.append(reading);
  for (const spec of actions) {
    const action = WorkspaceKit.primitives.createAction({ label: spec.label, kind: spec.kind || '', action: spec.action });
    if (spec.quiet) action.el.dataset.kind = spec.quiet;
    footer.append(action.el);
  }
  return footer;
}

export function replaceSetupStepFooter(host, spec) {
  host.querySelector('.setup-step-footer')?.remove();
  host.append(createSetupStepFooter(spec));
}

export function mountSetupStepFooter(host, environment, spec) {
  const paint = (progress = environment?.setupProgress?.()) => {
    const answered = progress?.steps?.find((step) => step.id === spec.id)?.answered === true;
    replaceSetupStepFooter(host, {
      number: spec.number,
      answered,
      status: answered ? spec.complete : spec.pending,
      actions: answered
        ? (spec.answeredActions?.() || [{ label: 'Next step', kind: 'primary', action: () => environment?.nextSetupStep?.() }])
        : spec.actions(),
    });
  };
  const unsubscribe = environment?.onSetupProgress?.(paint) || (() => {});
  paint();
  return unsubscribe;
}
