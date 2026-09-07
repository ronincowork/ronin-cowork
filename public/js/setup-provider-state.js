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

const PROVIDER_MANUAL_ROUTES = Object.freeze({
  hermes: {
    label: 'Install guide',
    url: 'https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md',
  },
});

/** The day part of a recorded ISO stamp, or the stamp as written. */
const recordedDay = (value) => {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text.slice(0, 10) : text;
};

/** The sentence for an installed provider that has not recorded its native setup yet. */
const signInSentence = (provider) => {
  const label = String(provider?.label || provider?.id || 'This provider');
  const account = String(provider?.from || '').trim();
  return account
    ? `${label} signs in to ${account} in a tile here. Done / Close records it.`
    : `${label} opens its own sign-in in a tile here. Done / Close records it.`;
};

/**
 * Consumer copy and action intent derived only from Setup Runtime truth. The inventory
 * state is the short selector word from SETUP_WORKBENCH: activated · sign-in open ·
 * needs sign-in · not installed · manual install. Nothing here probes an account.
 */
export function providerPresentation(provider) {
  const id = String(provider?.id || '');
  const label = String(provider?.label || id || 'This provider');
  if (provider?.login_open) return {
    inventoryState: 'Sign-in open',
    detail: `Finish ${label}'s sign-in in the tile, then Done / Close. Close leaves it unactivated.`,
    action: 'login_open',
  };
  if (provider?.activated) return {
    inventoryState: 'Activated',
    detail: `Recorded${provider.activated_at ? ` ${recordedDay(provider.activated_at)}` : ''}. Sign-in stays with ${label}; Ronin does not monitor it.`,
    action: 'none',
  };
  if (provider?.installed) return {
    inventoryState: 'Needs sign-in',
    detail: signInSentence(provider),
    action: 'sign_in',
  };
  if (provider?.installable) {
    const command = String(provider.install || '').trim();
    return {
      inventoryState: 'Not installed',
      detail: /^npm install -g\b/.test(command) ? 'Installs globally with npm.' : command ? 'Ronin runs this on this machine.' : `Ronin can install ${label} on this machine.`,
      command,
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

/**
 * The four steps of a selected provider, in order, from the runtime row and the persisted
 * opt-in. Each step carries its status key, at most one short detail line, an optional
 * install command, the real action it owns, whether it is done, and whether it is the
 * current step: exactly the first unmet one. This is the only source the surface reads.
 */
const STEP_DONE = Object.freeze({ use: 'on', installed: 'installed', authenticated: 'recorded', ready: 'ready' });

export function providerReadiness(provider, optedIn = false) {
  const label = String(provider?.label || provider?.id || 'This provider');
  const presentation = providerPresentation(provider);
  const installed = provider?.installed === true;
  const activated = provider?.activated === true;
  const loginOpen = provider?.login_open === true;
  const steps = [
    {
      key: 'use', label: 'Use with Ronin', status: optedIn ? 'on' : 'off',
      detail: optedIn ? '' : 'Turn on to install and sign in here.', action: 'opt_in',
    },
    {
      key: 'installed', label: 'Install', status: installed ? 'installed' : 'not_installed',
      detail: installed ? String(provider?.path || '') : presentation.detail,
      command: installed ? '' : presentation.command || '',
      action: installed ? 'none' : presentation.action === 'manual' ? 'manual' : 'install',
      manual: installed ? null : presentation.manual || null,
    },
    {
      key: 'authenticated', label: 'Authenticate',
      status: activated ? 'recorded' : loginOpen ? 'open' : installed ? 'available' : 'blocked',
      detail: activated || loginOpen ? presentation.detail : installed ? signInSentence(provider) : '',
      action: loginOpen ? 'login_open' : 'sign_in',
    },
    {
      key: 'ready', label: 'Ready', status: activated ? 'ready' : 'not_ready',
      detail: activated ? `${label} is activated for Launch.` : 'After sign-in is recorded.', action: 'none',
    },
  ];
  let found = false;
  for (const step of steps) {
    step.done = step.status === STEP_DONE[step.key];
    step.current = !found && !step.done;
    if (step.current) found = true;
  }
  return steps;
}

/** Mount only the explicit Runtime attachment; never infer a provider session name. */
export function mountProviderAttachment(environment, host, provider, workspace, onClosed) {
  const attachment = provider?.attachment;
  if (!attachment || attachment.type !== 'session' || !attachment.key || typeof environment?.mountProviderSetupSession !== 'function') return null;
  return environment.mountProviderSetupSession({ host, provider, session: attachment.key, workspace, onClosed });
}
