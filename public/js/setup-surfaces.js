/* Selector-driven workspace-2 surfaces for the Ronin Setup workbench. */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { buildGbrain } from './gbrain.js';
import { buildProjectRoots } from './projectroots.js';
import { CAMPAIGN_TEMPLATES_TYPE, createTemplatesSurface } from './campaign-templates.js';
import { mountProviderAttachment, providerFromRuntime, providerPresentation, providerReadiness } from './setup-provider-state.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { servicesSetupModel } from './services-setup-state.js';
import { campaignById, campaigns, loadCampaigns, saveCampaign } from './campaigns.js';
import { completeRoutineMap } from './campaign-routines.js';
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
  const choiceGroup = (name, label, choices, { multiple = false } = {}) => {
    const value = input(name, 'hidden');
    const selected = new Set();
    const group = el('div', 'setup-register-choice-grid');
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
    for (const [key, text, description = ''] of choices) {
      const button = el('button', 'setup-register-choice');
      button.type = 'button'; button.dataset.value = key; button.setAttribute('aria-pressed', 'false');
      button.append(el('strong', '', text));
      if (description) button.append(el('span', '', description));
      button.addEventListener('click', () => {
        if (multiple) {
          if (selected.has(key)) selected.delete(key); else selected.add(key);
          button.setAttribute('aria-pressed', String(selected.has(key)));
          value.value = JSON.stringify([...selected]);
        } else {
          value.value = key;
          for (const option of group.querySelectorAll('button')) option.setAttribute('aria-pressed', String(option === button));
        }
      });
      group.append(button);
    }
    const wrap = el('div', 'setup-field setup-register-bounded');
    wrap.append(el('span', '', label), group, value);
    return { value, wrap, values: () => multiple ? [...selected] : value.value };
  };
  const checklistGroup = (name, label, choices) => {
    const wrap = el('fieldset', 'setup-field setup-register-checklist');
    wrap.append(el('legend', '', label));
    const boxes = [];
    const other = input(`${name}_other`); other.className = 'setup-register-other'; other.placeholder = t('setup_surface.something_else_prompt', 'Tell us'); other.hidden = true;
    for (const [value, text] of choices) {
      const box = input(name, 'checkbox'); box.value = value; boxes.push(box);
      const row = el(value === 'something_else' ? 'div' : 'label', 'setup-register-check');
      if (value === 'something_else') {
        const prompt = el('label', 'setup-register-check-label'); prompt.append(box, el('span', '', text));
        box.addEventListener('change', () => { other.hidden = !box.checked; if (box.checked) other.focus(); });
        row.classList.add('setup-register-check-other'); row.append(prompt, other);
      } else row.append(box, el('span', '', text));
      wrap.append(row);
    }
    return { wrap, other, values: () => boxes.filter((box) => box.checked).map((box) => box.value) };
  };
  const email = input('email', 'email'); email.placeholder = 'you@example.com';
  const identityMode = choiceGroup('identity_mode', t('setup_surface.identity', 'How would you like to register?'), [
    ['email', 'With email'], ['anonymous', 'Anonymous'], ['no_thanks', 'No thank you'],
  ]);
  identityMode.wrap.classList.add('setup-register-identity-choice');
  const kind = choiceGroup('kind', t('setup_surface.kind', 'Which of these are you most likely to use?'), [
    ['build_software', 'Build software'], ['life_assistants', 'Life assistants'],
    ['research_writing', 'Research and writing'], ['other', 'Something else'],
  ]);
  const kindOther = input('kind_other'); kindOther.className = 'setup-register-other'; kindOther.placeholder = t('setup_surface.something_else_prompt', 'Tell us'); kindOther.hidden = true;
  kind.wrap.append(kindOther);
  for (const button of kind.wrap.querySelectorAll('button')) button.addEventListener('click', () => {
    kindOther.hidden = kind.value.value !== 'other'; if (!kindOther.hidden) kindOther.focus();
  });
  const preferredFeature = choiceGroup('preferred_feature', t('setup_surface.preferred_feature', 'Which core Ronin feature do you prefer most?'), [
    ['remote_access', 'Work from anywhere'],
    ['multiple_providers', 'Use multiple providers without lock-in'],
    ['team_coordination', 'Agents with team coordination skills'],
  ]);
  const reasons = checklistGroup('reasons', t('setup_surface.reasons', 'Why is that useful to you?'), [
    ['different_strengths', 'Different models have different strengths. I want to use the best one for each job.'],
    ['network_resilience', 'Sometimes one model provider is having network issues, so I want another available.'],
    ['new_models', 'New models keep arriving. I want to switch without rebuilding my workspace.'],
    ['avoid_lock_in', 'I do not want to get locked into one provider.'],
    ['subscription_limits', 'If one subscription runs out of tokens, I want to shift work to another provider.'],
    ['visible_agents', 'I prefer a visible team of agents I can interact with directly, rather than hidden sub-agents.'],
    ['something_else', 'Something else.'],
  ]);
  const runLocation = choiceGroup('run_location', t('setup_surface.run_location', 'Where will you install Ronin?'), [
    ['virtual_machine', 'Virtual machine'], ['personal_server', 'Personal server'], ['personal_computer', 'Personal computer'],
  ]);
  const own = el('textarea'); own.name = 'own_words'; own.rows = 3;
  const identity = el('div', 'setup-registration-identity');
  const form = el('form', 'setup-form setup-register-form');
  const welcome = el('div', 'setup-register-welcome');
  welcome.append(el('span', 'setup-register-eyebrow', t('setup_surface.say_hello', 'Say hello')), el('h2', '', t('setup_surface.register_welcome', 'Welcome to Ronin')), el('p', 'setup-lede', t('setup_surface.register_lede', 'Share only what feels useful. Your answers help us shape better starting points; local Ronin works whether you register or not.')));
  const about = el('section', 'setup-register-group');
  about.classList.add('setup-register-about');
  const emailField = field(t('setup_surface.email', 'Email address'), email);
  about.append(el('h3', '', t('setup_surface.about_you', 'About you')), identityMode.wrap, emailField);
  const fit = el('section', 'setup-register-group');
  fit.classList.add('setup-register-fit');
  runLocation.wrap.classList.add('setup-register-half');
  preferredFeature.wrap.classList.add('setup-register-half');
  reasons.wrap.classList.add('setup-register-full');
  kind.wrap.classList.add('setup-register-full');
  const ownField = field(t('setup_surface.own_words', 'Anything else'), own);
  ownField.classList.add('setup-register-full');
  fit.append(
    el('h3', '', t('setup_surface.ronin_fit', 'What brings you here')), runLocation.wrap, preferredFeature.wrap, reasons.wrap, kind.wrap,
    ownField,
  );
  const consent = el('p', 'setup-fine setup-register-consent', t('setup_surface.consent_exact', 'Email registration sends a confirmation and can unlock Ronin Services. Anonymous registration sends these answers without contact details. Communication stays off unless you choose otherwise.'));
  const declined = el('p', 'setup-register-declined', t('setup_surface.no_thanks_message', 'We hope you enjoy Ronin. If you’d like to share feedback later, we’d be glad to hear it.'));
  declined.hidden = true;
  const registerAction = action(t('setup_surface.register_action', 'Send'), '', async () => {
    notice.textContent = t('setup_surface.saving', 'Saving…');
    const anonymous = identityMode.value.value !== 'email';
    const result = await request('/api/setup/registration', { method: 'POST', json: {
      identity_mode: anonymous ? 'anonymous' : 'email', email: email.value, purpose: '',
      kind: kind.value.value, kind_other: kindOther.value, user_type: '', goals: [], preferred_feature: preferredFeature.value.value,
      reasons: reasons.values(), reason_other: reasons.other.value, run_location: runLocation.value.value,
      intended_use: [], theme_preference: '', own_words: own.value,
    } });
    notice.textContent = result.ok
      ? anonymous ? t('setup_surface.anonymous_saved', 'Thanks — your anonymous hello was sent to Ronin.') : t('setup_surface.confirm_email', 'Registration saved. Confirm the email to receive Services entitlement.')
      : result.message;
    if (result.ok) { current = result.data; paint(); }
  });
  registerAction.dataset.launch = 'true';
  const sendLabel = registerAction.textContent;
  const sendMark = el('img', 'wk-launch-mark'); sendMark.src = 'brand/nin-mark.svg'; sendMark.alt = '';
  registerAction.replaceChildren(sendMark, el('span', '', sendLabel));
  const paintIdentityMode = () => {
    const emailRegistration = identityMode.value.value === 'email';
    const declinedRegistration = identityMode.value.value === 'no_thanks';
    emailField.hidden = !emailRegistration || declinedRegistration;
    fit.hidden = declinedRegistration;
    consent.hidden = declinedRegistration;
    registerAction.hidden = declinedRegistration;
    notice.hidden = declinedRegistration;
    declined.hidden = !declinedRegistration;
    email.required = emailRegistration && !declinedRegistration;
  };
  for (const button of identityMode.wrap.querySelectorAll('button')) button.addEventListener('click', paintIdentityMode);
  paintIdentityMode();
  form.append(
    welcome, about, fit,
    consent, registerAction, declined, notice,
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
    const anonymous = current?.status === 'anonymous';
    identity.hidden = !current?.submitted_at;
    identity.replaceChildren(el('strong', '', anonymous ? t('setup_surface.registered_anonymous', 'Registered anonymously') : registered ? t('setup_surface.registered', 'Registered') : t('setup_surface.check_email', 'Check your email')),
      el('span', '', [current?.email_masked, current?.purpose, current?.preferred_feature, current?.run_location, ...(current?.reasons || [])].filter(Boolean).join(' · ')));
    form.hidden = Boolean(current?.submitted_at);
    preferences.hidden = !current?.submitted_at || anonymous;
    recoveryOptions.hidden = !current?.submitted_at;
    if (current?.communication) for (const key of Object.keys(checks)) checks[key].checked = current.communication[key] === true;
    for (const [key, box] of Object.entries(followUps)) box.checked = current?.communication?.follow_up?.includes(key) === true;
    recovery.replaceChildren();
    const changeEmail = () => action(t('setup_surface.change_registration_email', 'Change email'), '', async () => {
      const next = window.prompt(t('setup_surface.new_registration_email', 'Send registration confirmation to:'));
      if (!next?.trim()) return;
      const result = await request('/api/setup/registration/recovery', { method: 'POST', json: {
        action: 'change_address', identity_mode: 'email', email: next.trim(), purpose: current.purpose,
        kind: current.kind, kind_other: current.kind_other, user_type: current.user_type, goals: current.goals,
        preferred_feature: current.preferred_feature, reasons: current.reasons, reason_other: current.reason_other, run_location: current.run_location,
        intended_use: current.intended_use,
        theme_preference: current.theme_preference, own_words: current.own_words,
      } });
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
    } else if (current?.submitted_at && !anonymous) recovery.append(changeEmail());
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
 * ONE MODEL PROVIDERS SURFACE. Its first face is an inventory of equal stones, one per
 * provider in the runtime catalog, mounted straight on the surface content so the shared
 * stone seat owns every inset exactly as Presets does. Choosing a stone opens that
 * provider in place beside the rail as four numbered steps (use · install · authenticate
 * with the native sign-in tile, Done / Close and Close · ready). Never a dashboard of
 * every provider at once.
 */
function createProviderSurface(context) {
  const out = surface(t('setup_surface.providers', 'Model providers'));
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
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
    const steps = providerReadiness(provider, optedIn);
    const [use, install, auth, ready] = steps;
    const card = el('article', 'setup-provider');
    card.dataset.provider = provider.id;
    const head = el('header', 'setup-provider-head');
    head.append(el('h2', '', provider.label || provider.id));
    if (provider.from) head.append(el('p', 'setup-provider-from', t('setup_surface.provider_from', 'From {vendor}', { vendor: provider.from })));
    const flow = el('ol', 'setup-provider-steps');
    // One shape for all four steps: a mark that says done, current, or pending; the label
    // with its measured state beside it; at most one short line; then a control of one size.
    const stepRow = (step, state) => {
      const item = el('li', 'setup-provider-step');
      item.dataset.step = step.key; item.dataset.status = step.status;
      item.dataset.done = String(step.done === true); item.dataset.current = String(step.current === true);
      const mark = el('span', 'setup-provider-mark', step.done ? '✓' : String(steps.indexOf(step) + 1));
      mark.setAttribute('aria-hidden', 'true');
      const copy = el('div', 'setup-provider-copy');
      const title = el('div', 'setup-provider-title');
      const label = el(step.key === 'use' ? 'label' : 'strong', 'setup-provider-label', step.label);
      title.append(label, el('span', 'setup-provider-state', state));
      copy.append(title);
      if (step.detail) copy.append(el('p', 'setup-provider-note', step.detail));
      if (step.command) copy.append(el('code', 'setup-provider-command', step.command));
      const controls = el('div', 'setup-provider-control');
      item.append(mark, copy, controls);
      flow.append(item);
      return { item, controls, label };
    };
    const useRow = stepRow(use, use.status === 'on' ? t('setup_surface.on', 'On') : t('setup_surface.off', 'Off'));
    const checkbox = el('input', 'setup-provider-optin'); checkbox.type = 'checkbox'; checkbox.checked = use.status === 'on';
    checkbox.id = `setup-provider-optin-${provider.id}`; useRow.label.htmlFor = checkbox.id;
    checkbox.addEventListener('change', async () => {
      const previous = optedIn;
      const selected = new Set(Array.isArray(runtime.preferences?.providers) ? runtime.preferences.providers : []);
      if (checkbox.checked) selected.add(provider.id); else selected.delete(provider.id);
      const result = await request('/api/setup/preferences', { method: 'PATCH', json: { providers: [...selected] } });
      if (!result.ok) { checkbox.checked = previous; return; }
      runtime.preferences = result.data;
      stones.refreshDetail();
    });
    useRow.controls.append(checkbox);
    const installRow = stepRow(install, install.status === 'installed'
      ? t('setup_surface.installed', 'Installed')
      : install.action === 'manual' ? t('setup_surface.manual_install', 'Manual install') : t('setup_surface.not_installed', 'Not installed'));
    if (install.action === 'manual' && install.manual) {
      const link = el('a', 'wk-action setup-provider-action setup-provider-manual', install.manual.label);
      link.href = install.manual.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      installRow.controls.append(link);
    } else {
      const installAction = action(t('setup_surface.install', 'Install'), 'primary', async () => {
        const installed = await request('/api/install', { method: 'POST', json: { items: [{ kind: 'agent', name: provider.id }] } });
        if (installed.ok) await paint();
      });
      installAction.classList.add('setup-provider-action');
      installAction.disabled = install.action !== 'install' || !optedIn || !provider.installable;
      installRow.controls.append(installAction);
    }
    const authRow = stepRow(auth, auth.status === 'recorded'
      ? t('setup_surface.auth_recorded', 'Recorded')
      : auth.status === 'open' ? t('setup_surface.sign_in_open', 'Sign-in open')
        : auth.status === 'available' ? t('setup_surface.auth_available', 'Ready to sign in') : t('setup_surface.install_first', 'After install'));
    if (auth.action !== 'login_open') {
      const authenticate = action(t('setup_surface.authenticate', 'Authenticate'), 'primary', async () => {
        await request(`/api/setup/providers/${encodeURIComponent(provider.id)}/login`, { method: 'POST', json: {} }); await paint();
      });
      authenticate.classList.add('setup-provider-action');
      authenticate.disabled = auth.status !== 'available' || !optedIn;
      authRow.controls.append(authenticate);
    } else {
      const terminal = el('div', 'setup-provider-terminal');
      const done = action(t('setup_surface.done_close', 'Done / Close'), 'primary', async () => { mounted?.park?.(); await request(`/api/setup/providers/${encodeURIComponent(provider.id)}/done`, { method: 'POST', json: {} }); await paint(); });
      const close = action(t('setup_surface.close', 'Close'), '', async () => { mounted?.park?.(); await request(`/api/setup/providers/${encodeURIComponent(provider.id)}/close`, { method: 'POST', json: {} }); await paint(); });
      done.classList.add('setup-provider-action'); close.classList.add('setup-provider-action');
      authRow.controls.append(done, close);
      authRow.item.append(terminal);
      mounted = mountProviderAttachment(context.environment, terminal, provider, context.workspace, () => void paint());
      if (!mounted) terminal.append(el('p', 'setup-notice bad', t('setup_surface.login_attachment_missing', 'The native setup session is open but its terminal attachment is unavailable.')));
    }
    stepRow(ready, ready.status === 'ready' ? t('setup_surface.ready_launch', 'Activated for Launch') : t('setup_surface.not_ready', 'Not yet'));
    card.append(head, flow);
    host.append(card);
    return () => disposeMount();
  };
  const stones = createStoneWorkSurface({
    selectedId: opened,
    className: 'setup-provider-stones',
    renderDetail: (item, host) => paintProvider(item.id, host),
    onSelectionChange: (id) => { opened = String(id || ''); },
  });
  stones.mount(out.content, { after: [notice] });
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const paint = async () => {
    const result = await request('/api/setup/runtime', { cache: 'no-store' });
    disposeMount();
    if (!result.ok) { stones.setItems([]); say(result.message, true); return; }
    runtime = result.data;
    context.environment.setupRuntime = runtime;
    context.workbench?.refreshSelector?.();
    const providers = (Array.isArray(runtime.providers) ? runtime.providers : []).filter((provider) => provider?.id);
    say(providers.length ? '' : t('setup_surface.no_catalog', 'No model providers are in the catalog on this machine.'));
    stones.setItems(providers.map((provider) => ({
      id: String(provider.id), label: provider.label || provider.id, state: providerPresentation(provider).inventoryState,
      className: 'setup-provider-stone', attrs: { 'data-provider': provider.id, 'data-activated': String(provider.activated === true) },
    })));
    summarize(runtime);
  };
  return { el: out.el, show: paint, destroy: () => { disposeMount(); stones.destroy(); } };
}

function createRootsSurface(context) {
  const out = surface(t('setup_surface.roots', 'Workspace folders'));
  // Mounted on the surface content itself, as Presets is, so the shared stone work surface
  // owns the insets: a nested host would zero the content padding and get none of its own.
  const room = buildProjectRoots(out.content, () => out.content.isConnected, () => context.tenant?.campaign || '', { presentation: 'stones' });
  return { el: out.el, show: () => { room.enter(); notifySummary(SETUP_SURFACE_TYPES.roots, '2 folders + yours', context.workbench); } };
}

/** Ronin Services: identity, the beta, its value, one measured status, and the three steps. */
function createServicesSurface(context) {
  const out = surface(t('settei.ronin_services', 'Ronin Services'));
  const body = el('div', 'setup-surface-body setup-services-compact'); out.content.append(body);
  let timer = null;
  const explain = () => {
    const intro = el('section', 'setup-services-intro');
    const lockup = el('div', 'setup-services-lockup');
    const mark = el('img', 'setup-services-mark');
    mark.src = 'brand/services-mark.svg'; mark.alt = '';
    const identity = el('div', 'setup-services-identity');
    identity.append(
      el('h2', '', t('settei.ronin_services', 'Ronin Services')),
      el('p', 'setup-lede', t('services_setup.intro', 'Ronin’s hosted parts: the recording, the template library, a background assistant, voice, and team memory.')),
    );
    lockup.append(mark, identity);
    const beta = el('section', 'setup-services-beta');
    beta.append(
      el('h3', '', t('services_setup.beta', 'In beta')),
      el('p', '', t('services_setup.beta_copy', 'Ronin Services is the community half of Ronin, in beta. The code is open code, not open source: free to read, not to commercialise. Registering only tells us who is using it with us. It is optional, and nothing here is for sale.')),
    );
    const values = el('div', 'setup-services-benefits');
    for (const [heading, copy] of [
      [t('services_setup.transcripts', 'Readable transcripts'), t('services_setup.transcripts_copy', 'The terminal is recorded and shown as readable text, so Unlocked views scroll smoothly on a phone instead of waiting on a laggy Locked screen.')],
      [t('services_setup.library', 'Template library'), t('services_setup.library_copy', 'Teams and Agents Ronin keeps and grows, with the procedures, macros, and tools they read, installed with one press.')],
      [t('services_setup.records', 'Work records kept current'), t('services_setup.records_copy', 'A background assistant keeps every Agent’s work record current, so the roster and the tile say what each is doing.')],
      [t('services_setup.voice', 'Voice and memory'), t('services_setup.voice_copy', 'Hear a report read back, speak to an Agent from the tile, and keep what a session learns for the team.')],
    ]) {
      const item = el('div', 'setup-services-benefit');
      item.append(el('h3', '', heading), el('p', '', copy)); values.append(item);
    }
    intro.append(lockup, beta, values);
    return intro;
  };
  const openRegister = () => context.workbench?.place(SETUP_SURFACE_TYPES.register, context.workspace || 'workspace2');
  /** The Routine switch for new Agents: the Campaign's own map, saved the way Routines and Installs saves it. */
  const switchServices = async (on) => {
    const [catalog] = await Promise.all([request('/api/routines'), loadCampaigns()]);
    const row = campaignById(context.tenant?.campaign) || campaigns()[0];
    if (!row) return { ok: false, message: t('services_setup.no_campaign', 'No Campaign to switch it on for.') };
    const defaults = row.config?.agent_defaults && typeof row.config.agent_defaults === 'object' ? row.config.agent_defaults : {};
    const routines = { ...completeRoutineMap(catalog.ok && Array.isArray(catalog.data) ? catalog.data : [], defaults.routines), ronin_services: on };
    return saveCampaign(row.id, { config: { agent_defaults: { ...defaults, routines } } });
  };
  const show = async () => {
    clearTimeout(timer);
    const [registration, installed, activation] = await Promise.all([
      request('/api/setup/registration', { cache: 'no-store' }),
      request('/api/installed', { cache: 'no-store' }),
      request('/api/services/activation', { cache: 'no-store' }),
    ]);
    const model = servicesSetupModel(registration, installed, activation);
    body.replaceChildren(explain());
    body.dataset.state = model.state;
    const state = el('section', 'setup-services-status');
    state.dataset.tone = model.tone;
    state.setAttribute('aria-live', 'polite');
    state.append(el('p', 'setup-services-status-line', model.status), el('p', 'setup-services-next', model.next));
    body.append(state);
    // Register · Install · On — three controls in one shape; each reads Done once it is.
    const steps = el('div', 'setup-services-steps');
    const notice = el('p', 'setup-notice setup-services-notice');
    for (const item of model.steps) {
      const wrap = el('div', 'setup-services-step');
      const button = action(item.label, '', async () => {
        if (item.act === 'register') { openRegister(); return; }
        button.disabled = true; notice.textContent = '';
        const result = item.act === 'switch_on' || item.act === 'switch_off' ? await switchServices(item.act === 'switch_on')
          : await request(item.act === 'install' ? '/api/services/install' : '/api/services/activation/poll', { method: 'POST', json: {} });
        if (!result.ok) { notice.textContent = result.message; notice.classList.add('bad'); button.disabled = false; return; }
        await show();
      });
      button.classList.add('setup-services-step-action');
      button.dataset.step = item.id; button.dataset.done = String(item.done);
      button.disabled = !item.enabled || !item.act;
      if (item.title) button.title = item.title;
      if (item.id === 'switch') button.setAttribute('aria-pressed', String(item.done));
      wrap.append(el('span', 'setup-services-step-caption', item.caption), button);
      steps.append(wrap);
    }
    body.append(steps, notice);
    body.append(el('p', 'setup-fine setup-services-gate', t('services_setup.gate', 'The Grokbot Morning Briefing preset waits for Ronin Services to be active.')));
    notifySummary(SETUP_SURFACE_TYPES.services, model.summary, context.workbench);
    // A confirmation or an install in flight: look again quietly while the surface is on screen.
    if (model.polling) timer = setTimeout(() => { if (body.isConnected) void show(); }, model.state === 'installing' ? 5000 : 15000);
  };
  return { el: out.el, show, destroy: () => clearTimeout(timer) };
}

/** gbrain: the Setup presentation of the commons tab. Reads and presses are the tab's own. */
function createGbrainSurface(context) {
  const out = surface(t('pane.gbrain', 'gbrain'));
  const host = el('div', 'setup-surface-body'); out.content.append(host);
  const room = buildGbrain(host, () => host.isConnected, (prompt) => context.environment?.showNewSession?.(prompt), {
    presentation: 'setup',
    availability: () => { const runtime = context.environment?.setupRuntime; return runtime?.gbrain ? { ...runtime.gbrain, services: runtime.services || null } : null; },
    // The selector card follows the measured state once it is read.
    onState: (summary) => notifySummary(SETUP_SURFACE_TYPES.gbrain, summary, context.workbench),
    openServices: () => context.workbench?.place(SETUP_SURFACE_TYPES.services, context.workspace || 'workspace2'),
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
