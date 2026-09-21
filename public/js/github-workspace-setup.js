/* Setup's GitHub authentication and clone handoff for the Workspace Folder surface. */
import { t } from './lexicon.js';
import { request } from './request.js';
import { WorkspaceKit } from './workspace-kit.js';

const el = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
const action = (label, kind) => WorkspaceKit.primitives.createAction({ label, kind }).el;

export function createGithubWorkspaceSetup({ environment, workspace = 'workspace2', onStateChange, onAuthenticated, onCloned } = {}) {
  const authBox = el('section', 'setup-github-workspace');
  const state = el('p', 'setup-fine setup-github-state');
  const install = action(t('roots.github_install', 'Install'), 'primary');
  const connect = action(t('roots.github_connect', 'Connect GitHub'), 'primary');
  const other = action(t('roots.git_other_method', 'Use another method'));
  const remove = action(t('roots.github_remove_auth', 'Remove authentication'), 'danger');
  const terminal = el('div', 'setup-github-terminal'); terminal.hidden = true;
  const terminalActions = el('div', 'setup-github-terminal-actions'); terminalActions.hidden = true;
  const done = action(t('roots.github_done', 'Done'), 'primary');
  const close = action(t('roots.github_close', 'Close'));
  terminalActions.append(done, close);
  const flow = el('ol', 'setup-provider-steps setup-github-steps');
  const step = (key, label) => {
    const row = el('li', 'setup-provider-step'); row.dataset.step = key;
    const mark = el('span', 'setup-provider-mark'); mark.setAttribute('aria-hidden', 'true');
    const copy = el('div', 'setup-provider-copy');
    const title = el('div', 'setup-provider-title');
    const value = el('span', 'setup-provider-state');
    const controls = el('div', 'setup-provider-control');
    title.append(el('strong', 'setup-provider-label', label), value); copy.append(title); row.append(mark, copy, controls);
    flow.append(row); return { row, mark, value, controls };
  };
  const installStep = step('install', t('roots.github_install_step', 'Install'));
  const authStep = step('authenticate', t('roots.github_auth_step', 'Authenticate'));
  const readyStep = step('ready', t('roots.github_ready_step', 'Connected'));
  installStep.controls.append(install);
  authStep.controls.append(connect, remove, other);
  authBox.append(
    el('h2', '', t('roots.github_auth_heading', 'GitHub CLI')),
    el('p', '', t('roots.github_auth_lede', 'GitHub CLI is Ronin’s recommended guided connection. Existing Git credentials, SSH, and other Git connections remain available.')),
    flow, state, terminal, terminalActions,
  );

  const cloneBox = el('section', 'setup-github-workspace');
  const cloneState = el('p', 'setup-fine setup-github-state');
  const clone = el('div', 'setup-github-clone');
  const label = el('label', '', t('roots.github_repository', 'GitHub repository'));
  const repository = el('input'); repository.type = 'text'; repository.placeholder = 'owner/repository'; repository.autocapitalize = 'off'; repository.spellcheck = false;
  const cloneButton = action(t('roots.github_clone', 'Clone and add workspace'), 'primary');
  const outcome = el('p', 'setup-fine'); outcome.setAttribute('role', 'status');
  label.append(repository); clone.append(label, cloneButton, outcome);
  cloneBox.append(
    el('h2', '', t('roots.github_clone_heading', 'Clone a repository')),
    el('p', '', t('roots.github_clone_lede', 'Clone a GitHub repository and add its folder as a Ronin workspace.')),
    cloneState, clone,
  );

  let authenticated = false;
  let account = '';
  let installed = true;
  let mounted = null;
  let watch = 0;
  let checking = false;
  let connecting = false;
  let installing = false;
  let removing = false;
  let loginAccount = null;
  let measuring = false;
  let cloning = false;
  let destroyed = false;
  let closing = null;
  let unmounting = false;
  let mountedClose = '/api/setup/github/close';

  const items = [{
    id: '\0github-auth', label: t('roots.github_auth_stone', 'GitHub CLI'),
    state: '', className: 'setup-roots-github-stone',
    renderDetail: (host) => {
      host.append(authBox); void show();
      return () => { authBox.remove(); void teardown(true); };
    },
  }, {
    id: '\0github-clone', glyph: '+', label: t('roots.github_clone_stone', 'Clone a repository'),
    state: '', className: 'setup-roots-github-stone',
    renderDetail: (host) => { host.append(cloneBox); void show(); return () => cloneBox.remove(); },
  }];

  const stopWatch = () => { if (watch) window.clearInterval(watch); watch = 0; checking = false; };
  const unmount = () => {
    unmounting = true;
    mounted?.park?.();
    mounted?.destroy?.();
    mounted = null;
    unmounting = false;
    terminal.replaceChildren();
    terminal.hidden = true;
    terminalActions.hidden = true;
  };
  const paint = (github = {}) => {
    installed = github.installed !== false;
    authenticated = github.authenticated === true;
    account = github.account || '';
    state.textContent = !installed ? t('roots.github_missing', 'GitHub CLI is not installed.')
      : authenticated ? t('roots.github_connected', 'Connected to GitHub as {account}.', { account: account || 'your account' })
        : github.state === 'unreadable' ? (github.problem || t('roots.github_unreadable', 'Ronin could not verify GitHub authentication.'))
          : t('roots.github_not_connected', 'GitHub is not connected on this machine.');
    cloneState.textContent = t('roots.github_clone_ready', 'Cloning uses this machine’s existing Git access. GitHub CLI is optional.');
    install.hidden = installed;
    install.disabled = installing || connecting || Boolean(mounted);
    connect.hidden = authenticated || !installed;
    connect.disabled = connecting || installing || removing || Boolean(mounted);
    remove.hidden = !authenticated || !installed;
    remove.disabled = removing || connecting || Boolean(mounted);
    const steps = [
      [installStep, installed, !installed, installed ? t('roots.github_installed', 'Installed') : github.installing ? t('roots.github_installing', 'Installing…') : t('roots.github_not_installed', 'Not installed')],
      [authStep, authenticated, installed && !authenticated, authenticated ? t('roots.github_signed_in', 'Signed in as {account}', { account }) : github.state === 'unreadable' ? t('roots.github_auth_unreadable', 'Could not verify') : installed ? t('roots.github_not_signed_in', 'Not signed in') : t('roots.github_after_install', 'After install')],
      [readyStep, authenticated, false, authenticated ? t('roots.github_ready', 'GitHub CLI connected') : t('roots.github_not_ready', 'Not connected')],
    ];
    steps.forEach(([part, complete, current, value], index) => {
      part.row.dataset.done = String(complete); part.row.dataset.current = String(current);
      part.mark.textContent = complete ? '✓' : String(index + 1); part.value.textContent = value;
    });
    cloneButton.disabled = cloning || !repository.value.trim();
    items[0].state = authenticated
      ? t('roots.github_auth_connected_state', 'Connected{account}', { account: account ? ` · ${account}` : '' })
      : !installed ? t('roots.github_auth_unavailable_state', 'Install GitHub CLI') : t('roots.github_auth_state', 'Connect account');
    items[1].state = t('roots.github_clone_ready_state', 'Uses existing Git access');
    items[1].disabled = false;
    onStateChange?.();
  };
  const mountAttachment = (attachment, provider = 'github', closeEndpoint = '/api/setup/github/close') => {
    if (mounted || destroyed || attachment?.type !== 'session' || !attachment.key
      || typeof environment?.mountProviderSetupSession !== 'function') return false;
    terminal.hidden = false; terminalActions.hidden = false;
    mountedClose = closeEndpoint;
    mounted = environment.mountProviderSetupSession({
      host: terminal, provider, session: attachment.key, workspace,
      onClosed: () => {
        mounted = null; stopWatch(); terminal.hidden = true; terminalActions.hidden = true;
        if (!unmounting && !destroyed) void show();
      },
    });
    if (mounted && !watch) watch = window.setInterval(() => { void poll(); }, 1500);
    return Boolean(mounted);
  };
  const show = async () => {
    if (measuring || destroyed) return null;
    measuring = true; paint({ installed, authenticated, account });
    const result = await request('/api/setup/github', { cache: 'no-store' });
    measuring = false;
    if (destroyed) return result;
    if (result.ok) {
      paint(result.data);
      if (result.data?.attachment) {
        if (loginAccount === null) loginAccount = result.data.account || '';
        mountAttachment(result.data.attachment);
      }
    } else { paint({ installed, authenticated, account }); state.textContent = result.message; }
    return result;
  };
  const teardown = async (closeRemote = false) => {
    stopWatch(); unmount(); loginAccount = null;
    if (!closeRemote || closing) return closing;
    closing = request(mountedClose, { method: 'POST' }).then((result) => {
      if (result.ok && result.data?.installed !== undefined) paint(result.data);
      else if (!result.ok && !destroyed) state.textContent = result.message;
      return result;
    }).finally(() => { closing = null; });
    return closing;
  };
  const finishAuthentication = async (github) => {
    paint(github);
    await teardown(true);
    onAuthenticated?.();
  };
  const poll = async () => {
    if (checking || destroyed) return;
    checking = true;
    try {
      const result = await request('/api/setup/github', { cache: 'no-store' });
      if (result.ok && result.data?.authenticated && (loginAccount === null || result.data.account !== loginAccount)) await finishAuthentication(result.data);
      else if (result.ok) paint(result.data);
    } finally { checking = false; }
  };

  repository.addEventListener('input', () => paint({ installed, authenticated, account }));
  install.addEventListener('click', async () => {
    if (installing || installed || mounted || destroyed) return;
    installing = true; install.disabled = true;
    try {
      const result = await request('/api/setup/github/install', { method: 'POST' });
      if (!result.ok) { state.textContent = result.message; return; }
      paint(result.data); mountAttachment(result.data?.attachment);
    } finally { installing = false; install.disabled = Boolean(mounted); }
  });
  connect.addEventListener('click', async () => {
    if (connecting || mounted || destroyed) return;
    loginAccount = account;
    connecting = true; connect.disabled = true;
    try {
      const result = await request('/api/setup/github/login', { method: 'POST' });
      if (!result.ok) { connecting = false; paint({ installed, authenticated, account }); state.textContent = result.message; return; }
      paint(result.data);
      mountAttachment(result.data?.attachment);
    } finally { connecting = false; connect.disabled = removing || Boolean(mounted); }
  });
  remove.addEventListener('click', async () => {
    if (removing || !authenticated || destroyed) return;
    removing = true; remove.disabled = true;
    state.textContent = t('roots.github_removing_auth', 'Removing GitHub authentication…');
    try {
      const result = await request('/api/setup/github/logout', { method: 'POST' });
      if (result.ok) paint(result.data); else state.textContent = result.message;
    } finally { removing = false; remove.disabled = false; }
  });
  other.addEventListener('click', async () => {
    if (mounted || destroyed) return;
    const result = await request('/api/setup/git/open', { method: 'POST' });
    if (!result.ok) { state.textContent = result.message; return; }
    state.textContent = t('roots.git_other_open', 'Use your preferred Git or SSH setup here, then return to the Workspace Folder and check Git access.');
    mountAttachment(result.data?.attachment, 'git', '/api/setup/git/close');
  });
  done.addEventListener('click', async () => {
    const result = await show();
    if (!result?.ok) return;
    if (result.data?.installed && !result.data?.authenticated && result.data?.installing) { await teardown(true); await show(); return; }
    if (!result.data?.authenticated) { state.textContent = t('roots.github_waiting', 'Finish GitHub authentication in the window first.'); return; }
    await finishAuthentication(result.data);
  });
  close.addEventListener('click', () => { void teardown(true); });
  cloneButton.addEventListener('click', async () => {
    if (cloning || !repository.value.trim()) return;
    cloning = true; cloneButton.disabled = true; outcome.textContent = t('roots.github_cloning', 'Cloning repository…');
    try {
      const result = await request('/api/setup/github/clone', { method: 'POST', json: { repository: repository.value.trim() } });
      outcome.textContent = result.ok
        ? t('roots.github_cloned', 'Added {name} as a workspace.', { name: result.data?.workspace?.name || repository.value.trim() })
        : result.message;
      if (result.ok) await onCloned?.(result.data?.workspace);
    } finally { cloning = false; cloneButton.disabled = !repository.value.trim(); }
  });

  paint({ installed: true, authenticated: false });
  return {
    items,
    show,
    destroy: () => { destroyed = true; void teardown(true); authBox.remove(); cloneBox.remove(); },
  };
}
