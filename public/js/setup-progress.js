/* Painter-only reading of Setup's ticks, which the server reads from the office's facts (src/setup-progress.ts, KAN-768).
   The steps and their order are the server's answer; nothing here keeps a copy. */
import { SETUP_SCENES } from './setup-journey.js';

export function setupSteps(payload) {
  const source = Array.isArray(payload?.steps) ? payload.steps : [];
  return source.map((step, index) => ({
    id: step.id, number: index + 1,
    label: SETUP_SCENES.find((scene) => scene.id === step.id)?.label || step.id,
    answered: step.answered === true,
  }));
}

export const firstUnansweredSetupStep = (payload) => setupSteps(payload).find((step) => !step.answered)?.id || '';

