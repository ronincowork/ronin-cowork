/** Setup is one developer path. Scenes name selector doors; they never reshape the workbench. */
export const SETUP_SCENES = Object.freeze([
  { id: 'provider', label: 'Model providers', type: 'setup.providers', canvas: 'library.setup.provider-welcome' },
  { id: 'register', label: 'Register (optional)', type: 'setup.register', canvas: 'library.setup.register' },
  { id: 'workspace', label: 'Workspace folders', type: 'setup.roots', canvas: 'library.setup.workspace' },
  { id: 'installations', label: 'Installations', type: 'setup.installations', canvas: 'library.setup.installations' },
  { id: 'password', label: 'Password', type: 'machine.password', canvas: 'library.setup.password' },
  { id: 'bounty', label: 'Bounty Program', type: 'setup.bounty', canvas: 'library.setup.bounty' },
  { id: 'launch', label: 'Launch', type: 'setup.launch-own', canvas: 'library.setup.launch' },
].map((scene, index) => Object.freeze({ ...scene, number: index + 1 })));

export function automaticSetupScene(runtime = {}) {
  return Number(runtime?.activated_count || 0) > 0 ? 3 : 1;
}

export function setupJourney(runtime = {}, sceneOverride = 0) {
  const requested = Number(sceneOverride);
  const number = Number.isInteger(requested) && requested >= 1 && requested <= SETUP_SCENES.length
    ? requested
    : automaticSetupScene(runtime);
  return SETUP_SCENES[number - 1];
}
