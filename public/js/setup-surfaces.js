/* Selector-driven workspace-2 surfaces for the Ronin Setup workbench. */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { createWorkspacesRead } from './workspaces-read.js';
import { createWorkspaceKickoff } from './setup-workspace-kickoff.js';
import { ask } from './ask.js';
import { PROVIDER_SURFACE_TYPE, harnessesSurfaceDefinition } from './harnesses-surface.js';
import { harnessSurfaceDefinition } from './setup-harness-surface.js';
import { createPhalanx } from './phalanx.js';
import { createEmbeddedNewTeamFormView } from './new-team-form.js';
import { createEmbeddedNewAgentView } from './new-agent.js';
import { createSetupZoneSlot, watchSetupProgress } from './setup-zone.js';
import { createTourSurface } from './setup-tour.js';

// Model providers is the one surface two workbenches seat (harnesses-surface.js); its type
// is that module's, and Ronin Settings registers the same definition.
export const SETUP_SURFACE_TYPES = Object.freeze({
  register: 'setup.register', providers: PROVIDER_SURFACE_TYPE, roots: 'setup.roots',
  launchOwn: 'setup.launch-own', team: 'setup.team',
});

const summaries = new Map([
  [SETUP_SURFACE_TYPES.register, 'optional'],
  [SETUP_SURFACE_TYPES.launchOwn, 'team · agent'],
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
    ['email', 'With email', 'Eligible for additional Ronin Services.'],
    ['anonymous', 'Anonymous'],
  ], { short: t('setup_surface.identity_short', 'Register as') });
  identityMode.wrap.classList.add('setup-register-identity-choice');
  const kind = choiceGroup('kind', t('setup_surface.kind', 'Which of these are you most likely to use?'), [
    ['build_software', 'Build software'], ['life_assistants', 'Life assistants'],
    ['research_writing', 'Research and writing'], ['other', 'Something else'],
  ], { short: t('setup_surface.kind_short', 'You use Ronin for') });
  const kindOther = input('kind_other'); kindOther.className = 'setup-register-other'; kindOther.placeholder = t('setup_surface.something_else_prompt', 'Tell us'); kindOther.hidden = true;
  kind.onChange(() => {
    kindOther.hidden = kind.value.value !== 'other'; if (!kindOther.hidden) kindOther.focus();
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
  ]) registrationReasons.append(el('li', '', reason));
  registrationIntro.append(registrationReasons, el('p', 'setup-fine', t('setup_surface.registration_privacy', 'Ronin does not build a commercial identity profile from your local activity.')));
  fit.append(
    el('h3', '', t('setup_surface.ronin_fit', 'What brings you here')), preferredFeature.wrap, reasons.wrap,
  );
  const consent = el('p', 'setup-fine setup-register-consent', t('setup_surface.consent_exact', 'Email registration supports Ronin Services. Anonymous registration shares these answers without contact details.'));
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
      intended_use: [], theme_preference: '', own_words: own.value,
    } });
    notice.textContent = result.ok
      ? (anonymous ? t('setup_surface.anonymous_saved', 'Thanks — your anonymous hello was sent to Ronin.') : t('setup_surface.registration_complete', 'Registration complete.'))
      : result.message;
    if (result.ok) { current = result.data; paint(); context.environment?.onRegistrationChoice?.('acted'); }
  });
  registerAction.dataset.launch = 'true';
  registerAction.dataset.endsEdit = '';
  const sendLabel = registerAction.textContent;
  registerAction.replaceChildren(WorkspaceKit.primitives.ninMark('wk-launch-mark'), el('span', '', sendLabel));
  const send = el('div', 'setup-register-send');
  send.append(consent, registerAction, notice);
  let formOpen = false; // see THE HEADER ZONE, below
  const paintIdentityMode = () => {
    const emailRegistration = identityMode.value.value === 'email';
    emailField.hidden = !emailRegistration;
    email.required = emailRegistration;
  };
  identityMode.onChange(() => { paintIdentityMode(); });
  paintIdentityMode();
  form.append(welcome, registrationIntro, about, fit, send);
  const recovery = el('div', 'setup-registration-recovery');
  const recoveryOptions = el('section', 'setup-register-group setup-register-options');
  recoveryOptions.append(
    el('h3', '', t('setup_surface.registration_heading', 'Registration')),
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
    const anonymous = current?.status === 'anonymous';
    identity.hidden = !current?.submitted_at;
    identity.dataset.tone = 'ok';
    identity.replaceChildren(el('strong', '', anonymous ? t('setup_surface.registered_anonymous', 'Registered anonymously') : t('setup_surface.registered', 'Registered')),
      el('span', '', summaryWords()));
    form.hidden = !formOnShow();
    recoveryOptions.hidden = !current?.submitted_at;
    recovery.replaceChildren();
    const changeEmail = () => action(t('setup_surface.change_registration_email', 'Change email'), '', async () => {
      const next = window.prompt(t('setup_surface.new_registration_email', 'New registration email:'));
      if (!next?.trim()) return;
      const result = await request('/api/setup/registration', { method: 'POST', json: {
        identity_mode: 'email', email: next.trim(), purpose: current.purpose,
        kind: current.kind, kind_other: current.kind_other, user_type: current.user_type, goals: current.goals,
        preferred_feature: current.preferred_feature, reasons: current.reasons, reason_other: current.reason_other, run_location: current.run_location,
        intended_use: current.intended_use,
        theme_preference: current.theme_preference, own_words: current.own_words,
      } });
      notice.textContent = result.ok ? t('setup_surface.registration_address_changed', 'Registration email changed.') : result.message;
      if (result.ok) { current = result.data; paint(); }
    });
    if (current?.submitted_at && !anonymous) recovery.append(changeEmail());
    if (current?.submitted_at) recovery.append(action(t('setup_surface.delete_registration', 'Delete registration'), 'danger', async () => {
      if (!window.confirm(t('setup_surface.delete_registration_confirm', 'Delete this registration and its Services entitlement from this machine? Communication preferences will also be removed.'))) return;
      const result = await request('/api/setup/registration', { method: 'DELETE' });
      notice.textContent = result.ok ? t('setup_surface.registration_deleted', 'Registration deleted. Local Ronin remains available.') : result.message;
      if (result.ok) { current = result.data; paint(); }
    }));
    notifySummary(SETUP_SURFACE_TYPES.register, current?.status || 'optional', context.workbench);
    paintZone();
  };
  /** Step 2's header zone. Registering is the decision; the form below is how it is done. */
  /* ── THE HEADER ZONE ──────────────────────────────────────────────────────────────────
     Step 2 is ticked when this machine is registered, by name or anonymously (the machine
     fact, KAN-768); nothing else is recorded, and not registered is simply unticked. The
     form is on show until they register; registered anonymously, Register here shows it
     again to add their email. Registered, the zone empties as every settled step does. */
  const zone = context.environment?.setupZones ? createSetupZoneSlot() : null;
  const formOnShow = () => formOpen || !current?.submitted_at;
  const showForm = () => { formOpen = true; paint(); };
  const paintZone = () => {
    if (!zone) return;
    if (current?.status === 'registered') { zone.paint(); return; }
    zone.paint({
      state: current?.status === 'anonymous' ? 'Said hello anonymously.'
        : 'Register to join the community and share your experience — it makes Ronin better for everyone.',
      // Shows the form; it does NOT send it. Pressing Send stays the person's own act.
      picks: current?.status === 'anonymous' ? [{ label: 'Register here', action: showForm }] : [],
    });
  };
  // The ticks can change elsewhere, so the zone listens for them; paint() repaints the zone as its last act.
  const stopProgress = watchSetupProgress(context.environment, paint);
  if (zone) out.content.append(zone.el);
  body.append(identity, form, userIntro, recoveryOptions, notice); out.content.append(body);
  return { el: out.el, show: async () => {
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
  }, destroy: () => stopProgress() };
}

// Setup's Workspace step is the Workspaces themselves (KAN-728): each a stone opening its record, and
// New Workspace, so every folder Setup adds is a row of a Workspace. The kickoff
// questions sit over them (KAN-809).
function createRootsSurface(context) {
  const workspacesRead = createWorkspacesRead();
  // The step's own surface (owner, 25 Nov; KAN-809): the four doors, not the Workspaces page.
  const out = surface(t('setup_surface.roots', 'Workspace'), 'setup-workspace-surface');
  const step = createWorkspaceKickoff({ workspacesRead, environment: context.environment, intro: true });
  out.content.append(step.el);
  return { el: out.el,
    show: () => { void workspacesRead.read().then(() => notifySummary(SETUP_SURFACE_TYPES.roots, t('setup_surface.roots_summary', '{n} Workspaces', { n: workspacesRead.list().length }), context.workbench)); },
    destroy: () => step.destroy() };
}

function createLaunchOwnSurface(context) {
  const out = surface(t('setup_surface.launch_own', 'Launch your own'));
  const renderDetail = (item, host) => {
    const views = [item.id === 'team' ? createEmbeddedNewTeamFormView(WorkspaceKit, {}) : createEmbeddedNewAgentView(WorkspaceKit, {})];
    host.append(...views.map((view) => view.el));
    for (const view of views) void view.enter({});
    return () => { for (const view of views) { view.destroy?.(); view.el.remove(); } };
  };
  const stones = createPhalanx({
    items: [
      { id: 'agent', glyph: '人', label: t('agent', 'Agent') },
      { id: 'team', glyph: '人人', label: t('team', 'Team') },
    ],
    className: 'setup-launch-own-surface',
    renderDetail,
  });
  // Mount on the surface content itself, like Providers, so the shared SWS
  // host owns the seat container and its narrow/normal/super-wide insets.
  stones.mount(out.content);
  return { el: out.el, destroy: () => stones.destroy() };
}

// STEP 3, TEAM (w926; docs/architecture/setup-workbench.md): the ordinary New Team form, started in a Workspace;
// the lead builds out the rest. Ticked when a Team has a live lead (teams_agents).
function createTeamSurface() {
  const out = surface(t('setup_surface.team', 'Start a Team'));
  const view = createEmbeddedNewTeamFormView(WorkspaceKit, {});
  out.content.append(view.el);
  void view.enter({});
  return { el: out.el, destroy: () => { view.destroy?.(); } };
}

export function setupSurfaceDefinitions() {
  const definition = (type, label, create, groupKey = '') => ({
    type, header: 'surface', label: () => label, summary: () => summaries.get(type), create: (context) => create(context),
    ...(groupKey ? { groupKey } : {}),
  });
  return [
    definition(SETUP_SURFACE_TYPES.register, t('setup_surface.register', 'Register'), createRegisterSurface),
    harnessesSurfaceDefinition(),
    harnessSurfaceDefinition(),
    definition(SETUP_SURFACE_TYPES.roots, t('setup_surface.roots', 'Workspace'), createRootsSurface),
    definition(SETUP_SURFACE_TYPES.launchOwn, t('setup_surface.launch_own', 'Launch your own'), createLaunchOwnSurface),
    definition(SETUP_SURFACE_TYPES.team, t('setup_surface.team', 'Team'), createTeamSurface),
    definition('setup.tour', t('setup_surface.tour', 'Tour'), createTourSurface),
  ];
}

export function registerSetupSurfaces() {
  const surfaces = WorkspaceKit.workbench.surfaces;
  for (const definition of setupSurfaceDefinitions()) if (!surfaces.has(definition.type)) surfaces.register(definition);
  return SETUP_SURFACE_TYPES;
}
