/* Selector-driven workspace-2 surfaces for the Ronin Setup workbench. */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { buildGbrain } from './gbrain.js';
import { buildProjectRoots } from './projectroots.js';
import { CAMPAIGN_TEMPLATES_TYPE, campaignTemplatesDefinition } from './campaign-templates.js';
import { mountProviderAttachment, providerFromRuntime, providerPresentation } from './setup-provider-state.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { createNewTeamFormView } from './new-team-form.js';
import { createNewAgentView } from './new-agent.js';

export { mountProviderAttachment, providerFromRuntime, providerOffers, providerPresentation } from './setup-provider-state.js';

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
  const email = input('email', 'email'); email.placeholder = 'you@example.com';
  const purpose = input('purpose'); purpose.placeholder = t('setup_surface.purpose_hint', 'What would you like Ronin to help with?');
  const kind = el('select'); kind.name = 'kind';
  for (const [value, label] of [['', 'Choose…'], ['work', 'Work'], ['personal', 'Personal'], ['learning', 'Learning'], ['other', 'Something else']]) kind.add(new Option(label, value));
  const userType = el('select'); userType.name = 'user_type';
  for (const [value, label] of [['', 'Choose…'], ['individual', 'Individual'], ['team', 'Team'], ['builder', 'Builder'], ['exploring', 'Exploring']]) userType.add(new Option(label, value));
  const own = el('textarea'); own.name = 'own_words'; own.rows = 3;
  const identity = el('div', 'setup-registration-identity');
  const form = el('form', 'setup-form setup-register-form');
  const registrationDetails = el('details', 'setup-register-disclosure');
  const registrationFields = el('div', 'setup-register-disclosure-body');
  registrationDetails.append(el('summary', '', t('setup_surface.registration_details', 'Optional profile')), registrationFields);
  registrationFields.append(
    field(t('setup_surface.purpose', 'Why you use Ronin'), purpose), field(t('setup_surface.kind', 'Kind'), kind),
    field(t('setup_surface.user_type', 'Type of user'), userType), field(t('setup_surface.own_words', 'How you use Ronin (optional)'), own),
  );
  form.append(
    el('p', 'setup-lede', t('setup_surface.register_lede', 'Optional. Registration unlocks access to Ronin Services; local Ronin keeps working without it.')),
    field(t('setup_surface.email', 'Email'), email), registrationDetails,
    el('p', 'setup-fine', t('setup_surface.consent_exact', 'Confirmation grants Services access. Communication is off until you choose otherwise.')),
    action(t('setup_surface.register_action', 'Register'), '', async () => {
      notice.textContent = t('setup_surface.saving', 'Saving…');
      const result = await request('/api/setup/registration', { method: 'POST', json: { email: email.value, purpose: purpose.value, kind: kind.value, user_type: userType.value, own_words: own.value } });
      notice.textContent = result.ok ? t('setup_surface.confirm_email', 'Registration saved. Confirm the email to receive Services entitlement.') : result.message;
      if (result.ok) { current = result.data; paint(); }
    }), notice,
  );
  const prefs = el('form', 'setup-form setup-preferences');
  const checks = Object.fromEntries(['newsletter', 'release_updates', 'no_communication'].map((name) => [name, input(name, 'checkbox')]));
  const followUps = Object.fromEntries(['product_research', 'interviews', 'support'].map((name) => [name, input(name, 'checkbox')]));
  const prefNotice = el('p', 'setup-notice');
  const recovery = el('div', 'setup-registration-recovery');
  const preferencesDisclosure = el('details', 'setup-register-disclosure setup-preferences-disclosure');
  preferencesDisclosure.append(el('summary', '', t('setup_surface.communication_preferences', 'Communication choices')), prefs);
  const recoveryDisclosure = el('details', 'setup-register-disclosure setup-recovery-disclosure');
  recoveryDisclosure.append(el('summary', '', t('setup_surface.registration_options', 'Registration options')), recovery);
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
    preferencesDisclosure.hidden = !current?.submitted_at;
    recoveryDisclosure.hidden = !current?.submitted_at;
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
  body.append(identity, form, preferencesDisclosure, recoveryDisclosure); out.content.append(body);
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
    const presentation = providerPresentation(provider);
    const row = el('section', 'setup-provider');
    row.dataset.provider = provider.id;
    row.append(el('h3', '', provider.label || provider.id), el('p', 'setup-state', presentation.inventoryState));
    if (presentation.action === 'install') {
      row.append(el('p', 'setup-fine', presentation.detail), action(t('setup_surface.install', 'Install'), 'primary', async () => {
        const installed = await request('/api/install', { method: 'POST', json: { items: [{ kind: 'agent', name: provider.id }] } });
        if (!installed.ok) row.append(el('p', 'setup-notice bad', installed.message));
        else await paint();
      }));
    } else if (presentation.action === 'manual') {
      row.append(el('p', 'setup-fine', presentation.detail));
      if (presentation.manual) {
        const link = el('a', 'wk-action setup-provider-manual', presentation.manual.label);
        link.href = presentation.manual.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        row.append(link);
      } else row.append(el('p', 'setup-state', t('setup_surface.manual_only', 'Manual install only')));
    } else if (presentation.action === 'sign_in') {
      row.append(el('p', 'setup-fine', presentation.detail),
        action(t('setup_surface.sign_in', 'Open sign-in'), 'primary', async () => { await request(`/api/setup/providers/${encodeURIComponent(provider.id)}/login`, { method: 'POST', json: {} }); await paint(); }));
    } else if (presentation.action === 'login_open') {
      const terminal = el('div', 'setup-provider-terminal');
      row.append(el('p', 'setup-fine', presentation.detail), terminal,
        action(t('setup_surface.done_close', 'Done / Close'), 'primary', async () => { mounted?.park?.(); await request(`/api/setup/providers/${encodeURIComponent(provider.id)}/done`, { method: 'POST', json: {} }); await paint(); }),
        action(t('setup_surface.close', 'Close'), '', async () => { mounted?.park?.(); await request(`/api/setup/providers/${encodeURIComponent(provider.id)}/close`, { method: 'POST', json: {} }); await paint(); }));
      mounted = mountProviderAttachment(context.environment, terminal, provider, context.workspace, () => void paint());
      if (!mounted) terminal.append(el('p', 'setup-notice bad', t('setup_surface.login_attachment_missing', 'The native setup session is open but its terminal attachment is unavailable.')));
    } else row.append(el('p', 'setup-good', presentation.detail));
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
    const intro = el('section', 'setup-compact-intro');
    const values = el('ul', 'setup-value-points');
    values.append(
      el('li', '', t('setup_surface.services_value_records', 'Readable work records and memory across your work.')),
      el('li', '', t('setup_surface.services_value_library', 'Voice tools and access to the Ronin Library.')),
    );
    intro.append(
      el('p', 'setup-lede', t('setup_surface.services_intro', 'Ronin Services extends local Ronin when you want connected features.')),
      values,
      el('p', 'setup-requirement', t('setup_surface.services_requires_short', 'Requires a confirmed registration.')),
    );
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
      body.append(action(t('setup_surface.register_direct', 'Register'), '', () => context.workbench?.place(SETUP_SURFACE_TYPES.register, context.workspace || 'workspace2')));
      notifySummary(SETUP_SURFACE_TYPES.services, 'registration optional', context.workbench);
      return;
    }
    const facts = installed.ok ? installed.data?.services : {};
    const state = el('dl', 'setup-services-state');
    for (const [label, value] of [
      [t('setup_surface.entitled', 'Entitled'), registration.data?.services_entitled],
      [t('setup_surface.installed', 'Installed'), facts?.installed],
      [t('setup_surface.activated', 'Activated'), facts?.activated],
      [t('setup_surface.switched_on', 'Switched on'), facts?.switched_on],
    ]) state.append(el('dt', '', label), el('dd', '', value ? 'Yes' : 'No'));
    body.append(state);
    if (registration.data?.services_entitled && !facts?.installed) body.append(action(t('services.install_now', 'Install Services now'), 'primary', async () => {
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
    availability: () => context.environment?.setupRuntime?.gbrain || null,
  });
  return { el: out.el, show: () => { room.enter?.(); notifySummary(SETUP_SURFACE_TYPES.gbrain, 'state shown', context.workbench); } };
}

function createLaunchOwnSurface(context) {
  const out = surface(t('setup_surface.launch_own', 'Launch your own'));
  const body = el('div', 'setup-surface-body setup-launch-own');
  const renderDetail = (item, host) => {
    const views = item.id === 'template'
      ? [createNewAgentView(WorkspaceKit, {}), createNewTeamFormView(WorkspaceKit, {})]
      : [item.id === 'team' ? createNewTeamFormView(WorkspaceKit, {}) : createNewAgentView(WorkspaceKit, {})];
    host.append(...views.map((view) => view.el));
    for (const view of views) void view.enter({});
    return () => { for (const view of views) view.el.remove(); };
  };
  const stones = createStoneWorkSurface({
    items: [
      { id: 'template', glyph: '▤', label: t('template', 'Template') },
      { id: 'team', glyph: '人人', label: t('team', 'Team') },
      { id: 'agent', glyph: '人', label: t('agent', 'Agent') },
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
    campaignTemplatesDefinition(),
    definition(SETUP_SURFACE_TYPES.launchOwn, t('setup_surface.launch_own', 'Launch your own'), createLaunchOwnSurface),
  ];
}

export function registerSetupSurfaces() {
  const library = WorkspaceKit.workbench.library;
  for (const definition of setupSurfaceDefinitions()) if (!library.has(definition.type)) library.register(definition);
  return SETUP_SURFACE_TYPES;
}
