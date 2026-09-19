/* Selector-driven workspace-2 surfaces for the Ronin Setup workbench. */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { buildGbrain } from './gbrain.js';
import { createWorkspaceFoldersSurface } from './workspace-folders-surface.js';
import { ask } from './ask.js';
import { PROVIDER_SURFACE_TYPE, providerSurfaceDefinition } from './provider-surface.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { servicesSetupModel } from './services-setup-state.js';
import { campaignById, campaigns, loadCampaigns, saveCampaign } from './campaigns.js';
import { completeInstallationMap } from './installation-map.js';
import { createEmbeddedNewTeamFormView } from './new-team-form.js';
import { createEmbeddedNewAgentView } from './new-agent.js';
import { HOUSE_PRESETS, PRESETS_TYPE, buildLaunchPlan, initialControls, seatingPlan } from './presets.js';
import { launchPresetPlan, presetLaunchUrl } from './preset-launch.js';
import { closeWorkspaceTab, reserveWorkspaceTab } from './workspace.js';
import { createInstallationsSurface } from './campaign-installations.js';
import { createStatusMarker } from './status-marker.js';

// Model providers is the one surface two workbenches seat (provider-surface.js); its type
// is that module's, and Ronin Settings registers the same definition.
export const SETUP_SURFACE_TYPES = Object.freeze({
  register: 'setup.register', providers: PROVIDER_SURFACE_TYPE, roots: 'setup.roots',
  installations: 'setup.installations', bounty: 'setup.bounty', launchOwn: 'setup.launch-own',
});

const summaries = new Map([
  [SETUP_SURFACE_TYPES.register, 'optional'],
  [SETUP_SURFACE_TYPES.roots, '2 folders'],
  [SETUP_SURFACE_TYPES.installations, 'Ronin Services'],
  [SETUP_SURFACE_TYPES.bounty, 'optional · separate opt-in'],
  [SETUP_SURFACE_TYPES.launchOwn, 'presets · team · agent'],
]);
const el = (tag, cls = '', text = null) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };
const notifySummary = (type, value, workbench) => {
  if (summaries.get(type) === value) return;
  summaries.set(type, value);
  workbench?.refreshSelector?.();
};
const surface = (label, className = '') => WorkspaceKit.primitives.createSurface({ label, className: `setup-surface ${className}`.trim() });
const action = (label, kind, onClick) => {
  const made = WorkspaceKit.primitives.createAction({ label, kind, action: onClick });
  return made.el ?? made;
};
const servicesReady = (runtime = {}) => runtime?.services?.active === true || runtime?.services?.installed === true || runtime?.services?.switched_on === true;

export const SERVICE_COMPONENTS = Object.freeze([
  { id: 'task_manager', label: 'Task manager', status: 'beta', needs: 'Adds a shared project board and quick summaries of active work.' },
  { id: 'terminal_transcript', label: 'Terminal transcript', status: 'comingSoon', needs: 'Records terminal activity for transcript views and downstream summaries.' },
  { id: 'voice_hotwords', label: 'Voice & Hotwords', status: 'comingSoon', needs: 'Adds voice tools and corrections for words dictation commonly mishears.' },
  { id: 'usage_stats', label: 'Usage stats', status: 'beta', needs: 'Keeps local usage counts without storing transcript content.' },
  { id: 'machine_status', label: 'Machine status', status: 'beta', needs: 'Shows this box\'s memory, swap and load in the header.' },
  { id: 'project_coordinator', label: 'Project coordinator', status: 'beta', needs: 'Watches active projects and prompts Agents to keep status and summaries current.' },
  { id: 'local_weights', label: 'Local weights', status: 'beta', needs: 'Provides locally stored model weights for features that need them.' },
]);

export function serviceComponentRows(installed, masterOn) {
  const parked = new Set((installed?.services?.capabilities?.parked || []).map((item) => item.name));
  return SERVICE_COMPONENTS.map((component) => ({
    v: component.id,
    off: parked.has(component.id) ? 'Currently unavailable' : !masterOn ? 'Turn on Running services first' : '',
  }));
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
  const choiceGroup = (name, label, choices, { multiple = false, explain = false, short = '' } = {}) => {
    const value = input(name, 'hidden');
    for (const [key, text] of choices) labels.set(key, text);
    let selected = multiple ? [] : '';
    const listeners = [];
    const question = ask([{ group: label, fields: [{ key: name, label: short || t('ask.answer', 'Answer'), many: multiple, options: choices.map(([key, text, description = '']) => ({ v: key, l: text, sub: description })) }] }], {
      value: { [name]: selected },
      exposed: true,
      onChange: (next) => { selected = next[name]; value.value = multiple ? JSON.stringify(selected) : selected; for (const listener of listeners) listener(selected); },
    });
    question.el.classList.add('setup-register-bounded');
    return { value, wrap: question.el, values: () => multiple ? [...selected] : selected, onChange: (listener) => listeners.push(listener), set: (next) => question.set(name, next) };
  };
  const checklistGroup = (name, label, choices) => {
    const other = input(`${name}_other`); other.className = 'setup-register-other'; other.placeholder = t('setup_surface.something_else_prompt', 'Tell us'); other.hidden = true;
    const checks = [];
    for (const [value, text] of choices) labels.set(value, text);
    const wrap = el('fieldset', 'setup-register-checklist');
    wrap.classList.add('setup-register-reasons');
    wrap.append(el('legend', 'setup-register-question', label));
    for (const [value, text] of choices) {
      const box = input(name, 'checkbox');
      box.value = value;
      checks.push(box);
      box.addEventListener('change', () => {
        other.hidden = !checks.some((item) => item.value === 'something_else' && item.checked);
        if (!other.hidden && box.value === 'something_else' && box.checked) other.focus();
      });
      wrap.append(checkRow(text, box));
    }
    wrap.append(other);
    return { wrap, other, values: () => checks.filter((box) => box.checked).map((box) => box.value) };
  };
  const email = input('email', 'email'); email.placeholder = 'you@example.com'; email.autocomplete = 'email';
  const identityMode = choiceGroup('identity_mode', t('setup_surface.identity', 'How would you like to register?'), [
    ['email', 'With email', 'Eligible for additional Ronin Services and participation in the Bounty Program.'],
    ['anonymous', 'Anonymous'], ['no_thanks', 'No thank you'],
  ], { short: t('setup_surface.identity_short', 'Register as') });
  identityMode.wrap.classList.add('setup-register-identity-choice');
  const kind = choiceGroup('kind', t('setup_surface.kind', 'Which of these are you most likely to use?'), [
    ['build_software', 'Build software'], ['life_assistants', 'Life assistants'],
    ['research_writing', 'Research and writing'], ['other', 'Something else'],
  ], { short: t('setup_surface.kind_short', 'You use Ronin for') });
  const kindOther = input('kind_other'); kindOther.className = 'setup-register-other'; kindOther.placeholder = t('setup_surface.something_else_prompt', 'Tell us'); kindOther.hidden = true;
  kind.onChange(() => {
    kindOther.hidden = kind.value.value !== 'other'; if (!kindOther.hidden) kindOther.focus();
    const routeKind = { build_software: 'build', life_assistants: 'life', research_writing: 'research', other: 'other' }[kind.value.value];
    context.environment?.kinds?.set(routeKind ? [routeKind] : []);
  });
  const preferredFeature = choiceGroup('preferred_feature', t('setup_surface.preferred_feature', 'Which core Ronin capability do you prefer most?'), [
    ['remote_access', 'Work from anywhere', t('setup_surface.feature_remote_access', 'Ronin runs on your home machine or a virtual machine. You open it from a browser wherever you are, any time.')],
    ['multiple_providers', 'Multiple providers without lock-in', t('setup_surface.feature_multiple_providers', 'You keep your own accounts and your direct relationship with each model provider. Ronin never stands in between, everything runs on your machine, and how your agents work together is yours.')],
    ['team_coordination', 'Agents with team coordination skills', t('setup_surface.feature_team_coordination', 'Coordination is light reading an agent does to build its brief. Each launch brief carries a few simple tools so agents can message and coordinate with one another.')],
  ], { explain: true, short: t('setup_surface.preferred_feature_short', 'Capability') });
  const reasons = checklistGroup('reasons', t('setup_surface.reasons', 'Which of these describes you best in terms of getting value from Ronin?'), [
    ['different_strengths', 'Different models have different strengths. I want to use the best one for each job.'],
    ['network_resilience', 'Sometimes one model provider is having network issues, so I want another available.'],
    ['new_models', 'New models keep arriving. I want to switch without rebuilding my workspace.'],
    ['avoid_lock_in', 'I do not want to get locked into one provider.'],
    ['subscription_limits', 'If one subscription runs out of tokens, I want to shift work to another provider.'],
    ['visible_agents', 'I prefer a visible team of agents I can interact with directly, rather than hidden sub-agents.'],
    ['own_instructions', 'I want my own standing instructions handed to my agents every time: a README or Behavior that some agents, every agent, or a whole team reads by default.'],
    ['no_collisions', 'When several agents work in one codebase, I want a structured way to keep them from colliding.'],
    ['something_else', 'Something else.'],
  ], { short: t('setup_surface.reasons_short', 'Describes you') });
  const runLocation = choiceGroup('run_location', t('setup_surface.run_location', 'Where will you install Ronin?'), [
    ['virtual_machine', 'Virtual machine'], ['personal_server', 'Personal server'], ['personal_computer', 'Personal computer'],
  ], { short: t('setup_surface.run_location_short', 'Install on') });
  const own = el('textarea'); own.name = 'own_words'; own.rows = 3;
  own.addEventListener('change', () => { void context.environment?.setPathNote?.(own.value); });
  const identity = el('div', 'setup-registration-identity');
  identity.hidden = true;
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
  const route = el('section', 'setup-register-group setup-register-route');
  route.append(
    el('h3', '', t('setup_surface.setup_help', 'Help with system setup')),
    el('p', 'setup-lede', t('setup_surface.setup_help_lede', 'Tell us what you are most likely to use Ronin for so Setup can show the most useful path.')),
    kind.wrap, kindOther, ownField,
  );
  const registrationIntro = el('section', 'setup-register-group setup-register-intro');
  registrationIntro.append(
    el('h3', '', t('setup_surface.optional_registration', 'Optional system registration')),
    el('p', 'setup-lede', t('setup_surface.optional_registration_lede', 'Registration is optional. It is separate from your local Ronin activity and from the services you install.')),
  );
  const registrationReasons = el('ul', 'setup-register-reasons-list');
  for (const reason of [
    t('setup_surface.registration_reason_preferences', 'Share preferences and help support a model-provider ecosystem without lock-in.'),
    t('setup_surface.registration_reason_services', 'Use additional Ronin Services while keeping installation and user activity separate from registration.'),
    t('setup_surface.registration_reason_bounty', 'Participate in the Ronin Bounty Program.'),
  ]) registrationReasons.append(el('li', '', reason));
  registrationIntro.append(registrationReasons, el('p', 'setup-fine', t('setup_surface.registration_privacy', 'Ronin does not build a commercial identity profile from your local activity.')));
  fit.append(
    el('h3', '', t('setup_surface.ronin_fit', 'What brings you here')), preferredFeature.wrap, reasons.wrap,
  );
  const consent = el('p', 'setup-fine setup-register-consent', t('setup_surface.consent_exact', 'Email registration sends a confirmation and supports Ronin Services and Bounty participation. Anonymous registration shares these answers without contact details.'));
  const declined = el('p', 'setup-register-declined', t('setup_surface.no_thanks_message', 'Enjoy using Ronin. If you’d like to share feedback later, we’d be glad to hear from you at a later date.'));
  declined.hidden = true;
  const userIntro = el('section', 'setup-register-group setup-user-intro');
  const userIntroText = el('textarea');
  userIntroText.rows = 4; userIntroText.maxLength = 600;
  userIntroText.placeholder = 'Hi, my name is Jill. I’m a vibe coder. Simple explanations help me, and I’m happy to try ambitious ideas.';
  const userIntroNotice = el('p', 'setup-notice'); userIntroNotice.setAttribute('role', 'status');
  const saveUserIntro = async () => {
    const intro = userIntroText.value.trim();
    if (!intro) { userIntroNotice.textContent = t('setup_surface.user_intro_empty', 'Write a short introduction before saving.'); return false; }
    const result = await request('/api/setup/user-intro', { method: 'PUT', json: { intro } });
    userIntroNotice.textContent = result.ok
      ? t('setup_surface.user_intro_saved', 'Saved locally for future Agent introductions.') : result.message;
    if (result.ok) userIntro.hidden = true;
    return result.ok;
  };
  const saveUserIntroAction = action(t('setup_surface.user_intro_submit', 'Submit'), 'primary', () => { void saveUserIntro(); });
  const userIntroActions = el('div', 'setup-user-intro-actions');
  userIntroActions.append(saveUserIntroAction, el('span', 'setup-fine', t('setup_surface.user_intro_local_only', 'Saved locally — not sent to Ronin.')));
  userIntro.append(
    el('h3', '', t('setup_surface.user_intro_heading', 'Introduce yourself to your Agents')),
    el('p', 'setup-lede', t('setup_surface.user_intro_lede', 'This stays on your machine in user intro.md and is included when new Agents are born. It is separate from registration. Keep it short: up to 600 characters, roughly 150 tokens.')),
    field(t('setup_surface.user_intro_label', 'A short note about you'), userIntroText),
    userIntroActions,
    userIntroNotice,
  );
  const registerAction = action(t('setup_surface.register_action', 'Send'), '', async () => {
    notice.textContent = t('setup_surface.saving', 'Saving…');
    const anonymous = identityMode.value.value !== 'email';
    if (userIntroText.value.trim() && !await saveUserIntro()) return;
    const result = await request('/api/setup/registration', { method: 'POST', json: {
      identity_mode: anonymous ? 'anonymous' : 'email', email: email.value, purpose: '',
      kind: '', kind_other: '', user_type: '', goals: [], preferred_feature: preferredFeature.value.value,
      reasons: reasons.values(), reason_other: reasons.other.value, run_location: runLocation.value.value,
      intended_use: [], theme_preference: '', own_words: '',
    } });
    notice.textContent = result.ok
      ? anonymous ? t('setup_surface.anonymous_saved', 'Thanks — your anonymous hello was sent to Ronin.') : t('setup_surface.confirm_email', 'Registration saved. Confirm your email to complete registration.')
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
    runLocation.wrap.hidden = declinedRegistration;
    fit.hidden = declinedRegistration;
    consent.hidden = declinedRegistration;
    registerAction.hidden = declinedRegistration;
    notice.hidden = declinedRegistration;
    send.hidden = declinedRegistration;
    declined.hidden = !declinedRegistration;
    email.required = emailRegistration && !declinedRegistration;
  };
  identityMode.onChange(() => {
    paintIdentityMode();
    const identity = identityMode.value.value === 'no_thanks' ? 'declined' : identityMode.value.value;
    if (identity) void context.environment?.setIdentityChoice?.(identity);
  });
  paintIdentityMode();
  form.append(welcome, registrationIntro, about, fit, send);
  const recovery = el('div', 'setup-registration-recovery');
  const recoveryOptions = el('section', 'setup-register-group setup-register-options');
  recoveryOptions.append(
    el('h3', '', t('setup_surface.registration_confirmation', 'Registration confirmation')),
    el('p', 'setup-lede', t('setup_surface.registration_confirmation_lede', 'Required only if you want to install Ronin Services.')),
    recovery,
  );
  /** The submitted summary speaks the same words the form showed, never a stored key. */
  const wordFor = (key) => labels.get(key) || '';
  const summaryWords = () => {
    const words = [current?.email_masked, current?.run_location && wordFor(current.run_location), current?.preferred_feature && wordFor(current.preferred_feature)];
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
    recoveryOptions.hidden = !current?.submitted_at;
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
  body.append(identity, form, userIntro, declined, recoveryOptions, notice); out.content.append(body);
  return { el: out.el, show: async () => {
    const routeKind = context.environment?.kinds?.get?.()[0] || '';
    kind.set({ build: 'build_software', life: 'life_assistants', research: 'research_writing', other: 'other' }[routeKind] || '');
    own.value = context.environment?.setupRuntime?.preferences?.path_note || '';
    const [result, intro] = await Promise.all([
      request('/api/setup/registration', { cache: 'no-store' }),
      request('/api/setup/user-intro', { cache: 'no-store' }),
    ]);
    current = result.ok ? result.data : null;
    if (intro.ok) {
      userIntroText.value = intro.data?.intro || '';
      userIntro.hidden = Boolean(userIntroText.value.trim());
    }
    paint();
  } };
}

function createRootsSurface(context) {
  return createWorkspaceFoldersSurface({
    campaignId: () => context.tenant?.campaign || '',
    presentation: 'stones',
    environment: context.environment,
    workspace: context.workspace,
    onShow: () => notifySummary(SETUP_SURFACE_TYPES.roots, '2 folders + yours', context.workbench),
  });
}

function createBountySurface(context) {
  const out = surface(t('setup_surface.bounty', 'Bounty Program'));
  const intro = el('section', 'setup-bounty-intro');
  intro.append(
    el('span', 'setup-register-eyebrow', t('bounty.eyebrow', 'BUILD RONIN WITH US')),
    el('h2', '', t('bounty.heading', 'Choose a bounty project')),
    el('p', 'setup-lede', t('bounty.lede', 'Browse published projects, choose one you want to take on, and submit a proposal. Joining is always a separate choice.')),
  );
  intro.append(el('p', 'setup-fine', t('bounty.projects_note', 'Every project brief is public. Registration is required only to apply.')));
  const definitions = [
    { id: 'adaptive-onboarding', label: t('bounty.project_onboarding', 'Adaptive onboarding scenes'), description: t('bounty.project_onboarding_note', 'Deliver a clear first-run route that responds to a person’s intended use without hiding alternate paths.') },
    { id: 'provider-recovery', label: t('bounty.project_providers', 'Provider sign-in recovery'), description: t('bounty.project_providers_note', 'Improve authentication windows, completion detection, and recovery when a provider sign-in is interrupted.') },
    { id: 'repository-setup', label: t('bounty.project_workspaces', 'Repository and worktree setup'), description: t('bounty.project_workspaces_note', 'Design the guided GitHub clone, repository arrangement, worktree, and hand-in experience for a new workspace.') },
  ];
  let gates = { registered: false, github: false, machine: false, joined: false };
  const renderDetail = (project, host) => {
    const detail = el('article', 'setup-bounty-detail');
    detail.append(el('h3', '', project.label), el('p', 'setup-lede', project.description));
    const requirements = el('ul', 'setup-bounty-requirement-list');
    for (const [ready, text] of [[gates.machine, 'Two model providers and Ronin Services ready'], [gates.github, 'GitHub connected'], [gates.registered, 'Email registration confirmed']]) {
      requirements.append(el('li', ready ? 'ready' : 'locked', `${ready ? '✓' : '○'} ${text}`));
    }
    const notice = el('p', 'setup-notice'); notice.setAttribute('role', 'status');
    const apply = action(t('bounty.apply', 'Apply for this bounty'), 'primary', async () => {
      const result = await request('/api/setup/preferences', { method: 'PATCH', json: { bounty_opt_in: true } });
      notice.textContent = result.ok ? t('bounty.joined', 'Bounty Program opt-in saved on this machine.') : result.message;
      if (result.ok) apply.disabled = true;
    });
    apply.disabled = !gates.machine || !gates.github || !gates.registered || gates.joined;
    detail.append(el('h4', '', t('bounty.requirements', 'Before you apply')), requirements, apply, notice);
    host.append(detail);
  };
  const stones = createStoneWorkSurface({ className: 'setup-bounty-stones', renderDetail });
  stones.mount(out.content, { before: [intro] });
  return { el: out.el, show: async () => {
    const [registration, github] = await Promise.all([
      request('/api/setup/registration', { cache: 'no-store' }), request('/api/setup/github', { cache: 'no-store' }),
    ]);
    const email = registration.ok && registration.data?.status === 'registered' && registration.data?.identity_mode === 'email';
    const connected = github.ok && github.data?.authenticated === true;
    gates = { registered: email, github: connected, machine: servicesReady(context.environment?.setupRuntime) && Number(context.environment?.setupRuntime?.activated_count || 0) >= 2, joined: context.environment?.setupRuntime?.preferences?.bounty_opt_in === true };
    stones.setItems(definitions.map((project) => ({ ...project, glyph: '◈', state: t('bounty.public_brief', 'Public brief') })));
  }, destroy: () => stones.destroy() };
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

/** Ronin Services: beta intro, stable lifecycle, then six persistent feature controls. */
export function createServicesSurface(context) {
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
    identity.append(el('h2', '', t('settei.ronin_services', 'Ronin Services')));
    lockup.append(markHost, identity, el('strong', 'setup-services-beta-marker', t('services_setup.beta', 'In beta')));
    const copy = el('section', 'setup-services-beta');
    for (const words of [
      t('services_setup.intro', 'Ronin Services are incremental features and are not required for agent coworking functionality.'),
      t('services_setup.beta_copy', 'These are beta projects and often require working with third parties. The code is open code, not open source: free to read, not to commercialise.'),
      t('services_setup.registration_copy', 'Filling out the registration and sharing your email opens access to Ronin Services free of charge. We also ask that you help build Ronin and share a weekly count of tool calls. This is not linked to your identity and carries no code, tiles, name, or alpha of any kind.'),
    ]) copy.append(el('p', '', words));
    intro.append(lockup, copy);
    return intro;
  };
  const openRegister = () => context.workbench?.place(SETUP_SURFACE_TYPES.register, context.workspace || 'workspace2');
      /** The Services installation switch in the Campaign's complete installation map. */
  const switchServices = async (on) => {
    const [catalog] = await Promise.all([request('/api/installations'), loadCampaigns()]);
    const row = campaignById(context.tenant?.campaign) || campaigns()[0];
    if (!row) return { ok: false, message: t('services_setup.no_campaign', 'No Campaign to switch it on for.') };
    const installations = { ...completeInstallationMap(catalog.ok && Array.isArray(catalog.data) ? catalog.data : [], row.config?.installations), ronin_services: on };
    const result = await saveCampaign(row.id, { config: { installations } });
    if (result.ok) context.onInstallationChange?.('ronin_services', on);
    return result;
  };
  const switchComponents = async (selected) => {
    const row = campaignById(context.tenant?.campaign) || campaigns()[0];
    if (!row) return { ok: false, message: t('services_setup.no_campaign', 'No Campaign to configure.') };
    const chosen = new Set(selected);
    const capabilities = { ...(row.config?.services?.parts || {}) };
    for (const component of SERVICE_COMPONENTS) capabilities[component.id] = chosen.has(component.id);
    return saveCampaign(row.id, { config: { services: { parts: capabilities } } });
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
      loadCampaigns(),
    ]);
    // Ronin is down or unreachable for a moment (a restart in flight): keep what is painted and look again shortly.
    if (!installed.ok && installed.kind === 'network' && body.dataset.state) { timer = setTimeout(() => { if (body.isConnected) void show(); }, 3000); return; }
    const model = servicesSetupModel(registration, installed, activation);
    const startedAt = installed.ok ? installed.data?.cowork?.startedAt || '' : '';
    const intro = explain();
    body.replaceChildren(intro);
    body.dataset.state = model.state;
    const state = el('section', 'setup-services-status');
    state.dataset.tone = model.tone;
    state.setAttribute('aria-live', 'polite');
    state.append(el('p', 'setup-services-status-line', model.status), el('p', 'setup-services-next', model.next));

    // Four permanent slots; Restart stays inactive until the installed facts require it.
    const steps = el('div', 'setup-services-steps');
    steps.setAttribute('aria-label', 'Ronin Services beta');
    steps.addEventListener('click', (event) => {
      if (saving) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, { capture: true });
    const notice = el('p', 'setup-notice setup-services-notice', said);
    if (said) notice.classList.add('bad');
    let saving = false;
    const stepNodes = new Map();
    const paintSteps = (nextModel) => {
      const lifecycle = [...nextModel.steps];
      if (!lifecycle.some((item) => item.id === 'restart')) lifecycle.push({
        id: 'restart', caption: t('services_setup.step_restart', 'Restart'),
        label: t('services_setup.restart', 'Restart'), act: 'restart', enabled: false,
      });
      for (const item of lifecycle) {
        const existing = stepNodes.get(item.id);
        if (existing) {
          existing.querySelector('button').disabled = !item.enabled || !item.act;
          continue;
        }
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
        stepNodes.set(item.id, wrap);
      }
    };
    paintSteps(model);
    body.append(steps);
    notice.setAttribute('aria-live', 'polite');
    const campaign = campaignById(context.tenant?.campaign) || campaigns()[0];
    let desired = campaign?.config?.services?.parts || installed.data?.services?.capabilities?.desired || {};
    let facts = installed.data;
    const controls = new Map();
    const values = el('div', 'setup-services-benefits setup-services-components');
    const updateControls = () => {
      for (const row of serviceComponentRows(facts, facts?.services?.switched_on === true)) {
        const control = controls.get(row.v);
        if (control.question.value()[row.v] !== (desired[row.v] === true)) control.question.set(row.v, desired[row.v] === true);
        const reason = row.off || (!installed.ok ? 'Currently unavailable' : '');
        control.question.disable(row.v, reason);
        control.button.setAttribute('aria-disabled', String(saving || control.button.disabled));
        control.status.textContent = reason;
      }
    };
    for (const component of SERVICE_COMPONENTS) {
      const item = el('div', 'setup-services-benefit');
      const heading = el('h3', '', component.label);
      heading.append(createStatusMarker(component.status));
      const copy = el('div', 'setup-services-feature-copy');
      const status = el('span', 'setup-services-feature-status');
      const caption = el('p', '', component.needs);
      caption.id = `services-caption-${component.id}-${context.workspace || 'workspace2'}`;
      copy.append(caption, status);
      const question = ask([{ fields: [{ key: component.id, label: component.label, switch: ['On', 'Off'] }] }], {
        value: { [component.id]: desired[component.id] === true },
        onChange: async (answer) => {
          if (saving) return;
          clearTimeout(timer);
          const before = { ...desired };
          desired = { ...desired, [component.id]: answer[component.id] };
          saving = true;
          updateControls();
          notice.classList.remove('bad');
          notice.textContent = t('campaign.saving', 'saving…');
          const result = await switchComponents(SERVICE_COMPONENTS.filter((row) => desired[row.id] === true).map((row) => row.id));
          if (!result.ok) {
            desired = before;
            notice.textContent = 'Could not save this choice. Please try again.';
            notice.classList.add('bad');
          } else {
            notice.textContent = t('settei.saved', 'saved');
            // One local facts read preserves runtime disagreement, including partial loads.
            // Component selection never calls show(), activation polling, or page refresh.
            const fresh = await request('/api/installed', { cache: 'no-store' });
            if (fresh.ok) {
              facts = fresh.data;
              const next = servicesSetupModel(registration, fresh, activation);
              paintSteps(next);
              body.dataset.state = next.state;
              state.dataset.tone = next.tone;
              state.querySelector('.setup-services-status-line').textContent = next.status;
              state.querySelector('.setup-services-next').textContent = next.next;
            } else {
              notice.textContent = 'Saved. Could not check running Services; restart status is unconfirmed.';
            }
          }
          saving = false;
          updateControls();
        },
      });
      const button = question.el.querySelector('[role="switch"]');
      button.addEventListener('click', (event) => {
        if (saving) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, { capture: true });
      button.setAttribute('aria-label', component.label);
      button.setAttribute('aria-describedby', caption.id);
      controls.set(component.id, { question, button, status });
      item.append(question.el, heading, copy);
      values.append(item);
    }
    updateControls();
    body.append(values, notice, state);
    body.append(el('p', 'setup-fine', 'Template Library offers ready-made Teams and Agents with their books and tools. It has no separate Services switch.'));
    body.append(el('p', 'setup-fine setup-services-gate', t('services_setup.gate', 'The Grokbot Morning Briefing preset waits for Ronin Services to be active.')));
    // A confirmation or an install in flight: look again quietly while the surface is on screen.
    if (model.polling) timer = setTimeout(() => { if (body.isConnected) void show(); }, model.state === 'installing' || model.steps.some((item) => item.id === 'restart') ? 5000 : 15000);
  };
  return { el: out.el, show, destroy: () => clearTimeout(timer) };
}

/** gbrain: the Setup presentation of the commons tab. Reads and presses are the tab's own. */
export function createGbrainSurface(context) {
  const out = surface(t('pane.gbrain', 'gbrain'));
  const host = el('div', 'setup-surface-body'); out.content.append(host);
  const room = buildGbrain(host, () => host.isConnected, (prompt) => context.environment?.showNewSession?.(prompt), {
    presentation: 'setup',
    installationControls: context.installationControls,
    availability: () => {
      const runtime = context.environment?.setupRuntime;
      return runtime?.gbrain ? { ...runtime.gbrain, services: runtime.services || null, activated_count: Number(runtime.activated_count || 0) } : null;
    },
    // The selector card follows the measured state once it is read.
    onState: () => context.workbench?.refreshSelector?.(),
    openServices: () => context.workbench?.place(SETUP_SURFACE_TYPES.installations, context.workspace || 'workspace2'),
    openProviders: () => context.workbench?.place(SETUP_SURFACE_TYPES.providers, context.workspace || 'workspace2'),
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
    context.workbench?.refreshSelector?.();
    room.enter?.();
  } };
}

function createLaunchOwnSurface(context) {
  const out = surface(t('setup_surface.launch_own', 'Launch your own'));
  const setup = context.tenant?.kind === 'setup';
  const renderDetail = (item, host) => {
    if (item.id === 'preset') {
      context.workbench?.place(PRESETS_TYPE, context.workspace || 'workspace2');
      return null;
    }
    const views = [item.id === 'team' ? createEmbeddedNewTeamFormView(WorkspaceKit, {}) : createEmbeddedNewAgentView(WorkspaceKit, {})];
    host.append(...views.map((view) => view.el));
    for (const view of views) void view.enter({});
    return () => { for (const view of views) view.el.remove(); };
  };
  const stones = createStoneWorkSurface({
    items: [
      { id: 'agent', glyph: '人', label: t('agent', 'Agent') },
      { id: 'team', glyph: '人人', label: t('team', 'Team') },
      ...(setup ? [{ id: 'preset', glyph: '▤', label: t('setup.presets', 'Presets') }] : []),
    ],
    className: 'setup-launch-own-surface',
    renderDetail,
  });
  // Mount on the surface content itself, like Presets and Providers, so the shared SWS
  // host owns the seat container and its narrow/normal/super-wide insets.
  stones.mount(out.content);
  return { el: out.el, destroy: () => stones.destroy() };
}

function createSetupInstallationsSurface(context) {
  const selected = () => campaignById(context.tenant?.campaign) || campaigns()[0] || null;
  const page = createInstallationsSurface(selected, {
    ...context,
    onInstallationsState: (values) => context.environment?.onInstallationsState?.(values),
    createInstallationSurface: (id, shared) => id === 'ronin_services' ? createServicesSurface(shared) : id === 'gbrain' ? createGbrainSurface(shared) : null,
  });
  // Setup chooses and sequences the shared page; it does not change the page's controls.
  // The shared Services model owns the Install, Turn on, and Restart gates in every
  // workbench, and the server independently enforces the same capabilities.
  return { el: page.el, show: async () => {
    await loadCampaigns();
    await page.enter();
  }, destroy: () => page.destroy?.() };
}

export function setupSurfaceDefinitions() {
  const definition = (type, label, create, groupKey = '') => ({
    type, header: 'surface', label: () => label, summary: () => summaries.get(type), create: (context) => create(context),
    ...(groupKey ? { groupKey } : {}),
  });
  return [
    definition(SETUP_SURFACE_TYPES.register, t('setup_surface.register', 'Register'), createRegisterSurface),
    providerSurfaceDefinition(),
    definition(SETUP_SURFACE_TYPES.roots, t('setup_surface.roots', 'Workspace folders'), createRootsSurface),
    definition(SETUP_SURFACE_TYPES.installations, t('campaign_view.installations', 'Installations'), createSetupInstallationsSurface),
    definition(SETUP_SURFACE_TYPES.bounty, t('setup_surface.bounty', 'Bounty Program'), createBountySurface),
    definition(SETUP_SURFACE_TYPES.launchOwn, t('setup_surface.launch_own', 'Launch your own'), createLaunchOwnSurface),
  ];
}

export function registerSetupSurfaces() {
  const library = WorkspaceKit.workbench.library;
  for (const definition of setupSurfaceDefinitions()) if (!library.has(definition.type)) library.register(definition);
  return SETUP_SURFACE_TYPES;
}
