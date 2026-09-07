/* Pure provider discovery and explicit attachment seams for Ronin Setup. */
export function providerOffers(runtime) {
  const providers = Array.isArray(runtime?.providers) ? runtime.providers : [];
  return providers.filter((provider) => provider?.id).map((provider) => {
    return {
      key: String(provider.id),
      provider: String(provider.id),
      label: provider.label || provider.id,
      summary: provider.state || 'absent',
      metadata: provider.path ? [provider.path] : [],
      groupKey: 'setup.providers',
    };
  });
}

export function providerFromRuntime(runtime, key) {
  return (Array.isArray(runtime?.providers) ? runtime.providers : []).find((provider) => provider?.id === key) || null;
}

const PROVIDER_SIGN_IN = Object.freeze({
  anthropic: 'Claude Code handles Anthropic account sign-in in its native setup.',
  openai: 'Codex handles OpenAI account sign-in in its native setup.',
  gemini: 'Gemini CLI handles Google account sign-in in its native setup.',
  grok: 'Grok CLI handles xAI account sign-in in its native setup.',
  hermes: 'Hermes handles Nous Research account setup in its native flow.',
});

const PROVIDER_MANUAL_ROUTES = Object.freeze({
  hermes: {
    label: 'Open Hermes install guide',
    url: 'https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md',
  },
});

/** Consumer copy and action intent derived only from Setup Runtime truth. */
export function providerPresentation(provider) {
  const id = String(provider?.id || '');
  const label = String(provider?.label || id || 'This provider');
  if (provider?.login_open) return {
    inventoryState: 'Sign-in open',
    detail: `Complete ${label}'s native setup below. Done / Close records completion; Close leaves it unactivated.`,
    action: 'login_open',
  };
  if (provider?.activated) return {
    inventoryState: 'Setup complete',
    detail: `Ronin recorded ${label} setup completion${provider.activated_at ? ` on ${provider.activated_at}` : ''}. ${label} controls current authentication and may ask you to sign in again.`,
    action: 'none',
  };
  if (provider?.installed) return {
    inventoryState: 'Sign-in unknown',
    detail: `${PROVIDER_SIGN_IN[id] || `${label} handles account sign-in in its native setup.`} Ronin has not recorded setup completion yet.`,
    action: 'sign_in',
  };
  if (provider?.installable) {
    const command = String(provider.install || '').trim();
    return {
      inventoryState: 'Install available',
      detail: id === 'grok'
        ? `Installs Grok CLI globally with npm${command ? `: ${command}` : '.'}`
        : `Ronin can install ${label} on this machine${command ? ` with ${command}` : '.'}`,
      action: 'install',
    };
  }
  const manual = PROVIDER_MANUAL_ROUTES[id] || null;
  return {
    inventoryState: 'Manual install',
    detail: String(provider?.blocked || `${label} must be installed outside Ronin. It will appear here when its command is available.`),
    action: 'manual',
    manual,
  };
}

/** Pure labels for the selected-provider opt-in, measured states, and real action routes. */
export function providerReadiness(provider, optedIn = false) {
  const label = String(provider?.label || provider?.id || 'This provider');
  const presentation = providerPresentation(provider);
  const installed = provider?.installed === true;
  const activated = provider?.activated === true;
  return [
    {
      key: 'use', label: 'Use with Ronin', status: optedIn ? 'on' : 'off',
      detail: '', action: 'opt_in',
    },
    {
      key: 'installed', label: 'Install', status: installed ? 'installed' : 'not_installed',
      detail: installed
        ? `${label} is installed${provider?.path ? ` at ${provider.path}` : '.'}`
        : presentation.detail,
      action: installed ? 'none' : presentation.action === 'manual' ? 'manual' : 'install',
      manual: installed ? null : presentation.manual,
    },
    {
      key: 'authenticated', label: 'Authenticate', status: activated ? 'recorded' : provider?.login_open ? 'open' : installed ? 'available' : 'blocked',
      detail: activated
        ? `${label} setup completion is recorded. Current sign-in remains provider-owned and is not monitored.`
        : installed ? presentation.detail : 'Install this provider before authentication.',
      action: provider?.login_open ? 'login_open' : 'sign_in',
    },
    {
      key: 'ready', label: 'Ready', status: activated ? 'ready' : 'not_ready',
      detail: activated ? `${label} is activated for Launch.` : 'Ready after authentication setup is recorded.', action: 'none',
    },
  ];
}

/** Mount only the explicit Runtime attachment; never infer a provider session name. */
export function mountProviderAttachment(environment, host, provider, workspace, onClosed) {
  const attachment = provider?.attachment;
  if (!attachment || attachment.type !== 'session' || !attachment.key || typeof environment?.mountProviderSetupSession !== 'function') return null;
  return environment.mountProviderSetupSession({ host, provider, session: attachment.key, workspace, onClosed });
}
