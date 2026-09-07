/* Selector-driven workspace-2 surfaces for the Ronin Setup workbench. */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { buildGbrain } from './gbrain.js';
import { buildProjectRoots } from './projectroots.js';
import { CAMPAIGN_TEMPLATES_TYPE, createTemplatesSurface } from './campaign-templates.js';
import { mountProviderAttachment, providerFromRuntime, providerPresentation } from './setup-provider-state.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { createNewTeamFormView } from './new-team-form.js';
import { createNewAgentView } from './new-agent.js';

export { mountProviderAttachment, providerFromRuntime, providerOffers, providerPresentation, providerReadiness } from './setup-provider-state.js';

export const SETUP_SURFACE_TYPES = Object.freeze({
  register: 'setup.register', providers: 'setup.providers', roots: 'setup.roots',
  services: 'setup.services', gbrain: 'setup.gbrain', templates: CAMPAIGN_TEMPLATES_TYPE, launchOwn: 'setup.launch-own',
});

const summaries = new Map([
  [SETUP_SURFACE_TYPES.register, 'optional'],
  [SETUP_SURFACE_TYPES.providers, 'none yet'],
  [SETUP_SURFACE_TYPES.roots, '2 folders'],
  [SETUP_SURFACE_TYPES.services, 'not active'],
  [SETUP_SURFACE_TYPES.gbrain, 'not installed'],
  [SETUP_SURFACE_TYPES.launchOwn, 'template · team · agent'],
]);
const el = (tag, cls = '', text = null) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };
const notifySummary = (type, value, workbench) => { summaries.set(type, value); workbench?.refreshSelector?.(); };
const surface = (label, className = '') => WorkspaceKit.primitives.createSurface({ label, className: `setup-surface ${className}`.trim() });
const action = (label, kind, onClick) => {
  const made = WorkspaceKit.primitives.createAction({ label, kind, action: onClick });
  return made.el ?? made;
};

/** The only furniture shared by Services and gbrain. */
export function setupExplainer({ usedFor, requires, use }) {
  const details = el('details', 'setup-explainer');
  const summary = el('summary', '', t('setup_surface.about', 'About this'));
  const body = el('div', 'setup-explainer-body');
  for (const [heading, copy] of [
    [t('setup_surface.used_for', 'What this is used for'), usedFor],
    [t('setup_surface.requires', 'What is required'), requires],
    [t('setup_surface.how', 'How to use it'), use],
  ]) body.append(el('h3', '', heading), el('p', '', copy));
  details.append(summary, body);
  return details;
}

function createRegisterSurface(context) {
  const out = surface(t('setup_surface.register', 'Register'));
  const body = el('div', 'setup-surface-body setup-register-compact');
  const notice = el('p', 'setup-notice');
  let current = null;
  const field = (label, control) => { const wrap = el('label', 'setup-field'); wrap.append(el('span', '', label), control); return wrap; };
  const input = (name, type = 'text') => { const node = el('input'); node.name = name; node.type = type; return node; };
  const choiceGroup = (name, label, choices) => {
    const value = input(name, 'hidden');
    const group = el('div', 'setup-register-choice');
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
    for (const [key, text] of choices) {
      const button = el('button', 'setup-register-pill', text);
      button.type = 'button'; button.dataset.value = key; button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        value.value = key;
        for (const option of group.querySelectorAll('button')) option.setAttribute('aria-pressed', String(option === button));
      });
      group.append(button);
    }
    const wrap = el('div', 'setup-field setup-register-bounded');
    wrap.append(el('span', '', label), group, value);
    return { value, wrap };
  };
  const email = input('email', 'email'); email.placeholder = 'you@example.com';
  const purpose = input('purpose'); purpose.placeholder = t('setup_surface.purpose_hint', 'What would you like Ronin to help with?');
  const kind = choiceGroup('kind', t('setup_surface.kind', 'Kind of use'), [['work', 'Work'], ['personal', 'Personal'], ['learning', 'Learning'], ['other', 'Something else']]);
  const userType = choiceGroup('user_type', t('setup_surface.user_type', 'Type of user'), [['individual', 'Just me'], ['team', 'A team'], ['builder', 'Builder'], ['exploring', 'Exploring']]);
  const own = el('textarea'); own.name = 'own_words'; own.rows = 3;
  const identity = el('div', 'setup-registration-identity');
  const form = el('form', 'setup-form setup-register-form');
  const welcome = el('div', 'setup-register-welcome');
  welcome.append(el('h2', '', t('setup_surface.register_welcome', 'Welcome to Ronin')), el('p', 'setup-lede', t('setup_surface.register_lede', 'Tell us a little about you and how Ronin fits your work. Registration is optional, and local Ronin keeps working without it.')));
  const about = el('section', 'setup-register-group');
  about.append(el('h3', '', t('setup_surface.about_you', 'About you')), field(t('setup_surface.email', 'Email'), email), userType.wrap);
  const fit = el('section', 'setup-register-group');
  fit.append(
    el('h3', '', t('setup_surface.ronin_fit', 'How Ronin fits')), kind.wrap,
    field(t('setup_surface.purpose', 'Why you use Ronin'), purpose),
    field(t('setup_surface.own_words', 'How you use Ronin (optional)'), own),
  );
  form.append(
    welcome, about, fit,
    el('p', 'setup-fine', t('setup_surface.consent_exact', 'Confirmation grants Services access. Communication is off until you choose otherwise.')),
    action(t('setup_surface.register_action', 'Register'), '', async () => {
      notice.textContent = t('setup_surface.saving', 'Saving…');
      const result = await request('/api/setup/registration', { method: 'POST', json: { email: email.value, purpose: purpose.value, kind: kind.value.value, user_type: userType.value.value, own_words: own.value } });
      notice.textContent = result.ok ? t('setup_surface.confirm_email', 'Registration saved. Confirm the email to receive Services entitlement.') : result.message;
      if (result.ok) { current = result.data; paint(); }
    }), notice,
  );
  const prefs = el('form', 'setup-form setup-preferences');
  const checks = Object.fromEntries(['newsletter', 'release_updates', 'no_communication'].map((name) => [name, input(name, 'checkbox')]));
  const followUps = Object.fromEntries(['product_research', 'interviews', 'support'].map((name) => [name, input(name, 'checkbox')]));
  const prefNotice = el('p', 'setup-notice');
  const recovery = el('div', 'setup-registration-recovery');
  const preferences = el('section', 'setup-register-group setup-preferences-wrap');
  preferences.append(el('h3', '', t('setup_surface.communication_preferences', 'Communication choices')), prefs);
  const recoveryOptions = el('section', 'setup-register-options');
  recoveryOptions.append(el('h3', '', t('setup_surface.registration_options', 'Registration options')), recovery);
  prefs.append(
    field(t('setup_surface.newsletter', 'Newsletter'), checks.newsletter),
    field(t('setup_surface.release_updates', 'Code and release updates'), checks.release_updates),
    el('strong', '', t('setup_surface.follow_up', 'Allowed follow-up')),
    field(t('setup_surface.follow_product', 'Product research'), followUps.product_research),
    field(t('setup_surface.follow_interviews', 'Interviews'), followUps.interviews),
    field(t('setup_surface.follow_support', 'Support'), followUps.support),
    field(t('setup_surface.no_communication', 'No communication'), checks.no_communication),
    action(t('setup_surface.update_preferences', 'Update preferences'), 'primary', async () => {
      const result = await request('/api/setup/registration/communication', { method: 'PATCH', json: { newsletter: checks.newsletter.checked, release_updates: checks.release_updates.checked, no_communication: checks.no_communication.checked, follow_up: Object.entries(followUps).filter(([, box]) => box.checked).map(([name]) => name) } });
      prefNotice.textContent = result.ok ? t('setup_surface.preferences_saved', 'Preferences updated.') : result.message;
      if (result.ok) { current = result.data; paint(); }
    }), prefNotice,
  );
  checks.no_communication.addEventListener('change', () => { if (checks.no_communication.checked) { checks.newsletter.checked = false; checks.release_updates.checked = false; for (const box of Object.values(followUps)) box.checked = false; } });
  const paint = () => {
    const registered = current?.status === 'registered';
    identity.hidden = !(registered && current?.submitted_at);
    identity.replaceChildren(el('strong', '', t('setup_surface.registered', 'Registered')),
      el('span', '', [current?.email_masked, current?.purpose].filter(Boolean).join(' · ')));
    form.hidden = Boolean(current?.submitted_at);
    preferences.hidden = !current?.submitted_at;
    recoveryOptions.hidden = !current?.submitted_at;
    if (current?.communication) for (const key of Object.keys(checks)) checks[key].checked = current.communication[key] === true;
    for (const [key, box] of Object.entries(followUps)) box.checked = current?.communication?.follow_up?.includes(key) === true;
    recovery.replaceChildren();
    const changeEmail = () => action(t('setup_surface.change_registration_email', 'Change email'), '', async () => {
      const next = window.prompt(t('setup_surface.new_registration_email', 'Send registration confirmation to:'));
      if (!next?.trim()) return;
      const result = await request('/api/setup/registration/recovery', { method: 'POST', json: { action: 'change_address', email: next.trim(), purpose: current.purpose, kind: current.kind, user_type: current.user_type, own_words: current.own_words } });
      notice.textContent = result.ok ? t('setup_surface.registration_address_changed', 'Registration email changed; check the new address.') : result.message;
      if (result.ok) { current = result.data; paint(); }
    });
    if (current?.status === 'pending') {
      recovery.append(
        action(t('setup_surface.check_registration', 'Check confirmation'), 'primary', async () => {
          const result = await request('/api/setup/registration/recovery', { method: 'POST', json: { action: 'check' } });
          notice.textContent = result.ok ? t('setup_surface.registration_checked', 'Registration status updated.') : result.message;
          if (result.ok) { current = result.data; paint(); }
        }),
        action(t('setup_surface.resend_registration', 'Resend confirmation'), '', async () => {
          const result = await request('/api/setup/registration/recovery', { method: 'POST', json: { action: 'resend' } });
          notice.textContent = result.ok ? t('setup_surface.registration_resent', 'Confirmation resent.') : result.message;
        }),
        changeEmail(),
      );
    } else if (current?.submitted_at) recovery.append(changeEmail());
    if (current?.submitted_at) recovery.append(action(t('setup_surface.delete_registration', 'Delete registration'), 'danger', async () => {
      if (!window.confirm(t('setup_surface.delete_registration_confirm', 'Delete this registration and its Services entitlement from this machine? Communication preferences will also be removed.'))) return;
      const result = await request('/api/setup/registration', { method: 'DELETE' });
      notice.textContent = result.ok ? t('setup_surface.registration_deleted', 'Registration deleted. Local Ronin remains available.') : result.message;
      if (result.ok) { current = result.data; paint(); }
    }));
    notifySummary(SETUP_SURFACE_TYPES.register, current?.status || 'optional', context.workbench);
  };
  body.append(identity, form, preferences, recoveryOptions); out.content.append(body);
  return { el: out.el, show: async () => { const result = await request('/api/setup/registration', { cache: 'no-store' }); current = result.ok ? result.data : null; paint(); } };
}

/**
 * ONE MODEL PROVIDERS SURFACE. Its first face is an inventory of equal blocks, one per
 * provider in the runtime catalog, no block bigger than another. Choosing a block opens
 * that provider in place: the same adaptive stage
 * (install · native sign-in tile with Done and Close · activated) the individual surfaces
 * had, with a word back to all providers. Never a dashboard of every provider's stage.
 */
function createProviderSurface(context) {
  const out = surface(t('setup_surface.providers', 'Model providers'));
  const body = el('div', 'setup-surface-body setup-provider-list'); out.content.append(body);
  let opened = String(context.detail?.provider || context.detail?.key || '');
  let mounted = null;
  let runtime = { providers: [] };
  const disposeMount = (destroy = true) => {
    if (!mounted) return;
    if (destroy) mounted.destroy?.(); else mounted.park?.();
    mounted = null;
  };
  const summarize = (runtime) => {
    const activated = Number(runtime?.activated_count || 0);
    notifySummary(SETUP_SURFACE_TYPES.providers, activated ? t('setup_surface.providers_activated', '{n} activated', { n: activated }) : t('setup_surface.providers_none', 'none yet'), context.workbench);
  };
  const paintProvider = (providerId, host) => {
    const provider = providerFromRuntime(runtime, providerId);
    if (!provider) { host.append(el('p', 'setup-notice bad', t('setup_surface.provider_missing', 'This provider is no longer in the model-provider catalog.'))); return null; }
    const optedIn = Array.isArray(runtime.preferences?.providers) && runtime.preferences.providers.includes(provider.id);
    const presentation = providerPresentation(provider);
    const row = el('section', 'setup-provider');
    row.dataset.provider = provider.id;
    const flow = el('div', 'setup-provider-readiness');
    const use = el('label', 'setup-provider-optin');
    const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = optedIn;
    use.append(checkbox, el('span', '', t('setup_surface.provider_use', 'Use with Ronin')));
    checkbox.addEventListener('change', async () => {
      const previous = optedIn;
      const selected = new Set(Array.isArray(runtime.preferences?.providers) ? runtime.preferences.providers : []);
      if (checkbox.checked) selected.add(provider.id); else selected.delete(provider.id);
      const result = await request('/api/setup/preferences', { method: 'PATCH', json: { providers: [...selected] } });
      if (!result.ok) { checkbox.checked = previous; return; }
      runtime.preferences = result.data;
      stones.refreshDetail();
    });
    flow.append(use);
    const actionRow = (label, state, help) => {
      const item = el('section', 'setup-provider-action-row');
      const copy = el('div', 'setup-provider-action-copy');
      copy.append(el('strong', '', label), el('span', 'setup-provider-action-state', state));
      if (help) copy.append(el('p', 'setup-fine', help));
      const controls = el('div', 'setup-provider-action-control');
      item.append(copy, controls);
      flow.append(item);
      return controls;
    };
    const installControls = actionRow(
      t('setup_surface.install', 'Install'),
      provider.installed ? t('setup_surface.installed', 'Installed') : t('setup_surface.not_installed', 'Not installed'),
      provider.installed ? `${provider.label || provider.id} is installed${provider.path ? ` at ${provider.path}` : '.'}` : presentation.detail,
    );
    if (!provider.installed && presentation.action === 'manual' && presentation.manual && optedIn) {
      const link = el('a', 'wk-action setup-provider-action setup-provider-manual', presentation.manual.label);
      link.href = presentation.manual.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      installControls.append(link);
    } else {
      const install = action(t('setup_surface.install', 'Install'), 'primary', async () => {
        const installed = await request('/api/install', { method: 'POST', json: { items: [{ kind: 'agent', name: provider.id }] } });
        if (!installed.ok) return;
        else await paint();
      });
      install.classList.add('setup-provider-action');
      install.disabled = provider.installed || !optedIn || !provider.installable;
      installControls.append(install);
    }
    const authState = provider.activated
      ? t('setup_surface.auth_recorded', 'Setup recorded')
      : provider.login_open ? t('setup_surface.sign_in_open', 'Sign-in open')
        : provider.installed ? t('setup_surface.auth_available', 'Available') : t('setup_surface.install_first', 'Install first');
    const authHelp = provider.activated
      ? `${provider.label || provider.id} setup is recorded. Current sign-in remains provider-owned and is not monitored.`
      : provider.installed ? presentation.detail : t('setup_surface.install_before_auth', 'Install this provider before authentication.');
    const authControls = actionRow(t('setup_surface.authenticate', 'Authenticate'), authState, authHelp);
    if (!provider.login_open) {
      const authenticate = action(t('setup_surface.authenticate', 'Authenticate'), 'primary', async () => {
        await request(`/api/setup/providers/${encodeURIComponent(provider.id)}/login`, { method: 'POST', json: {} }); await paint();
      });
      authenticate.classList.add('setup-provider-action');
      authenticate.disabled = !optedIn || !provider.installed || provider.activated;
      authControls.append(authenticate);
    } else {
        const terminal = el('div', 'setup-provider-terminal');
        const done = action(t('setup_surface.done_close', 'Done / Close'), 'primary', async () => { mounted?.park?.(); await request(`/api/setup/providers/${encodeURIComponent(provider.id)}/done`, { method: 'POST', json: {} }); await paint(); });
        const close = action(t('setup_surface.close', 'Close'), '', async () => { mounted?.park?.(); await request(`/api/setup/providers/${encodeURIComponent(provider.id)}/close`, { method: 'POST', json: {} }); await paint(); });
        done.classList.add('setup-provider-action'); close.classList.add('setup-provider-action');
        authControls.append(done, close);
        flow.append(terminal);
        mounted = mountProviderAttachment(context.environment, terminal, provider, context.workspace, () => void paint());
        if (!mounted) terminal.append(el('p', 'setup-notice bad', t('setup_surface.login_attachment_missing', 'The native setup session is open but its terminal attachment is unavailable.')));
    }
    const ready = el('section', 'setup-provider-ready');
    ready.dataset.ready = String(provider.activated === true);
    ready.append(el('strong', '', t('setup_surface.ready', 'Ready')), el('span', '', provider.activated ? t('setup_surface.ready_launch', 'Activated for Launch') : t('setup_surface.not_ready', 'Not ready')));
    flow.append(ready);
    row.append(el('h3', '', provider.label || provider.id), flow);
    host.append(row);
    return () => disposeMount();
  };
  const stones = createStoneWorkSurface({
    selectedId: opened,
    className: 'setup-provider-stones',
    renderDetail: (item, host) => paintProvider(item.id, host),
    onSelectionChange: (id) => { opened = String(id || ''); },
  });
  const paint = async () => {
    const result = await request('/api/setup/runtime', { cache: 'no-store' });
    disposeMount();
    body.replaceChildren();
    if (!result.ok) { body.append(el('p', 'setup-notice bad', result.message)); return; }
    runtime = result.data;
    context.environment.setupRuntime = runtime;
    context.workbench?.refreshSelector?.();
    const providers = (Array.isArray(runtime.providers) ? runtime.providers : []).filter((provider) => provider?.id);
    if (!providers.length) body.append(el('p', 'setup-fine', t('setup_surface.no_catalog', 'No model providers are in the catalog on this machine.')));
    else {
      stones.setItems(providers.map((provider) => ({
        id: String(provider.id), label: provider.label || provider.id, state: providerPresentation(provider).inventoryState,
        className: 'setup-provider-stone', attrs: { 'data-provider': provider.id, 'data-activated': String(provider.activated === true) },
      })));
      stones.mount(body);
    }
    summarize(runtime);
  };
  return { el: out.el, show: paint, destroy: () => { disposeMount(); stones.destroy(); } };
}

function createRootsSurface(context) {
  const out = surface(t('setup_surface.roots', 'Workspace folders'));
  const host = el('div', 'desk-pane desk-proj show'); out.content.append(host);
  const room = buildProjectRoots(host, () => host.isConnected, () => context.tenant?.campaign || '', { presentation: 'stones' });
  return { el: out.el, show: () => { room.enter(); notifySummary(SETUP_SURFACE_TYPES.roots, '2 folders + yours', context.workbench); } };
}

function createServicesSurface(context) {
  const out = surface(t('settei.ronin_services', 'Ronin Services'));
  const body = el('div', 'setup-surface-body setup-services-compact'); out.content.append(body);
  const explain = () => {
    const intro = el('section', 'setup-services-intro');
    const lockup = el('div', 'setup-services-lockup');
    const mark = el('img', 'setup-services-mark');
    mark.src = 'brand/services-mark.svg'; mark.alt = '';
    const identity = el('div', 'setup-services-identity');
    identity.append(
      el('h2', '', t('settei.ronin_services', 'Ronin Services')),
      el('p', 'setup-lede', t('setup_surface.services_intro', 'Keep your work continuous and bring Ronin’s connected tools within reach.')),
    );
    lockup.append(mark, identity);
    const values = el('div', 'setup-services-benefits');
    for (const [heading, copy] of [
      [t('setup_surface.services_continuity', 'Continue where you left off'), t('setup_surface.services_value_records', 'Readable work records and memory carry useful context across your work.')],
      [t('setup_surface.services_connected', 'Use connected tools'), t('setup_surface.services_value_library', 'Voice tools and Library access stay available through Ronin.')],
    ]) {
      const item = el('div', 'setup-services-benefit');
      item.append(el('h3', '', heading), el('p', '', copy)); values.append(item);
    }
    intro.append(lockup, values);
    return intro;
  };
  const show = async () => {
    const [registration, installed] = await Promise.all([
      request('/api/setup/registration', { cache: 'no-store' }),
      request('/api/installed', { cache: 'no-store' }),
    ]);
    body.replaceChildren();
    body.append(explain());
    if (!registration.ok || registration.data?.status === 'optional') {
      body.append(el('p', 'setup-services-enablement', t('setup_surface.services_register_enables', 'Register to confirm your access to Ronin Services. Local Ronin keeps working without it.')));
      body.append(action(t('setup_surface.register_direct', 'Register'), '', () => context.workbench?.place(SETUP_SURFACE_TYPES.register, context.workspace || 'workspace2')));
      notifySummary(SETUP_SURFACE_TYPES.services, 'registration optional', context.workbench);
      return;
    }
    const facts = installed.ok ? installed.data?.services : {};
    const entitled = registration.data?.services_entitled === true;
    const state = el('section', 'setup-services-status');
    let status = t('setup_surface.services_not_entitled', 'Registration confirmed · Services access not included');
    let next = t('setup_surface.services_access_help', 'Check Routines and Installs for Services access and activation.');
    if (entitled && !facts?.installed) {
      status = t('setup_surface.services_entitled_status', 'Services access confirmed · Ready to install');
      next = t('setup_surface.services_install_next', 'Install Services on this machine to continue.');
    } else if (facts?.installed && !facts?.activated) {
      status = t('setup_surface.services_installed_status', 'Installed · Activation needed');
      next = t('setup_surface.services_activate_next', 'Activate Services in Routines and Installs, then return here.');
    } else if (facts?.activated && !facts?.switched_on) {
      status = t('setup_surface.services_activated_status', 'Activated · Switched off');
      next = t('setup_surface.services_switch_next', 'Turn Services on in Team Configuration when you want this Cowork to use it.');
    } else if (facts?.switched_on) {
      status = t('setup_surface.services_active_status', 'Active on this Cowork');
      next = t('setup_surface.services_active_next', 'Readable work records, memory, voice tools, and Library access are ready.');
    }
    state.append(el('p', 'setup-services-status-line', status), el('p', 'setup-services-next', next));
    body.append(state);
    if (entitled && !facts?.installed) body.append(action(t('services.install_now', 'Install Services'), '', async () => {
      const result = await request('/api/services/install', { method: 'POST', json: {} });
      if (!result.ok) body.append(el('p', 'setup-notice bad', result.message)); else await show();
    }));
    notifySummary(SETUP_SURFACE_TYPES.services, facts?.switched_on ? 'active' : facts?.activated ? 'activated' : facts?.installed ? 'installed' : registration.data?.services_entitled ? 'entitled' : 'not active', context.workbench);
  };
  return { el: out.el, show };
}

function createGbrainSurface(context) {
  const out = surface(t('pane.gbrain', 'gbrain'));
  const host = el('div', 'setup-surface-body'); out.content.append(host);
  const room = buildGbrain(host, () => host.isConnected, (prompt) => context.environment?.showNewSession?.(prompt), {
    designedErrors: true,
    presentation: 'setup',
    availability: () => context.environment?.setupRuntime?.gbrain || null,
  });
  return { el: out.el, show: () => {
    const status = context.environment?.setupRuntime?.gbrain;
    notifySummary(SETUP_SURFACE_TYPES.gbrain, status?.active ? 'active' : status?.installed ? 'installed' : 'not installed', context.workbench);
    room.enter?.();
  } };
}

function createLaunchOwnSurface(context) {
  const out = surface(t('setup_surface.launch_own', 'Launch your own'));
  const body = el('div', 'setup-surface-body setup-launch-own');
  const renderDetail = (item, host) => {
    const views = [item.id === 'template'
      ? createTemplatesSurface()
      : item.id === 'team' ? createNewTeamFormView(WorkspaceKit, {}) : createNewAgentView(WorkspaceKit, {})];
    host.append(...views.map((view) => view.el));
    for (const view of views) void view.enter({});
    return () => { for (const view of views) view.el.remove(); };
  };
  const stones = createStoneWorkSurface({
    items: [
      { id: 'agent', glyph: '人', label: t('agent', 'Agent') },
      { id: 'team', glyph: '人人', label: t('team', 'Team') },
      { id: 'template', glyph: '▤', label: t('template', 'Template') },
    ],
    className: 'setup-launch-own-surface',
    renderDetail,
  });
  stones.mount(body); out.content.append(body);
  return { el: out.el, destroy: () => stones.destroy() };
}

export function setupSurfaceDefinitions() {
  const definition = (type, label, create, groupKey = '') => ({
    type, header: 'surface', label: () => label, summary: () => summaries.get(type), create: (context) => create(context),
    ...(groupKey ? { groupKey } : {}),
  });
  return [
    definition(SETUP_SURFACE_TYPES.register, t('setup_surface.register', 'Register'), createRegisterSurface),
    definition(SETUP_SURFACE_TYPES.providers, t('setup_surface.providers', 'Model providers'), createProviderSurface, 'setup.providers'),
    definition(SETUP_SURFACE_TYPES.roots, t('setup_surface.roots', 'Workspace folders'), createRootsSurface),
    definition(SETUP_SURFACE_TYPES.services, t('settei.ronin_services', 'Ronin Services'), createServicesSurface),
    definition(SETUP_SURFACE_TYPES.gbrain, t('pane.gbrain', 'gbrain'), createGbrainSurface),
    definition(SETUP_SURFACE_TYPES.launchOwn, t('setup_surface.launch_own', 'Launch your own'), createLaunchOwnSurface),
  ];
}

export function registerSetupSurfaces() {
  const library = WorkspaceKit.workbench.library;
  for (const definition of setupSurfaceDefinitions()) if (!library.has(definition.type)) library.register(definition);
  return SETUP_SURFACE_TYPES;
}
