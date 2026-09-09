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

/** The sentence for an installed provider that has not signed in here yet. */
const signInSentence = (provider) => {
  const label = String(provider?.label || provider?.id || 'This provider');
  return `Opens ${label} in a tile here. Follow its sign-in, then press Done.`;
};

/** The sentence for a signed-in provider: what Ronin measured, or what it recorded. */
const signedInSentence = (provider) => {
  const label = String(provider?.label || provider?.id || 'This provider');
  const vendor = String(provider?.from || '').trim();
  if (provider?.signed_in) return vendor ? `${vendor} credentials are on this machine.` : `${label} credentials are on this machine.`;
  return `Sign-in recorded${provider?.activated_at ? ` ${recordedDay(provider.activated_at)}` : ''}. ${label} asks again itself if it ever needs to.`;
};

/**
 * Consumer copy and action intent derived only from Setup Runtime truth. The inventory
 * state is the short selector word from SETUP_WORKBENCH: activated · sign-in open ·
 * needs sign-in · not installed · manual install. Signed in is measured from the CLI's
 * own credential file or recorded by Done; nothing here reads a credential.
 */
export function providerPresentation(provider) {
  const id = String(provider?.id || '');
  const label = String(provider?.label || id || 'This provider');
  // Turned off by the owner: Ronin is not using it. Said in the owner's own terms — the
  // sign-in is kept — so nobody fears that off meant signed out.
  if (provider?.off && provider?.installed) return {
    inventoryState: 'Off',
    detail: `Turned off — Ronin is not using ${label}. Your sign-in is kept.`,
    action: 'off',
  };
  if (provider?.login_open) return {
    inventoryState: 'Sign-in open',
    detail: `Finish signing in to ${label} in the tile, then press Done. Close keeps things as they were.`,
    action: 'login_open',
  };
  if (provider?.activated) return {
    inventoryState: 'Activated',
    detail: signedInSentence(provider),
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
 * The three steps of a selected provider, in order, from the runtime row alone: Install,
 * Authenticate, Ready. Each step carries its status key, at most one short detail line,
 * an optional install command, the real action it owns, whether it is done, and whether
 * it is the current step: exactly the first unmet one. This is the only source the
 * surface reads. There is no opt-in step: nothing at launch read one.
 */
const STEP_DONE = Object.freeze({ installed: 'installed', authenticated: 'recorded', ready: 'ready' });

export function providerReadiness(provider) {
  const presentation = providerPresentation(provider);
  const installed = provider?.installed === true;
  const activated = provider?.activated === true;
  const loginOpen = provider?.login_open === true;
  // Off: the sign-in step keeps saying what it measured (signed in, or not) and owns no
  // control; the Ready step is the one current step, and its control is Turn on.
  if (installed && provider?.off === true) {
    const signed = provider?.signed_in === true || Boolean(provider?.activated_at);
    return [
      { key: 'installed', label: 'Install', status: 'installed', detail: '', command: '', action: 'none', manual: null, done: true, current: false },
      { key: 'authenticated', label: 'Authenticate', status: signed ? 'recorded' : 'available', detail: signed ? signedInSentence(provider) : signInSentence(provider), action: 'none', done: signed, current: false },
      { key: 'ready', label: 'Ready', status: 'off', detail: presentation.detail, action: 'turn_on', done: false, current: true },
    ];
  }
  const steps = [
    {
      key: 'installed', label: 'Install', status: installed ? 'installed' : 'not_installed',
      detail: installed ? '' : presentation.detail,
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
      detail: activated ? '' : 'After sign-in.', action: 'none',
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
