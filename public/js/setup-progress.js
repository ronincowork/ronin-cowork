/* Painter-only reading of Setup's ticks, which the server reads from the office's facts (src/setup-progress.ts, KAN-768).
   The steps, their order and whether Setup is finished are the server's answer; nothing here keeps a copy. */
import { HOSTED_SCENES, SETUP_SCENES } from './setup-journey.js';
import { HOSTED } from './hosted.js';
import { request } from './request.js';

export function setupSteps(payload) {
  const source = Array.isArray(payload?.steps) ? payload.steps : [];
  return source.map((step, index) => ({
    id: step.id, number: index + 1,
    label: (HOSTED ? HOSTED_SCENES : SETUP_SCENES).find((scene) => scene.id === step.id)?.label || step.id,
    answered: step.answered === true,
  }));
}

export const firstUnansweredSetupStep = (payload) => setupSteps(payload).find((step) => !step.answered)?.id || '';

/**
 * Whether the bare address opens Setup (KAN-720). Hosted: never; Home shows Get started while a step
 * is open (owner, 2026-11-24; w926). Self-hosted: until provider and workspace are ticked (the
 * server's `finished`). A read that fails counts as finished, so the bare address stays Home.
 */
export async function setupFinished() {
  if (HOSTED) return true;
  const result = await request('/api/setup/progress', { cache: 'no-store' });
  return !result.ok || result.data?.finished === true;
}
