/* Persisted Setup intent. Operational readiness is deliberately not an input here. */
export const SETUP_STEP_IDS = Object.freeze(['provider', 'register', 'workspace', 'installations', 'password']);
const ANSWERS = new Set(['acted', 'not_now']);

export function setupAnswers(campaign) {
  const source = campaign?.config?.setup?.answers;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  return Object.fromEntries(SETUP_STEP_IDS.flatMap((id) => ANSWERS.has(source[id]) ? [[id, source[id]]] : []));
}

export const firstUnansweredSetupStep = (campaign) => {
  const answers = setupAnswers(campaign);
  return SETUP_STEP_IDS.find((id) => !answers[id]) || '';
};

export const setupIsComplete = (campaign) => firstUnansweredSetupStep(campaign) === '';
