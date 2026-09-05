/* Pure provider discovery and explicit attachment seams for Ronin Setup. */
export const SETUP_REQUIREMENT_TARGETS = Object.freeze({
  providers: 'setup.providers',
  provider: (id) => `setup.provider:${String(id)}`,
  gbrain: 'setup.gbrain',
  services: 'setup.services',
});

export const setupRequirementClass = (key) => `setup-requirement-${String(key).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '')}`;

export function providerOffers(runtime) {
  const providers = Array.isArray(runtime?.providers) ? runtime.providers : [];
  return providers.filter((provider) => provider?.id).map((provider) => {
    const targetKey = SETUP_REQUIREMENT_TARGETS.provider(provider.id);
    return {
      key: String(provider.id),
      provider: String(provider.id),
      label: provider.label || provider.id,
      summary: provider.state || 'absent',
      metadata: provider.path ? [provider.path] : [],
      targetKey,
      targetClass: setupRequirementClass(targetKey),
    };
  });
}

export function providerFromRuntime(runtime, key) {
  return (Array.isArray(runtime?.providers) ? runtime.providers : []).find((provider) => provider?.id === key) || null;
}

/** Mount only the explicit Runtime attachment; never infer a provider session name. */
export function mountProviderAttachment(environment, host, provider, workspace, onClosed) {
  const attachment = provider?.attachment;
  if (!attachment || attachment.type !== 'session' || !attachment.key || typeof environment?.mountProviderSetupSession !== 'function') return null;
  return environment.mountProviderSetupSession({ host, provider, session: attachment.key, workspace, onClosed });
}
