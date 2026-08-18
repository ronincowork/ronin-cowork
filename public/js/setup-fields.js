/* THE FIELD MANIFEST — what first load asks and what ⚙ Setup shows, declared once.
 *
 * WHY THIS EXISTS. Adding "which model answers Mika" cost five edits in four places:
 * make the control, place it, give it a label and a hint, remember it in a variable, and
 * then find the right route and the right body shape down in save(). That is a design
 * fault, not a workload — a config surface whose whole job is to grow one row at a time
 * must make one row cheap. The owner's words: it should not be set in stone.
 *
 * SO A FIELD IS A ROW IN `FIELDS` AND NOTHING ELSE. Add the object; both surfaces pick it
 * up. No renderer to touch, no save path to extend, no variable to thread.
 *
 * The two surfaces read the same manifest and do different things with it — first load
 * (js/firstrun.js) asks in order and ends; the ⚙ Setup room (js/settei.js) shows current
 * values and never ends. Same record, same fields, two readings. That is the seam made
 * real in code rather than restated in two places that drift.
 *
 * A FIELD DECLARES:
 *   id           unique, and the variable name you would have written
 *   sec          which section it appears in (see SECTIONS)
 *   kind         'text' | 'select' | 'check'
 *   label, hint  what the person reads. The hint is teaching, not decoration.
 *   options(ctx) select only — [{label, value}]
 *   initial(ctx) the value to start on, from the record or the box
 *   route        where the answer goes. Fields sharing a route are sent as ONE body.
 *   method       default 'PUT'
 *   fold(body,v) merge this value into that route's body
 *   omitIf(v)    true = leave it out of the body entirely
 *
 * `ctx` carries what the surfaces already fetched: {record, agents, specs, modelOpts,
 * light, home}. A new field that needs a new fact adds it there, once.
 */

export const SECTIONS = [
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
];

/** A provider·model select value is one string so it survives a plain <option>. */
export const pm = (s) => s.provider + '\t' + s.model;
const splitPm = (v) => String(v || '').split('\t');

/** A light tier by name, else the LAST column — the launch table puts a provider's
 * richest default first, so the cheapest thing on offer is at the other end. */
export const LIGHT = /haiku|mini|flash|small|lite/i;

export const FIELDS = [
  {
    id: 'machineName',
    sec: 'machine',
    kind: 'text',
    label: 'What do you want to call this machine?',
    hint: 'Yours to choose — it is what you will see in the roster. The hostname stays what it is.',
    placeholder: 'the workshop',
    initial: (ctx) => String(ctx.record?.set?.machine?.name ?? ''),
    route: '/api/settei/machine',
    fold: (b, v) => {
      b.name = v.trim();
    },
    omitIf: (v) => !v.trim(),
  },
  {
    id: 'ownerName',
    sec: 'you',
    kind: 'text',
    label: 'What should we call you?',
    placeholder: 'Your name',
    initial: (ctx) => String(ctx.record?.set?.owner?.name ?? ''),
    route: '/api/settei/owner',
    fold: (b, v) => {
      b.name = v.trim();
    },
    omitIf: (v) => !v.trim(),
  },
  {
    id: 'projName',
    sec: 'project',
    kind: 'text',
    label: 'Name',
    hint: 'Short, lowercase. You will type it when you point an agent somewhere.',
    placeholder: 'ronin',
    route: '/api/project-roots',
    method: 'POST',
    fold: (b, v) => {
      b.name = v.trim().toLowerCase();
    },
    omitIf: (v) => !v.trim(),
  },
  {
    id: 'projRemit',
    sec: 'project',
    kind: 'text',
    label: 'What is it for?',
    hint: 'One line. Agents read it to know what they have been put in front of.',
    placeholder: 'The browser grid of live tmux sessions',
    route: '/api/project-roots',
    method: 'POST',
    fold: (b, v) => {
      b.remit = v.trim();
    },
  },
  {
    id: 'projDir',
    sec: 'project',
    kind: 'text',
    cls: 'fr-path',
    label: 'Where does it live?',
    placeholder: 'project directory',
    initial: (ctx) => String(ctx.home ?? ''),
    route: '/api/project-roots',
    method: 'POST',
    fold: (b, v) => {
      b.dir = v.trim();
    },
    omitIf: (v) => !v.trim(),
  },
  {
    id: 'projNotes',
    sec: 'project',
    kind: 'textarea',
    label: 'Anything else we should know about it?',
    hint: 'In your own words. A repository that still needs cloning, where you want it, what you are trying to build, what is half-finished — this is not stored as a setting; it is handed to your first session, who can actually ask you about it.',
    placeholder: 'It is a private repo I have not cloned yet — github.com/me/thing',
    // No route on purpose: it is a briefing, not a setting.
  },
  {
    id: 'model',
    sec: 'defaults',
    kind: 'select',
    label: 'Model',
    hint: 'Any session can be launched with another.',
    options: (ctx) => ctx.modelOpts,
    initial: (ctx) => (ctx.modelOpts[0]?.value ?? ''),
    route: '/api/settei/agents',
    fold: (b, v) => {
      const [provider, model] = splitPm(v);
      b.sessions = { default: { provider, model } };
      // The project root the same page creates should launch on the same thing.
      b.__default = { provider, model };
    },
    omitIf: (v) => !splitPm(v)[1],
  },
  {
    id: 'mika',
    sec: 'defaults',
    kind: 'select',
    label: 'Which model answers Mika?',
    hint: 'Mika is Ronin’s own assistant — she explains the house and runs small errands. She does not need your best model, and using one is how a helper gets expensive.',
    options: (ctx) => ctx.modelOpts,
    initial: (ctx) => (ctx.light ? pm(ctx.light) : ''),
    route: '/api/settei/agents',
    fold: (b, v) => {
      const [provider, model] = splitPm(v);
      // Keyed by the session_job's own name — the token the launcher, memory and
      // counting already share, so nothing has to translate it.
      b.jobs = { ...(b.jobs ?? {}), MikaAssist: { provider, model } };
    },
    omitIf: (v) => !splitPm(v)[1],
  },
  {
    id: 'cap',
    sec: 'defaults',
    kind: 'select',
    label: 'How many agents at once',
    hint: 'Budget about 700 MB per agent. Ronin refuses a new session past your number rather than letting the machine run out of memory.',
    options: () => [5, 10, 15, 20].map((n) => ({ label: String(n), value: String(n) })),
    initial: (ctx) => String(ctx.record?.set?.sessions?.max ?? 10),
    route: '/api/session-max',
    fold: (b, v) => {
      b.max = Number(v);
    },
  },
];

/** The machine strip — DELIBERATELY SHORT. An inventory belongs to someone choosing a
 * box; this person already has one and is only adding Ronin to it, so the only facts
 * that earn a place are the ones a later answer depends on: cores and memory are what
 * the session cap is reasoned from, and the name is how they will recognise the box in
 * the roster. Everything else the box knows lives in the ⚙ Setup room, which is where
 * you go to ask rather than to be told.
 *
 * Keys are the record's own (`observed.machine`): host · user · kind · hypervisor ·
 * provider · product · cores · ram_gb · arch. A row whose value is missing is dropped
 * rather than rendered blank. Adding one is a row here. */
export const FACTS = [
  ['this box', (m) => m.host],
  ['cores', (m) => m.cores],
  ['memory', (m) => (m.ram_gb ? m.ram_gb + ' GB' : null)],
];

/** What Ronin Services buys. One row per thing; the page renders whatever is here. */
export const SERVICE_FEATURES = [
  ['Live status ladders', 'Every agent shows its plan and how far through it is — on the tile and in the roster. Stop asking how it is going.'],
  ['Readable transcripts', 'Tiles become real text instead of a terminal mirror. Select it, copy it, scroll back through it — on your phone too.'],
  ['Voice', 'Talk to a session instead of typing at it, and have it read back to you.'],
  ['Usage statistics', 'What every session spent, by model, over time.'],
  ['gbrain', 'A memory your agents search before they answer, and write to as they work.'],
];

/** The two asks. Apache-2.0 stays the headline; these are what the services licence adds. */
export const SERVICE_TERMS = [
  ['Share how it runs', 'How many sessions, which models, how long they ran. Never your code, and never what was typed — by you or by your agents. It is how we find out where the experience is bad and make it better for everyone.'],
  ["Don't resell it", 'Use the services for your own work, commercial or not, as much as you like. Just don’t turn around and sell the services themselves.'],
];

/**
 * A field with NO `route` is still asked and still read — it is simply never sent as
 * configuration. That is the free-text bundle: what the owner says about their project
 * in their own words, which has no shape a form could store and every reason to reach a
 * person who can ask about it.
 *
 * Group answers into one body per route and hand back what to send. Fields sharing a
 * route are merged, so a route is called ONCE however many fields feed it — which is
 * what makes adding a field to an existing route free.
 */
export function toRequests(values, ctx) {
  const byRoute = new Map();
  for (const f of FIELDS) {
    const v = values[f.id];
    if (!f.route) continue; // briefed, not stored
    if (v === undefined || (f.omitIf && f.omitIf(v))) continue;
    const key = f.route;
    if (!byRoute.has(key)) byRoute.set(key, { route: f.route, method: f.method || 'PUT', body: {} });
    f.fold(byRoute.get(key).body, v, ctx);
  }
  // `__default` is a note between fields, never a wire field.
  const out = [...byRoute.values()];
  const agents = out.find((r) => r.route === '/api/settei/agents');
  const dflt = agents?.body.__default;
  if (agents) delete agents.body.__default;
  const proj = out.find((r) => r.route === '/api/project-roots');
  if (proj && dflt) Object.assign(proj.body, dflt);
  return out;
}
