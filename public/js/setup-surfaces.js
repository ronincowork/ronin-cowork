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
import { createEmbeddedNewTeamFormView } from './new-team-form.js';
import { createEmbeddedNewAgentView } from './new-agent.js';
import { HOUSE_PRESETS, buildLaunchPlan, initialControls, seatingPlan } from './presets.js';
import { launchPresetPlan, presetLaunchUrl } from './preset-launch.js';
import { closeWorkspaceTab, reserveWorkspaceTab } from './workspace.js';

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
  const notice = el('p', 'setup-notice setup-register-notice');
  notice.setAttribute('aria-live', 'polite');
  let current = null;
  const labels = new Map();
  const field = (label, control) => { const wrap = el('label', 'setup-field setup-register-input'); wrap.append(el('span', 'setup-register-question', label), control); return wrap; };
  const input = (name, type = 'text') => { const node = el('input'); node.name = name; node.type = type; return node; };
  const checkRow = (label, box, className = '') => { const row = el('label', `setup-register-check ${className}`.trim()); row.append(box, el('span', '', label)); return row; };
  const choiceGroup = (name, label, choices, { multiple = false, explain = false } = {}) => {
    const value = input(name, 'hidden');
    const selected = new Set();
    /** One quiet explanation for the chosen answer, shown only once something is chosen. */
    const explanation = explain ? el('p', 'setup-register-explain') : null;
    if (explanation) { explanation.hidden = true; explanation.setAttribute('aria-live', 'polite'); }
    const group = el('div', 'setup-register-choice-grid');
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', label); group.dataset.choices = String(choices.length);
    for (const [key, text, description = ''] of choices) {
      labels.set(key, text);
      const button = el('button', 'setup-register-choice');
      button.type = 'button'; button.dataset.value = key; button.setAttribute('aria-pressed', 'false');
      button.append(el('strong', '', text));
      if (description && !explanation) button.append(el('span', '', description));
      button.addEventListener('click', () => {
        if (multiple) {
          if (selected.has(key)) selected.delete(key); else selected.add(key);
          button.setAttribute('aria-pressed', String(selected.has(key)));
          value.value = JSON.stringify([...selected]);
        } else {
          /* A second click on the chosen answer clears it; nothing here is mandatory. */
          const chosen = value.value === key ? '' : key;
          value.value = chosen;
          for (const option of group.querySelectorAll('button')) option.setAttribute('aria-pressed', String(Boolean(chosen) && option === button));
          if (explanation) { explanation.textContent = chosen ? description : ''; explanation.hidden = !chosen || !description; if (chosen) button.after(explanation); }
        }
      });
      group.append(button);
    }
    const wrap = el('div', 'setup-field setup-register-bounded');
    wrap.append(el('span', 'setup-register-question', label), group, value);
    if (explanation) wrap.append(explanation);
    return { value, wrap, values: () => multiple ? [...selected] : value.value };
  };
  const checklistGroup = (name, label, choices) => {
    const wrap = el('fieldset', 'setup-register-checklist');
    wrap.append(el('legend', 'setup-register-question', label));
    const boxes = [];
    const other = input(`${name}_other`); other.className = 'setup-register-other'; other.placeholder = t('setup_surface.something_else_prompt', 'Tell us'); other.hidden = true;
    for (const [value, text] of choices) {
      labels.set(value, text);
      const box = input(name, 'checkbox'); box.value = value; boxes.push(box);
      if (value === 'something_else') {
        const row = el('div', 'setup-register-check-other');
        box.addEventListener('change', () => { other.hidden = !box.checked; if (box.checked) other.focus(); });
        row.append(checkRow(text, box), other);
        wrap.append(row);
      } else wrap.append(checkRow(text, box));
    }
    return { wrap, other, values: () => boxes.filter((box) => box.checked).map((box) => box.value) };
  };
  const email = input('email', 'email'); email.placeholder = 'you@example.com'; email.autocomplete = 'email';
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
    ['remote_access', 'Work from anywhere', t('setup_surface.feature_remote_access', 'Ronin runs on your home machine or a virtual machine. You open it from a browser wherever you are, any time.')],
    ['multiple_providers', 'Multiple providers without lock-in', t('setup_surface.feature_multiple_providers', 'You keep your own accounts and your direct relationship with each model provider. Ronin never stands in between, everything runs on your machine, and how your agents work together is yours.')],
    ['team_coordination', 'Agents with team coordination skills', t('setup_surface.feature_team_coordination', 'Coordination is light reading an agent does to build its brief. Each launch brief carries a few simple tools so agents can message and coordinate with one another.')],
  ], { explain: true });
  preferredFeature.wrap.querySelector('.setup-register-choice-grid').dataset.layout = 'rows';
  const reasons = checklistGroup('reasons', t('setup_surface.reasons', 'Which of these describes you best in terms of getting value from Ronin?'), [
    ['different_strengths', 'Different models have different strengths. I want to use the best one for each job.'],
    ['network_resilience', 'Sometimes one model provider is having network issues, so I want another available.'],
    ['new_models', 'New models keep arriving. I want to switch without rebuilding my workspace.'],
    ['avoid_lock_in', 'I do not want to get locked into one provider.'],
    ['subscription_limits', 'If one subscription runs out of tokens, I want to shift work to another provider.'],
    ['visible_agents', 'I prefer a visible team of agents I can interact with directly, rather than hidden sub-agents.'],
    ['own_instructions', 'I want my own standing instructions handed to my agents every time: a README or SOP that some agents, every agent, or a whole team reads by default.'],
    ['no_collisions', 'When several agents work in one codebase, I want a structured way to keep them from colliding.'],
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
  /* About you: how to register, the address if so, and where Ronin will live — stacked. */
  about.append(el('h3', '', t('setup_surface.about_you', 'About you')), identityMode.wrap, emailField, runLocation.wrap);
  const fit = el('section', 'setup-register-group');
  fit.classList.add('setup-register-fit');
  preferredFeature.wrap.classList.add('setup-register-full', 'setup-register-feature');
  reasons.wrap.classList.add('setup-register-full');
  kind.wrap.classList.add('setup-register-full');
  const ownField = field(t('setup_surface.own_words', 'Anything else'), own);
  ownField.classList.add('setup-register-full');
  fit.append(
    el('h3', '', t('setup_surface.ronin_fit', 'What brings you here')), preferredFeature.wrap, reasons.wrap, kind.wrap,
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
  const send = el('div', 'setup-register-send');
  send.append(consent, registerAction, notice);
  const paintIdentityMode = () => {
    const emailRegistration = identityMode.value.value === 'email';
    const declinedRegistration = identityMode.value.value === 'no_thanks';
    emailField.hidden = !emailRegistration || declinedRegistration;
    fit.hidden = declinedRegistration;
    consent.hidden = declinedRegistration;
    registerAction.hidden = declinedRegistration;
    notice.hidden = declinedRegistration;
    send.hidden = declinedRegistration;
    declined.hidden = !declinedRegistration;
    email.required = emailRegistration && !declinedRegistration;
  };
  for (const button of identityMode.wrap.querySelectorAll('button')) button.addEventListener('click', paintIdentityMode);
  paintIdentityMode();
  form.append(welcome, about, fit, send, declined);
  const prefs = el('form', 'setup-form setup-preferences');
  const checks = Object.fromEntries(['newsletter', 'release_updates', 'no_communication'].map((name) => [name, input(name, 'checkbox')]));
  const followUps = Object.fromEntries(['product_research', 'interviews', 'support'].map((name) => [name, input(name, 'checkbox')]));
  const prefNotice = el('p', 'setup-notice setup-register-notice');
  prefNotice.setAttribute('aria-live', 'polite');
  const recovery = el('div', 'setup-registration-recovery');
  const preferences = el('section', 'setup-register-group setup-preferences-wrap');
  preferences.append(el('h3', '', t('setup_surface.communication_preferences', 'Communication choices')), prefs);
  const recoveryOptions = el('section', 'setup-register-group setup-register-options');
  recoveryOptions.append(el('h3', '', t('setup_surface.registration_options', 'Registration options')), recovery);
  prefs.append(
    checkRow(t('setup_surface.newsletter', 'Newsletter'), checks.newsletter),
    checkRow(t('setup_surface.release_updates', 'Code and release updates'), checks.release_updates),
    el('span', 'setup-register-subhead', t('setup_surface.follow_up', 'Allowed follow-up')),
    checkRow(t('setup_surface.follow_product', 'Product research'), followUps.product_research),
    checkRow(t('setup_surface.follow_interviews', 'Interviews'), followUps.interviews),
    checkRow(t('setup_surface.follow_support', 'Support'), followUps.support),
    checkRow(t('setup_surface.no_communication', 'No communication'), checks.no_communication, 'setup-register-check-apart'),
    action(t('setup_surface.update_preferences', 'Update preferences'), '', async () => {
      const result = await request('/api/setup/registration/communication', { method: 'PATCH', json: { newsletter: checks.newsletter.checked, release_updates: checks.release_updates.checked, no_communication: checks.no_communication.checked, follow_up: Object.entries(followUps).filter(([, box]) => box.checked).map(([name]) => name) } });
      prefNotice.textContent = result.ok ? t('setup_surface.preferences_saved', 'Preferences updated.') : result.message;
      if (result.ok) { current = result.data; paint(); }
    }), prefNotice,
  );
  checks.no_communication.addEventListener('change', () => { if (checks.no_communication.checked) { checks.newsletter.checked = false; checks.release_updates.checked = false; for (const box of Object.values(followUps)) box.checked = false; } });
  /** The submitted summary speaks the same words the form showed, never a stored key. */
  const wordFor = (key) => labels.get(key) || '';
  const summaryWords = () => {
    const words = [current?.email_masked, current?.run_location && wordFor(current.run_location), current?.preferred_feature && wordFor(current.preferred_feature)];
    words.push(current?.kind === 'other' && current?.kind_other ? current.kind_other : current?.kind && wordFor(current.kind));
    for (const reason of current?.reasons || []) words.push(reason === 'something_else' && current?.reason_other ? current.reason_other : wordFor(reason));
    return words.filter(Boolean).join(' · ');
  };
  const paint = () => {
    const registered = current?.status === 'registered';
    const anonymous = current?.status === 'anonymous';
    identity.hidden = !current?.submitted_at;
    identity.dataset.tone = current?.status === 'pending' ? 'pending' : 'ok';
    identity.replaceChildren(el('strong', '', anonymous ? t('setup_surface.registered_anonymous', 'Registered anonymously') : registered ? t('setup_surface.registered', 'Registered') : t('setup_surface.check_email', 'Check your email')),
      el('span', '', summaryWords()));
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
  body.append(identity, form, preferences, recoveryOptions, notice); out.content.append(body);
  return { el: out.el, show: async () => { const result = await request('/api/setup/registration', { cache: 'no-store' }); current = result.ok ? result.data : null; paint(); } };
}

/**
 * ONE MODEL PROVIDERS SURFACE. Its first face is an inventory of equal stones, one per
 * provider in the runtime catalog, mounted straight on the surface content so the shared
 * stone seat owns every inset exactly as Presets does. Choosing a stone opens that
 * provider in place beside the rail as three numbered steps (install · authenticate with
 * the native sign-in tile, Done and Close · ready). Never a dashboard of every provider
 * at once.
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
    const steps = providerReadiness(provider);
    const [install, auth, ready] = steps;
    const card = el('article', 'setup-provider');
    card.dataset.provider = provider.id;
    const head = el('header', 'setup-provider-head');
    head.append(el('h2', '', provider.label || provider.id));
    if (provider.from) head.append(el('p', 'setup-provider-from', t('setup_surface.provider_from', 'From {vendor}', { vendor: provider.from })));
    const flow = el('ol', 'setup-provider-steps');
    // What the last press answered when it failed; the only way a server refusal is seen.
    const problem = el('p', 'setup-notice bad setup-provider-problem'); problem.hidden = true;
    const press = async (path, after = paint) => {
      const result = await request(path, { method: 'POST', json: {} });
      if (!result.ok) { problem.textContent = result.message; problem.hidden = false; return; }
      await after();
    };
    // One shape for all three steps: a mark that says done, current, or pending; the label
    // with its measured state beside it; at most one short line; then a control of one size.
    // Only the current step's control is the kaki primary.
    const stepRow = (step, state) => {
      const item = el('li', 'setup-provider-step');
      item.dataset.step = step.key; item.dataset.status = step.status;
      item.dataset.done = String(step.done === true); item.dataset.current = String(step.current === true);
      const mark = el('span', 'setup-provider-mark', step.done ? '✓' : String(steps.indexOf(step) + 1));
      mark.setAttribute('aria-hidden', 'true');
      const copy = el('div', 'setup-provider-copy');
      const title = el('div', 'setup-provider-title');
      title.append(el('strong', 'setup-provider-label', step.label), el('span', 'setup-provider-state', state));
      copy.append(title);
      if (step.detail) copy.append(el('p', 'setup-provider-note', step.detail));
      if (step.command) copy.append(el('code', 'setup-provider-command', step.command));
      const controls = el('div', 'setup-provider-control');
      item.append(mark, copy, controls);
      flow.append(item);
      return { item, controls };
    };
    const control = (step, label, onClick) => {
      const made = action(label, step.current ? 'primary' : '', onClick);
      made.classList.add('setup-provider-action');
      return made;
    };
    // Only the current step owns a control. A done step is a quiet fact and a waiting
    // step says what it waits for; neither carries a dead button.
    const installRow = stepRow(install, install.status === 'installed'
      ? t('setup_surface.installed', 'Installed')
      : install.action === 'manual' ? t('setup_surface.manual_install', 'Manual install') : t('setup_surface.not_installed', 'Not installed'));
    if (install.current && install.action === 'manual' && install.manual) {
      const link = el('a', 'wk-action setup-provider-action setup-provider-manual', install.manual.label);
      link.href = install.manual.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      installRow.controls.append(link);
    } else if (install.current && install.action === 'install' && provider.installable) {
      installRow.controls.append(control(install, t('setup_surface.install', 'Install'), async () => {
        const result = await request('/api/install', { method: 'POST', json: { items: [{ kind: 'agent', name: provider.id }] } });
        if (!result.ok) { problem.textContent = result.message; problem.hidden = false; return; }
        await paint();
      }));
    }
    const authRow = stepRow(auth, auth.status === 'recorded'
      ? t('setup_surface.signed_in', 'Signed in')
      : auth.status === 'open' ? t('setup_surface.sign_in_open', 'Sign-in open')
        : auth.status === 'available' ? t('setup_surface.not_signed_in', 'Not signed in') : t('setup_surface.install_first', 'After install'));
    if (auth.current && auth.action !== 'login_open') {
      authRow.controls.append(control(auth, t('setup_surface.authenticate', 'Authenticate'), () => press(`/api/setup/providers/${encodeURIComponent(provider.id)}/login`)));
    } else if (auth.action === 'login_open') {
      const terminal = el('div', 'setup-provider-terminal');
      const done = control(auth, t('setup_surface.done', 'Done'), () => { mounted?.park?.(); return press(`/api/setup/providers/${encodeURIComponent(provider.id)}/done`); });
      const close = action(t('setup_surface.close', 'Close'), '', () => { mounted?.park?.(); return press(`/api/setup/providers/${encodeURIComponent(provider.id)}/close`); });
      close.classList.add('setup-provider-action');
      authRow.controls.append(done, close);
      authRow.item.append(terminal);
      mounted = mountProviderAttachment(context.environment, terminal, provider, context.workspace, () => void paint());
      if (!mounted) terminal.append(el('p', 'setup-notice bad', t('setup_surface.login_attachment_missing', 'The native setup session is open but its terminal attachment is unavailable.')));
    }
    stepRow(ready, ready.status === 'ready' ? t('setup_surface.ready_launch', 'Activated for Launch') : t('setup_surface.not_ready', 'Not yet'));
    card.append(head, flow, problem);
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

/** The one Services mark file, read once and inlined so the R's stroke follows the app's data-theme, not only the OS scheme.
 *  The <img> stays as the first paint and the fallback; the file remains the single master (public/brand/README.md). */
let servicesMarkMarkup = null;
async function inlineServicesMark(host) {
  if (servicesMarkMarkup === null) servicesMarkMarkup = fetch('brand/services-mark.svg').then((r) => (r.ok ? r.text() : '')).catch(() => '');
  const markup = await servicesMarkMarkup;
  if (!markup || !host.isConnected) return;
  host.innerHTML = markup;
  host.querySelector('svg')?.setAttribute('aria-hidden', 'true');
}

/** Ronin Services: identity, the beta, its value, one measured status, and the three steps. */
function createServicesSurface(context) {
  const out = surface(t('settei.ronin_services', 'Ronin Services'));
  const body = el('div', 'setup-surface-body setup-services-compact'); out.content.append(body);
  let timer = null;
  let said = '';  // the last press's answer, kept across the surface's own re-reads until the next press
  const explain = () => {
    const intro = el('section', 'setup-services-intro');
    const lockup = el('div', 'setup-services-lockup');
    const markHost = el('span', 'setup-services-mark');
    const mark = el('img');
    mark.src = 'brand/services-mark.svg'; mark.alt = '';
    markHost.append(mark);
    void inlineServicesMark(markHost);
    const identity = el('div', 'setup-services-identity');
    identity.append(
      el('h2', '', t('settei.ronin_services', 'Ronin Services')),
      el('p', 'setup-lede', t('services_setup.intro', 'Ronin’s hosted parts: the recording, the template library, a background assistant, voice, and team memory.')),
    );
    lockup.append(markHost, identity);
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
  /** Restart: ask, then read the restart off the machine — /api/installed's startedAt changes when Ronin is back.
   *  A refusal answers in the tool's own words; no answer means Ronin went down, which is the restart happening. */
  const restartRonin = async (state, startedAt) => {
    state.dataset.tone = 'warn';
    state.replaceChildren(el('p', 'setup-services-status-line', t('services_setup.restarting', 'Restarting Ronin…')), el('p', 'setup-services-next', t('services_setup.next_restarting', 'Sessions stay up; this surface re-reads the machine as Ronin comes back.')));
    const asked = await request('/api/machine/restart', { method: 'POST', json: {} });
    if (!asked.ok && asked.kind !== 'network') { said = asked.message; await show(); return; }
    const until = Date.now() + 120_000;
    while (Date.now() < until && body.isConnected) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const probe = await request('/api/installed', { cache: 'no-store' });
      if (probe.ok && probe.data?.cowork?.startedAt && probe.data.cowork.startedAt !== startedAt) break;
    }
    if (body.isConnected) await show();
  };
  const show = async () => {
    clearTimeout(timer);
    const [registration, installed, activation] = await Promise.all([
      request('/api/setup/registration', { cache: 'no-store' }),
      request('/api/installed', { cache: 'no-store' }),
      request('/api/services/activation', { cache: 'no-store' }),
    ]);
    // Ronin is down or unreachable for a moment (a restart in flight): keep what is painted and look again shortly.
    if (!installed.ok && installed.kind === 'network' && body.dataset.state) { timer = setTimeout(() => { if (body.isConnected) void show(); }, 3000); return; }
    const model = servicesSetupModel(registration, installed, activation);
    const startedAt = installed.ok ? installed.data?.cowork?.startedAt || '' : '';
    body.replaceChildren(explain());
    body.dataset.state = model.state;
    const state = el('section', 'setup-services-status');
    state.dataset.tone = model.tone;
    state.setAttribute('aria-live', 'polite');
    state.append(el('p', 'setup-services-status-line', model.status), el('p', 'setup-services-next', model.next));
    body.append(state);
    // Register · Install · Switch — three controls in one shape; the first two read Done once they are, the switch toggles.
    const steps = el('div', 'setup-services-steps');
    const notice = el('p', 'setup-notice setup-services-notice', said);
    if (said) notice.classList.add('bad');
    for (const item of model.steps) {
      const wrap = el('div', 'setup-services-step');
      const button = action(item.label, '', async () => {
        if (item.act === 'register') { openRegister(); return; }
        button.disabled = true; said = ''; notice.textContent = '';
        if (item.act === 'restart') { await restartRonin(state, startedAt); return; }
        const result = item.act === 'switch_on' || item.act === 'switch_off' ? await switchServices(item.act === 'switch_on')
          : await request(item.act === 'install' ? '/api/services/install' : '/api/services/activation/poll', { method: 'POST', json: {} });
        if (!result.ok) said = result.message;
        await show();
      });
      button.classList.add('setup-services-step-action');
      button.dataset.step = item.id; button.dataset.done = String(item.done);
      button.disabled = !item.enabled || !item.act;
      if (item.title) button.title = item.title;
      if (item.id === 'switch') button.setAttribute('aria-pressed', String(item.pressed === true));
      wrap.append(el('span', 'setup-services-step-caption', item.caption), button);
      steps.append(wrap);
    }
    steps.dataset.count = String(model.steps.length);
    body.append(steps, notice);
    body.append(el('p', 'setup-fine setup-services-gate', t('services_setup.gate', 'The Grokbot Morning Briefing preset waits for Ronin Services to be active.')));
    notifySummary(SETUP_SURFACE_TYPES.services, model.summary, context.workbench);
    // A confirmation or an install in flight: look again quietly while the surface is on screen.
    if (model.polling) timer = setTimeout(() => { if (body.isConnected) void show(); }, model.state === 'installing' || model.steps.some((item) => item.id === 'restart') ? 5000 : 15000);
  };
  return { el: out.el, show, destroy: () => clearTimeout(timer) };
}

/** gbrain: the Setup presentation of the commons tab. Reads and presses are the tab's own. */
function createGbrainSurface(context) {
  const out = surface(t('pane.gbrain', 'gbrain'));
  const host = el('div', 'setup-surface-body'); out.content.append(host);
  const room = buildGbrain(host, () => host.isConnected, (prompt) => context.environment?.showNewSession?.(prompt), {
    presentation: 'setup',
    availability: () => {
      const runtime = context.environment?.setupRuntime;
      return runtime?.gbrain ? { ...runtime.gbrain, services: runtime.services || null, activated_count: Number(runtime.activated_count || 0) } : null;
    },
    // The selector card follows the measured state once it is read.
    onState: (summary) => notifySummary(SETUP_SURFACE_TYPES.gbrain, summary, context.workbench),
    openServices: () => context.workbench?.place(SETUP_SURFACE_TYPES.services, context.workspace || 'workspace2'),
    openProviders: () => context.workbench?.place(SETUP_SURFACE_TYPES.providers, context.workspace || 'workspace2'),
    // Available to Agents: the Campaign's own gbrain Routine, saved the way Routines and Installs saves it.
    agentsDefault: {
      read: async () => {
        await loadCampaigns();
        const row = campaignById(context.tenant?.campaign) || campaigns()[0];
        const routines = row?.config?.agent_defaults?.routines;
        return routines && typeof routines === 'object' ? routines.gbrain === true : null;
      },
      write: async (on) => {
        const [catalog] = await Promise.all([request('/api/routines'), loadCampaigns()]);
        const row = campaignById(context.tenant?.campaign) || campaigns()[0];
        if (!row) return { ok: false, message: t('gbrain.setup_no_campaign', 'No Campaign to set a default for.') };
        const defaults = row.config?.agent_defaults && typeof row.config.agent_defaults === 'object' ? row.config.agent_defaults : {};
        const routines = { ...completeRoutineMap(catalog.ok && Array.isArray(catalog.data) ? catalog.data : [], defaults.routines), gbrain: on === true };
        return saveCampaign(row.id, { config: { agent_defaults: { ...defaults, routines } } });
      },
    },
    // Exactly the Personal Assistant preset's launch, single assistant, opened in a new tab.
    startAssistant: async () => {
      const slot = HOUSE_PRESETS.find((row) => row.handle === 'personal_assistant');
      const provider = (context.environment?.setupRuntime?.providers || []).find((row) => row.activated)?.id || '';
      const controls = initialControls('personal_assistant', provider);
      const tab = reserveWorkspaceTab();
      const result = await launchPresetPlan(buildLaunchPlan(slot, '', controls));
      if (!result?.ok) { closeWorkspaceTab(tab); return result; }
      const url = presetLaunchUrl(result.data || {}, seatingPlan('personal_assistant', result.data || {}, controls), tab) || result.data?.url;
      if (tab && url) tab.location.href = url; else if (url) window.open(url, '_blank', 'noopener');
      return { ok: true };
    },
  });
  return { el: out.el, show: () => {
    const status = context.environment?.setupRuntime?.gbrain;
    notifySummary(SETUP_SURFACE_TYPES.gbrain, status?.active ? 'active' : status?.installed ? 'installed' : 'not installed', context.workbench);
    room.enter?.();
  } };
}

function createLaunchOwnSurface(context) {
  const out = surface(t('setup_surface.launch_own', 'Launch your own'));
  const renderDetail = (item, host) => {
    const views = [item.id === 'template'
      ? createTemplatesSurface()
      : item.id === 'team' ? createEmbeddedNewTeamFormView(WorkspaceKit, {}) : createEmbeddedNewAgentView(WorkspaceKit, {})];
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
  // Mount on the surface content itself, like Presets and Providers, so the shared SWS
  // host owns the seat container and its narrow/normal/super-wide insets.
  stones.mount(out.content);
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
