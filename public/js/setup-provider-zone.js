const el = (tag, cls = '', text = '') => {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  return node;
};

/** The owner-approved Model Providers header zone; machine truth, never progress intent. */
export function createSetupProviderZone({ signIn, advance } = {}) {
  const zone = el('div', 'setup-zone');
  const state = el('p', 'setup-zone-state');
  const options = el('div', 'ask setup-zone-options');
  options.dataset.density = 'tight';
  zone.append(state, options);
  const paint = ({ activated_count = 0 } = {}) => {
    const ready = Number(activated_count) > 0;
    state.textContent = ready ? 'Provider signed in and authenticated.' : 'No provider found on this machine.';
    const button = el('button', 'ask-opt ask-rect');
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    button.append(el('span', 'ask-name', ready ? 'Good to go' : 'Sign in a provider'));
    button.addEventListener('click', ready ? advance : signIn);
    options.replaceChildren(button);
  };
  paint();
  return { el: zone, paint };
}
