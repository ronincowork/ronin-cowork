const el = (tag, cls = '', text = '') => {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  return node;
};

const answerFor = (progress, id) => progress?.steps?.find((step) => step.id === id)?.answer || '';

function zoneModel(id, progress, facts = {}) {
  const answer = answerFor(progress, id);
  if (id === 'provider') return Number(facts.activated_count || 0) > 0 || answer === 'acted'
    ? { state: 'Provider signed in and authenticated.', picks: [['Good to go', 'advance']] }
    : { state: 'No provider found on this machine.', picks: [['Sign in a provider', 'signIn']] };
  if (id === 'register') {
    if (facts.registered) return { state: 'Registration complete.', picks: [['Good to go', 'advance']] };
    return { state: 'Register to join the community and share your experience — it makes Ronin better for everyone.', picks: [['Register', 'register'], ['No thank you', 'decline', answer === 'not_now']] };
  }
  if (id === 'workspace') {
    if (facts.connected || answer === 'acted') return { state: 'GitHub connected.', picks: [['Good to go', 'advance']] };
    return { state: 'No GitHub connection found.', picks: [['Connect GitHub', 'connect'], ["I don't use GitHub", 'decline', answer === 'not_now']] };
  }
  if (id === 'installations') {
    if (facts.installed) return { state: 'Ronin Services installed.', picks: [['Good to go', 'advance']] };
    if (!facts.registered) return { state: 'Ronin Services not installed. Registration required.', picks: [['Register first', 'registerFirst'], ['No thank you', 'decline', answer === 'not_now']] };
    return { state: 'Ronin Services not installed. No cost.', picks: [['No thank you', 'decline', answer === 'not_now']] };
  }
  if (facts.required || answer === 'acted') return { state: facts.required ? 'Password added.' : 'Password answered.', picks: [['Good to go', 'advance']] };
  if (facts.tailscale ?? progress?.facts?.tailscale) return { state: 'Tailscale available. Add a password as well?', picks: [['Tailscale only', 'tailscale', answer === 'not_now'], ['Add password', 'password']] };
  return { state: 'Tailscale not installed.', picks: [['Add password', 'password']] };
}

/** The owner-approved Setup header zone: settled state/pick structure, fed only facts. */
export function createSetupZone(id, environment, controls = {}) {
  const zone = el('div', 'setup-zone');
  const state = el('p', 'setup-zone-state');
  const options = el('div', 'setup-zone-options');
  zone.append(state, options);
  let facts = {};
  const paint = () => {
    const model = zoneModel(id, environment?.setupProgress?.(), facts);
    state.textContent = model.state;
    options.replaceChildren(...model.picks.map(([label, action, pressed = false]) => {
      const button = el('button', 'setup-zone-pick');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(pressed));
      button.append(el('span', 'setup-zone-pick-name', label));
      button.addEventListener('click', () => controls[action]?.());
      return button;
    }));
  };
  const stop = environment?.onSetupProgress?.(paint) || (() => {});
  paint();
  return { el: zone, setFacts: (next) => { facts = { ...facts, ...(next || {}) }; paint(); }, paint, destroy: stop };
}
