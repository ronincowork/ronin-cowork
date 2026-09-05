/* Pure provider discovery and explicit attachment seams for Ronin Setup. */
export function providerOffers(runtime) {
  const providers = Array.isArray(runtime?.providers) ? runtime.providers : [];
  return providers.filter((provider) => provider?.id).map((provider) => ({
    key: String(provider.id),
    provider: String(provider.id),
    label: provider.label || provider.id,
    summary: provider.state || 'absent',
    metadata: provider.path ? [provider.path] : [],
  }));
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
