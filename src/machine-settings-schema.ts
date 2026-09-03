/**
 * THE SETTEI REGISTRY — pure data, served with every answer as `schema`.
 *
 * Split from src/machine-settings.ts by the line ceiling and nothing else: this is still the
 * ONE declaration, the assembly still reads it, and no other file may know a field.
 * Nothing in this file executes — a value here is a datum a renderer interprets
 * through public/js/machine-settings-schema.js, never a code path.
 */

/**
 * THE REGISTRY — every askable leaf declared once, as DATA, and served with the answer.
 *
 * The schema of the object is part of the object: a view may not know a field this
 * block does not say, which is what makes several renderers of one record safe. The
 * declaration used to live client-side (`public/js/setup-fields.js`) and used to be
 * closures — `initial(ctx)`, `fold(body,v)` — which no server could serve or judge.
 * Here every closure became a datum: `from` is the leaf's home — a path into the
 * record; `seed` is what the setup view starts on when the leaf is unanswered
 * (a named source, resolved by the renderer); `lands` names a write family and a key
 * inside its body; `options` names an option source; `omit: 'blank'` is the one
 * omission rule anyone ever used; `short` is the row label where the standing view
 * needs a noun rather than the ask's full question; `ask: false` marks a leaf the
 * standing view edits but first run does not ask. Three more speak only in ⚙:
 * `fallback` (a derived path said as "unset — using …" while the leaf is unanswered —
 * a fallback in force is visible, never passed off as an answer), `note` (a derived
 * path read out beside the row, always), and `aside` (a static line of teaching).
 *
 * `requires` is judged against the observed half (the `needed[]` family) and its
 * vocabulary is five verbs and STAYS five — `key` · `agent` · `tool` · `set` ·
 * `service` (the install's registered sockets; joined 2026-08-18 for the gbrain row
 * and the want list). The next "just one more condition kind" is a new scan family,
 * not a new verb.
 *
 * `met_by` is THE CHOKE (owner, 2026-08-20): every requirement says what KIND of hand
 * closes it, so the mechanical subset can be dispatched without anyone deciding again.
 * Three values, and the whole point is that adding a mechanical item later is one row
 * here rather than a new code path:
 *
 *   `mechanical`  a command can do it, AND Ronin knows the command. Today that is
 *                 exactly the agent CLIs — `AGENTS[].operations.install` in src/agents.ts is the one
 *                 source, and the install operation reads it. "We could shell out to
 *                 something" is not the test; knowing the line is.
 *   `owner`       only the person can: click the link in an email, sign in inside an
 *                 agent, paste a key, accept terms for a download that is entitled.
 *   `agent`       judgment required, so it stays on the setup seat's reading list —
 *                 installing `gh` means knowing whether this box is apt, brew or dnf,
 *                 which is a decision, not a command.
 *
 * It classifies the REQUIREMENT, never its progress: whether something is in flight is
 * the operation's own answer, not a field here.
 *
 * The scan-name lists live here too (`scans`), because a name worth scanning is a
 * name the registry mentions — plus every `key_env` a configured job names, which is
 * typed data and joins at read time. No other file may carry a list of these names.
 *
 * `families` maps a write family to its route — most through the one write door
 * (`PUT /api/machine-settings/:family`); the exceptions say where the leaf actually lives (the
 * cap's shared route with ⌂ Roster, the catalogs store's own POST).
 */
export const MACHINE_SETTINGS_SCHEMA = {
  sections: [
    {
      id: 'campaign',
      title: 'Campaign',
      lede: 'This Ronin instance is one campaign. Name the body of work its projects, teams and agents belong to.',
    },
    {
      id: 'machine',
      title: 'This machine',
      lede: 'Ronin is now installed on this machine — laptop, home server or a VM somewhere, it makes no difference to what follows. This page is already talking to it.',
      facts: true,
    },
    {
      id: 'you',
      title: 'You',
      lede: 'One name, used by everything on the box that has to address you — the assistant, the roster, an agent writing you a note.',
    },
    { id: 'kind', title: 'Kind', lede: 'What do you want to use this app for?' },
    { id: 'routines', title: 'Routine Bundles', lede: 'Choose how much Ronin hands to each new Agent. You can change this later.' },
    {
      id: 'agents',
      title: 'Agents',
      lede: 'Ronin is the room your agents work in — a co-working space for the CLIs you already use, each in its own terminal, all on one screen. So the only question here is what is on the machine: something present is already in the room, and something absent can be fetched — tick it and Ronin installs it for you, in its own tile you can watch. Ronin looks for the command and nothing else — signing in happens inside the agent itself, the first time you use it.',
      custom: 'agents',
    },
    {
      id: 'defaults',
      title: 'Defaults for new sessions',
      lede: 'A default is what a new session starts as, never what it is stuck with — every launch can pick something else.',
    },
    { id: 'services', title: 'Optional', custom: 'services' },
  ],

  fields: [
    {
      id: 'mainIntent', sec: 'kind', kind: 'choice', label: 'What do you want to use this app for?',
      from: '', seed: 'open', lands: { family: 'bootstrap', key: 'kind' },
      choices: ['coding', 'work', 'personal', 'household', 'social', 'school', 'open'],
    },
    {
      id: 'routineBundle', sec: 'routines', kind: 'choice', label: 'Routine Bundles',
      from: '', seed: 'worktrees', lands: { family: 'bootstrap', key: 'routine_bundle' },
      choices: [
        { value: 'nothing', labelKey: 'setup.bundle_nothing', copyKey: 'setup.bundle_nothing_copy', label: 'Nothing', copy: 'Your agents start clean — no reading, no shared macros, no records. Just the CLI.' },
        { value: 'floor', labelKey: 'setup.bundle_floor', copyKey: 'setup.bundle_floor_copy', label: 'The floor', copy: 'Ronin still sets each agent up and keeps its birth receipt, but hands it nothing extra.' },
        { value: 'base', labelKey: 'setup.bundle_base', copyKey: 'setup.bundle_base_copy', label: 'Ronin Base', copy: 'Your agents arrive knowing the house: basic reading you can open and edit, simple macros for talking to each other, shared work records.' },
        { value: 'worktrees', labelKey: 'setup.bundle_worktrees', copyKey: 'setup.bundle_worktrees_copy', label: 'Ronin Worktrees', recommended: true, copy: 'Adds managed repositories: every agent codes at its own private desk — a git worktree — so there are no code collisions, and work is handed in deliberately.' },
        { value: 'services', labelKey: 'setup.bundle_services', copyKey: 'setup.bundle_services_copy', label: 'Services', services: true, copy: 'Adds your Services to every agent — voice, transcripts, machine care.' },
      ],
    },
    {
      id: 'campaignName', sec: 'campaign', kind: 'text', ask: false,
      label: 'Campaign name', short: 'campaign name', placeholder: 'Ronin Home',
      from: 'set.campaign.name', lands: { family: 'campaign', key: 'name' }, omit: 'blank',
      setup_lands: { family: 'bootstrap', key: 'title' },
    },
    {
      id: 'campaignDescription', sec: 'campaign', kind: 'text', ask: false,
      label: 'Description', short: 'campaign description', placeholder: 'What this campaign is for',
      from: 'set.campaign.description', lands: { family: 'campaign', key: 'description' }, omit: 'blank',
      setup_lands: { family: 'bootstrap', key: 'description' },
    },
    {
      id: 'machineName',
      sec: 'machine',
      kind: 'text',
      label: 'What do you want to call this machine?',
      short: 'this machine',
      hint: 'Yours to choose — it is what you will see in the roster. The hostname stays what it is.',
      placeholder: 'the workshop',
      from: 'set.machine.name',
      fallback: 'status.machine_name',
      lands: { family: 'machine', key: 'name' },
      omit: 'blank',
    },
    {
      // Asked nowhere on first run, editable forever in ⚙ — free text by ruling: the
      // owner knows where the box is and the box does not; detecting it would mean a
      // cloud metadata call from a page load.
      id: 'machineWhere',
      sec: 'machine',
      kind: 'text',
      ask: false,
      label: 'Where is it?',
      short: 'where it is',
      aside: 'in your own words — nothing detects this',
      placeholder: 'Hetzner fsn1 · under my desk',
      from: 'set.machine.where',
      lands: { family: 'machine', key: 'where' },
      omit: 'blank',
    },
    {
      id: 'ownerName',
      sec: 'you',
      kind: 'text',
      label: 'What should we call you?',
      short: 'your name',
      placeholder: 'Your name',
      from: 'set.owner.name',
      fallback: 'status.owner_name',
      lands: { family: 'owner', key: 'name' },
      omit: 'blank',
    },
    {
      id: 'model',
      sec: 'defaults',
      kind: 'select',
      label: 'Model',
      short: 'new sessions use',
      hint: 'Any session can be launched with another.',
      options: 'models',
      from: 'set.agents.sessions.default',
      seed: 'models:first',
      shape: 'provider-model',
      lands: { family: 'agents', key: 'sessions.default' },
      setup_lands: { family: 'bootstrap', key: 'provider_model' },
      omit: 'blank',
    },
    // NEW PROJECTS AND DESKS (owner, 2026-08-29) — what a project's RONIN_REPO says when
    // its root is added — is asked beside the Project roots on #/campaign since the SETTEI
    // audit (2026-08-30): a choice has one home. It still lands at `desks.new_project`
    // through `PUT /api/machine-settings/desks`; only the ⚙ row went.
    {
      // THE DESK PROFILE (R38): the owner's standing defaults for the surfaces they work
      // at — skin, lexicon, a new tile's RIREKI view, and the Team page's order. Asked
      // on first run and editable forever here and from the ⚙ picker; both write one leaf.
      id: 'deskProfile',
      sec: 'defaults',
      kind: 'select',
      ask: true,
      label: 'Desk profile',
      short: 'desk profile',
      hint: 'The look, the words, and how much of the terminal a new tile shows. Unset is stock.',
      options: 'desk_profiles',
      from: 'set.desk.profile',
      lands: { family: 'desk', key: 'profile' },
      setup_lands: { family: 'bootstrap', key: 'desk_profile' },
      omit: 'blank',
    },
    {
      id: 'mika',
      sec: 'defaults',
      kind: 'select',
      label: 'Which model answers Mika?',
      short: 'answers Mika',
      aside: "Mika is Ronin's own helpful assistant",
      hint: 'Mika is Ronin’s own assistant — she explains the house and runs small errands. She does not need your best model, and using one is how a helper gets expensive.',
      options: 'models',
      from: 'set.agents.jobs.mikaassist',
      seed: 'models:light',
      shape: 'provider-model',
      // Keyed by her own catalog token — the one the launcher, memory and counting
      // already share, so nothing has to translate it. `MikaAssist` was a session_job and
      // is a session_role in the `assistant` family (R34); the token never changed, so the
      // settings key did not either. `jobs.` is the stored prefix and stays: renaming it
      // would move the owner's saved value for no gain.
      lands: { family: 'agents', key: 'jobs.mikaassist' },
      omit: 'blank',
    },
    {
      // THE ONE SHAPE, RULED HERE. This row was a 5/10/15/20 picker on first run and a
      // free number in ⚙ — one setting, two shapes, exactly the drift the registry
      // exists to kill. The number won because 0 = no limit is real and a picker
      // cannot say it.
      id: 'cap',
      sec: 'defaults',
      kind: 'number',
      min: 0,
      label: 'How many agents at once',
      short: 'session max',
      hint: 'Budget about 700 MB per agent. Ronin refuses a new session past your number rather than letting the machine run out of memory. 0 = no limit.',
      note: 'status.sessions.state',
      aside: 'also on ⌂ Roster, same setting',
      from: 'set.sessions.max',
      seed: 'sessions:estimate',
      shape: 'number',
      lands: { family: 'session-max', key: 'max' },
    },
  ],

  families: {
    owner: { method: 'PATCH', route: '/api/machine-settings' },
    wanted: { method: 'PATCH', route: '/api/machine-settings' },
    machine: { method: 'PATCH', route: '/api/machine-settings' },
    agents: { method: 'PATCH', route: '/api/machine-settings' },
    bootstrap: { method: 'PATCH', route: '/api/machine-settings' },
    'session-max': { method: 'PATCH', route: '/api/machine-settings' },
  },

  /** The machine strip on the setup view — deliberately short: only the facts a later
   * answer depends on. Paths are into `observed`. A missing value drops its row. */
  facts: [
    { label: 'this box', path: 'machine.host' },
    { label: 'cores', path: 'machine.cores' },
    { label: 'memory', path: 'machine.ram_gb', suffix: ' GB' },
  ],

  /** What Ronin Services buys, and the two asks. The page renders whatever is here. */
  services: {
    features: [
      ['Live status ladders', 'Every agent shows its plan and how far through it is — on the tile and in the roster. Stop asking how it is going.'],
      ['Readable transcripts', 'Tiles become real text instead of a terminal mirror. Select it, copy it, scroll back through it — on your phone too.'],
      ['Voice', 'Talk to a session instead of typing at it, and have it read back to you.'],
      // "Stats" — the one word every surface uses (owner, 2026-08-22, KOTOBA cowork_stats).
      ['Stats', 'What every session spent, by model, over time.'],
      ['gbrain', 'A memory your agents search before they answer, and write to as they work.'],
    ],
    terms: [
      ['Share how it runs', 'How many sessions, which models, how long they ran. Never your code, and never what was typed — by you or by your agents. It is how we find out where the experience is bad and make it better for everyone.'],
      ["Don't resell it", 'Use the services for your own work, commercial or not, as much as you like. Just don’t turn around and sell the services themselves.'],
    ],
  },

  /** The names the mechanical scans check. Joined at read time by every `key_env` a
   * configured job names — typed data the registry cannot know in advance. */
  scans: {
    keys: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    tools: ['gh', 'tailscale', 'chromium'],
  },

  /** Routine selection owns gbrain enablement. Service presence is availability, not a
   * second SETTEI switch, so this registry has no gbrain requirement row. */
  requires: [] as Array<{
    leaf: string;
    applies: { kind: string; path?: string; name?: string };
    met: { kind: string; path?: string; name?: string };
    needs: string;
    how: string;
    met_by: 'mechanical' | 'owner' | 'agent';
  }>,

  /** The setup seat exists only while an install is being finished. Its work reading is
   * the setup behaviour book; there is no launch-role axis to stamp. */
  seat: {
    behaviours: ['ways:setup'],
    name: 'setup',
    prompt: 'Finish what setup still needs. Your task shelf says how: read GET /api/machine-settings at start — needed[] is your reading list, and set is what the owner already answered; never re-ask it.',
  },
};

/**
 * ONE ROW PER PROVIDER — the preferred model to use when a launch names that provider
 * and no model (owner, 2026-08-29).
 *
 * WHY THIS IS NOT A STATIC FIELD. Every other leaf in this registry is declared here
 * because the set of leaves is the house's, fixed. Providers are not: they are rows in
 * `ronin_catalogs/PROJECT_ROOTS.md`, and the whole point of that table is that adding a
 * provider is a row and never a code path. A static field per provider would put a
 * vendor's name in this file and break that promise the first time somebody added one.
 * So the SHAPE is declared here, once, and the record stamps it out per provider it
 * finds in the table — which is still one declaration, still data, still no renderer
 * that knows a field.
 *
 * They land at `agents.sessions.by_provider.<provider>` and hold a bare model name: the
 * provider is already the key, so storing it again in the value would be two places to
 * disagree. That is why `shape` is plain text here and `provider-model` on the general
 * default, which must carry both.
 *
 * A provider left unanswered is not a gap — `src/spawn.ts` falls back to that provider's
 * FIRST COLUMN in the launch table, which is why the table's column order is worth
 * keeping deliberate.
 */
export function providerModelFields(providers: string[]) {
  return providers.map((provider) => ({
    id: `model_${provider}`,
    sec: 'defaults',
    kind: 'select',
    ask: false,
    label: `Preferred ${provider} model`,
    short: `${provider} prefers`,
    hint: 'Used when a launch names this provider but not a model.',
    options: `models_for:${provider}`,
    from: `set.agents.sessions.by_provider.${provider}`,
    shape: 'text',
    lands: { family: 'agents', key: `sessions.by_provider.${provider}` },
    omit: 'blank',
  }));
}

/** One generated per-provider row, for the record's widened `schema.fields`. */
export type ProviderModelField = ReturnType<typeof providerModelFields>[number];
