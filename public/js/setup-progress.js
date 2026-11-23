/* Painter-only reading of Setup's ticks, which the server reads from the office's facts (src/setup-progress.ts, KAN-768). */
import { IRASSHAI, SETUP_SCENES } from './setup-journey.js';
import { HOSTED } from './hosted.js';
import { request } from './request.js';

export const SETUP_STEP_IDS = Object.freeze(['provider', 'register', 'workspace', 'installations', 'password']);
/** A self-hosted Setup is finished when these are ticked; the other three are optional. */
export const SETUP_NEEDED = Object.freeze(['provider', 'workspace']);

export function setupSteps(payload) {
  const source = Array.isArray(payload?.steps) ? payload.steps : [];
  const byId = new Map(source.map((step) => [step?.id, step]));
  return SETUP_STEP_IDS.map((id, index) => ({
    id, number: index + 1,
    label: SETUP_SCENES.find((scene) => scene.id === id)?.label || id,
    answered: byId.get(id)?.answered === true,
  }));
}

export const firstUnansweredSetupStep = (payload) => setupSteps(payload).find((step) => !step.answered)?.id || '';

/**
 * Whether Setup is done (KAN-720, KAN-768): a hosted office's when the Helpful Assistant's
 * onboarding epic is Done (setup-journey.js onboardingDone); elsewhere when provider and
 * workspace are ticked. A read that fails counts as done, so the bare address stays Home.
 */
export async function setupFinished() {
  if (HOSTED) {
    const result = await request(`/api/work-items?holder=${IRASSHAI}&kind=epic&status=done`, { cache: 'no-store' });
    return !result.ok || (result.data.items || []).length > 0;
  }
  const result = await request('/api/setup/progress', { cache: 'no-store' });
  return !result.ok || setupSteps(result.data).filter((step) => SETUP_NEEDED.includes(step.id)).every((step) => step.answered);
}
