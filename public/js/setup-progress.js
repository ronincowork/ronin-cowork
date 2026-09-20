/* Painter-only reading of the server-owned Setup progress resource. */
import { SETUP_SCENES } from './setup-journey.js';

export const SETUP_STEP_IDS = Object.freeze(['provider', 'register', 'workspace', 'installations', 'password']);

export function setupSteps(payload) {
  const source = Array.isArray(payload?.steps) ? payload.steps : [];
  const byId = new Map(source.map((step) => [step?.id, step]));
  return SETUP_STEP_IDS.map((id, index) => ({
    id, number: index + 1,
    label: SETUP_SCENES.find((scene) => scene.id === id)?.label || id,
    answered: byId.get(id)?.answered === true,
    answer: byId.get(id)?.answer === 'acted' || byId.get(id)?.answer === 'not_now' ? byId.get(id).answer : '',
  }));
}

export const firstUnansweredSetupStep = (payload) => setupSteps(payload).find((step) => !step.answered)?.id || '';
export const setupIsComplete = (payload) => firstUnansweredSetupStep(payload) === '';
