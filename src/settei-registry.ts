/**
 * THE SETTEI REGISTRY — pure data, served with every answer as `schema`.
 *
 * Split from src/settei.ts by the line ceiling and nothing else: this is still the
 * ONE declaration, the assembly still reads it, and no other file may know a field.
 * Nothing in this file executes — a value here is a datum a renderer interprets
 * through public/js/settei-schema.js, never a code path.
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
 * The scan-name lists live here too (`scans`), because a name worth scanning is a
 * name the registry mentions — plus every `key_env` a configured job names, which is
 * typed data and joins at read time. No other file may carry a list of these names.
 *
 * `families` maps a write family to its route — most through the one write door
 * (`PUT /api/settei/:family`); the exceptions say where the leaf actually lives (the
 * cap's shared route with ⌂ Roster, the catalogs store's own POST).
 */
export const SETTEI_SCHEMA = {
  sections: [
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
    {
      id: 'project',
      title: 'Your first project',
      lede: 'A project is a directory Ronin is allowed to work in, plus a line saying what it is for. Every session carries two things — where it works and what it is doing — and this is the first half. Add as many as you like later from ▣ Roots.',
    },
    {
      id: 'agents',
      title: 'Agents',
      lede: 'Ronin is the room your agents work in — a co-working space for the CLIs you already use, each in its own terminal, all on one screen. So the only question here is what is on the machine: something present asks whether you want it in the room, something absent tells you how to get it. Ronin looks for the command and nothing else — signing in happens inside the agent itself, the first time you use it.',
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
      id: 'projName',
      sec: 'project',
      kind: 'text',
      label: 'Name',
      hint: 'Short, lowercase. You will type it when you point an agent somewhere.',
      placeholder: 'ronin',
      norm: 'lower',
      lands: { family: 'project', key: 'name' },
      omit: 'blank',
    },
    {
      id: 'projRemit',
      sec: 'project',
      kind: 'text',
      label: 'What is it for?',
      hint: 'One line. Agents read it to know what they have been put in front of.',
      placeholder: 'The browser grid of live tmux sessions',
      lands: { family: 'project', key: 'remit' },
    },
    {
      id: 'projDir',
      sec: 'project',
      kind: 'text',
      cls: 'fr-path',
      label: 'Where does it live?',
      placeholder: 'project directory',
      seed: 'home',
      lands: { family: 'project', key: 'dir' },
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
      from: 'set.agents.jobs.MikaAssist',
      seed: 'models:light',
      shape: 'provider-model',
      // Keyed by the session_job's own name — the token the launcher, memory and
      // counting already share, so nothing has to translate it.
      lands: { family: 'agents', key: 'jobs.MikaAssist' },
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
      shape: 'number',
      lands: { family: 'session-max', key: 'max' },
    },
  ],

  families: {
    owner: { method: 'PUT', route: '/api/settei/owner' },
    wanted: { method: 'PUT', route: '/api/settei/wanted' },
    machine: { method: 'PUT', route: '/api/settei/machine' },
    agents: { method: 'PUT', route: '/api/settei/agents' },
    'session-max': { method: 'PUT', route: '/api/session-max' },
    project: { method: 'POST', route: '/api/project-roots' },
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
      ['Usage statistics', 'What every session spent, by model, over time.'],
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

  /** What a choice still needs — judged against the record per read (the `needed[]`
   * family), met items do not exist. Seed: services finish over the email link, alone. */
  requires: [
    {
      leaf: 'services',
      applies: { kind: 'set', path: 'services.email' },
      met: { kind: 'set', path: 'services.verified' },
      needs: 'the verified email',
      how: 'click the link in the services email, paste the code',
    },
    {
      leaf: 'gbrain',
      applies: { kind: 'set', path: 'gbrain.enabled' },
      met: { kind: 'service', name: 'gbrain' },
      needs: 'the gbrain service installed',
      how: 'the toggle is already on — install Ronin Services and gbrain registers itself',
    },
  ],

  /** The seat the reading list is handed to. Every surface launches exactly this —
   * the brief itself lives on the seat's shelf (ronin_session_boot/job/Atarashi/) and
   * is READ AT SEAT START, never composed at Save: a session born now and one born
   * three weeks from now read the same fresh truth. */
  seat: {
    job: 'Atarashi',
    name: 'setup',
    prompt: 'Finish what setup still needs. Your job shelf says how: read GET /api/settei at start — needed[] is your reading list, and set is what the owner already answered; never re-ask it.',
  },
};
