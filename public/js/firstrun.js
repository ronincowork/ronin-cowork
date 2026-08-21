/* FIRST LOAD — the ordered surface a fresh install opens on. It explains, asks once,
 * and ENDS. That is the whole difference between this and the ⚙ Configuration room
 * (js/settei.js): Setup has no order and no ending, every row re-answerable forever.
 * Same record underneath, two surfaces, and neither stores anything of its own.
 *
 * IT ALSO TEACHES. A first install is the one moment someone will read a sentence about
 * what Ronin is, so each section says what the thing IS before asking for a value.
 *
 * THIS FILE IS A RENDERER, NOT A FORM. What is asked is the record's own `schema`
 * block — the registry, served with the answer (src/settei.ts) — read through the
 * vocabulary in js/settei-schema.js. Add a row to the registry and it appears here,
 * saves itself through the right family, and needs no edit in this file at all.
 * Nothing below knows what a field means.
 *
 * THE MISSING-AGENT ROW USED TO BE DEAD, and it is not any more (2026-08-20). It carried
 * a disabled checkbox because nothing installed anything, and a control that does nothing
 * is exactly the dead cell this page exists to remove. The installer exists now
 * (src/agent-install.ts), so the tick is live and the row says what pressing it does —
 * including the command it will run, before it runs.
 *
 * STILL DELIBERATELY NOT HERE: any claim about whether an agent is SIGNED IN (/api/agents
 * reports presence only); a key field (no route accepts a credential value, by design).
 */
import { request } from './request.js';
import { field, status, button } from './ui.js';
import { LIGHT, pm, getPath, initialOf, optionsOf, toRequests } from './settei-schema.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** One registry row in, one live control out. The only place a `kind` is read. */
function renderField(card, f, ctx) {
  let control;
  if (f.kind === 'select') {
    control = document.createElement('select');
    for (const o of optionsOf(f, ctx)) control.add(new Option(o.label, o.value));
  } else if (f.kind === 'number') {
    control = document.createElement('input');
    control.type = 'number';
    if (f.min !== undefined) control.min = String(f.min);
  } else {
    control = document.createElement('input');
    control.type = 'text';
    if (f.placeholder) control.placeholder = f.placeholder;
  }
  if (f.cls) control.classList.add(f.cls);

  const initial = initialOf(f, ctx);
  if (initial !== '') control.value = initial;

  const wrap = field(control, { label: f.label, sr: false });
  wrap.el.classList.add('fr-row');
  if (f.hint) wrap.say(f.hint);
  card.append(wrap.el);
  return () => control.value;
}

/**
 * Build the surface into `host`. `onDone` runs once the answers are saved, and is handed
 * `{ tiles }` — the session names this Save chose to land the person on, in the order
 * they should read: the installs first, because they are the narration (LANDING.md),
 * then the setup seat. An empty list is a real answer and means one empty tile, which is
 * the commons and its ＋ New. The caller turns that into the one-shot `?tiles=` directive;
 * how many of them fit is the grid's business, not this page's.
 */
export async function buildFirstRun(host, onDone) {
  host.className = 'fr-root';
  // `html, body { overflow: hidden }` is deliberate — the grid must never scroll behind
  // the on-screen keyboard. This surface is a document rather than a grid, so it makes
  // ITSELF the scroller instead of relaxing that rule for everyone: fixed to the
  // viewport, scrolling inside. Without this the page renders in full and cannot be
  // reached past the fold, which is how it shipped and why nobody could read it.
  host.style.cssText = 'position:fixed;inset:0;overflow-y:auto;overscroll-behavior:contain;';
  host.replaceChildren();

  const [rec, agentsRes, specsRes] = await Promise.all([
    request('/api/settei', { cache: 'no-store' }),
    request('/api/agents', { cache: 'no-store' }),
    request('/api/session-launch-specs'),
  ]);
  const record = rec.ok ? (rec.data ?? {}) : {};
  const schema = record.schema ?? { sections: [], fields: [], facts: [], families: {}, services: { features: [], terms: [] } };
  const agents = agentsRes.ok && Array.isArray(agentsRes.data) ? agentsRes.data : [];
  const specs = specsRes.ok && Array.isArray(specsRes.data) ? specsRes.data : [];
  const machine = record.observed?.machine ?? {};

  // Only what the box can actually run reaches a model picker: a Codex-only machine is
  // never offered an Anthropic row.
  const runnable = specs.filter((s) => {
    const first = String(s.cmd || '').split(/\s+/)[0];
    return agents.some((a) => a.cmd === first && a.installed);
  });
  const ctx = {
    record,
    home: machine.home ?? '',
    modelOpts: runnable.map((s) => ({ label: s.provider + ' · ' + s.model, value: pm(s) })),
    light: runnable.find((s) => LIGHT.test(s.model)) ?? runnable[runnable.length - 1],
    sessionEstimate: Math.max(1, Math.floor(((Number(machine.ram_gb || 0) * 1024) - Math.max(Number(machine.ram_gb || 0) * 256, 2048)) / 700)),
  };

  const head = el('div', 'fr-mast');
  const mark = el('div', 'fr-mark', 'RONIN COWORK');
  head.append(mark, el('p', 'fr-live', 'YOU’RE CONNECTED — Ronin is live on your machine.'));
  head.append(el('h1', 'fr-title', 'Make this coworkspace yours.'));
  head.append(el('p', 'fr-sub', 'Tell Ronin Cowork who you are, where your work lives, and which agents you want here. You can change all of this later.'));
  const proof = el('div', 'fr-proof');
  proof.append(el('span', 'fr-proof-dot'), document.createTextNode(` Running privately on ${machine.host || 'this machine'}`));
  head.append(proof);
  host.append(head);

  const layout = el('div', 'fr-layout');
  const form = el('div', 'fr-form');
  const reviewShell = el('aside', 'fr-review-shell');
  reviewShell.append(el('div', 'fr-stage fr-review-stage', 'When you save'));
  const review = el('div', 'fr-review');
  review.append(el('p', 'fr-review-intro', 'Review what RoninCoWork will do.'));
  const reviewList = el('dl', 'fr-review-list');
  review.append(reviewList);
  reviewShell.append(review);
  layout.append(form, reviewShell);
  host.append(layout);

  const read = {}; // id -> () => value
  /** agent id -> its live checkbox. Absent agents only: a present one's tick is a fact. */
  const wantAgents = new Map();
  let wantServices = null;
  let serviceEmail = null;
  let wantGbrain = null;

  const stage = (small, text, cls = '') => {
    const n = el('div', `fr-stage ${cls}`);
    n.append(el('small', null, small), document.createTextNode(' ' + text));
    form.append(n);
  };
  stage('FIRST', 'Set up your coworkspace');

  const sectionOrder = ['machine', 'you', 'agents', 'defaults', 'services', 'project'];
  const sections = [...schema.sections].sort((a, b) => sectionOrder.indexOf(a.id) - sectionOrder.indexOf(b.id));
  let sectionNumber = 0;

  for (const sec of sections) {
    if (sec.id === 'project') stage('THEN', 'Start your first project', 'fr-project-stage');
    sectionNumber++;
    const s = el('details', 'fr-sec');
    s.open = true;
    const summary = el('summary', 'fr-sec-head');
    const titles = { machine: 'Name your coworkspace', you: 'What should Ronin call you?', agents: 'Your agents', defaults: 'How new sessions should start', services: 'Ronin Services · Optional', project: 'What would you like to work on first?' };
    const ledes = {
      machine: 'Choose the name you’ll recognize in your roster. The hostname does not change.',
      you: 'Mika and your working agents use this name.',
      agents: 'Agents already found here are ready. Select any others you want RoninCoWork to add.',
      defaults: 'These are starting choices, never restrictions. Every launch can choose something else.',
      services: 'Extra capabilities for your coworkspace. RoninCoWork works fully without them.',
      project: 'Start with one project and its folder. You can add more whenever you need them.',
    };
    summary.append(el('span', 'fr-num', String(sectionNumber)), el('span', 'fr-head-copy'));
    summary.lastChild.append(el('h2', 'fr-h', titles[sec.id] || sec.title), el('p', 'fr-lede', ledes[sec.id] || sec.lede || ''));
    s.append(summary);
    const card = el('div', 'fr-card');
    s.append(card);
    form.append(s);

    if (sec.facts) {
      const rows = schema.facts
        .map((fa) => [fa.label, getPath(record.observed, fa.path), fa.suffix ?? ''])
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v, suf]) => [k, String(v) + suf]);
      if (rows.length) {
        const dl = el('dl', 'fr-facts');
        for (const [k, v] of rows) {
          const cell = el('div', 'fr-fact');
          cell.append(el('dt', null, k), el('dd', null, String(v)));
          dl.append(cell);
        }
        card.append(dl);
      }
    }

    if (sec.custom === 'agents') {
      const table = el('div', 'fr-agents');
      const hdr = el('div', 'fr-agent-head');
      for (const h of ['', 'Agent', 'When you save', 'Status']) hdr.append(el('span', null, h));
      table.append(hdr);
      for (const a of agents) {
        const row = el('div', 'fr-agent');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.id = 'fr-agent-' + a.id;
        const name = el('div', 'fr-agent-name');
        const lab = el('label', null, a.label);
        lab.htmlFor = box.id;
        name.append(lab);
        let what;
        if (a.installed) {
          box.checked = true;
          box.disabled = true; // a fact, not a control — reality unticks it, not you
          box.title = 'installed';
          what = 'Nothing—already ready.';
        } else if (a.get) {
          // SAY THE COMMAND, BEFORE IT RUNS. It shows again in the tile, because the tile
          // IS the terminal it runs in — a vendor installer is somebody else's code and
          // being able to read it first is the whole mitigation.
          box.title = 'not installed — tick it and Ronin installs it';
          wantAgents.set(a.id, box);
          what = 'Install if selected.';
        } else {
          // NO COMMAND, SO NO CONTROL. Two ways to get here and one honest row for both:
          // an agent Ronin has parked (`parked` says why, in the words a person reads —
          // src/agents.ts), or an operator that predates the install line altogether. A
          // tick that cannot deliver is worse than a row that admits it.
          box.disabled = true;
          what = a.parked || 'Install manually and RoninCoWork will detect it.';
        }
        const tag = el('span', `fr-tag ${a.installed ? 'on' : a.get ? 'add' : ''}`, a.installed ? 'Installed' : a.get ? 'Available to add' : 'Manual install');
        row.append(box, name, el('div', 'fr-agent-what', what), tag);
        if (!a.installed && a.get) {
          const more = el('details', 'fr-agent-more');
          more.append(el('summary', null, 'Installation details'), el('div', 'fr-detail', `${a.from}. RoninCoWork will run ${a.get}.`));
          row.append(more);
        }
        table.append(row);
      }
      card.append(table);
      if (!agents.length) card.append(el('p', 'fr-lede', 'Could not read this machine for agents. You can set this later from ⚙ Configuration.'));
    }

    if (sec.custom === 'services') {
      const sell = el('div', 'fr-sell');
      sell.append(el('h3', null, 'Ronin Services'), el('p', null, "Five things your coworkspace can't do on its own."));
      card.append(sell);
      for (const [n, w] of schema.services.features) {
        const f = el('div', 'fr-feat');
        f.append(el('b', null, n), el('span', null, w));
        card.append(f);
      }
      const dealRow = el('div', 'fr-deal');
      wantServices = document.createElement('input');
      wantServices.type = 'checkbox';
      wantServices.id = 'fr-services';
      const wantLab = el('label', 'fr-deal-lab');
      wantLab.htmlFor = wantServices.id;
      wantLab.append(el('span', 'fr-deal-name', 'Add Ronin Services'), el('span', 'fr-deal-sub', 'A separate download, on separate terms.'));
      dealRow.append(wantServices, wantLab);
      card.append(dealRow);

      const terms = el('div', 'fr-terms');
      terms.hidden = true;
      terms.append(el('p', 'fr-lede', 'Ronin itself is open source — Apache-2.0, free, yours, with or without any of this. The services licence asks two things in return.'));
      for (const [n, w] of schema.services.terms) {
        const a = el('div', 'fr-ask');
        a.append(el('b', null, n), el('span', null, w));
        terms.append(a);
      }
      serviceEmail = document.createElement('input');
      serviceEmail.type = 'email';
      serviceEmail.placeholder = 'you@example.com';
      const ef = field(serviceEmail, { label: 'Where should we send the confirmation?', sr: false });
      ef.el.classList.add('fr-row');
      ef.say('1. Ronin emails a link → 2. You confirm the terms → 3. Services install.');
      terms.append(ef.el);
      wantGbrain = document.createElement('input');
      wantGbrain.type = 'checkbox';
      wantGbrain.id = 'fr-gbrain';
      const gb = el('label', 'fr-gbrain');
      gb.htmlFor = wantGbrain.id;
      const gbCopy = el('span');
      gbCopy.append(el('b', null, 'Use gbrain memory '));
      const gbLink = el('a', null, 'Garry Tan’s open-source agent memory');
      gbLink.href = 'https://github.com/garrytan/gbrain'; gbLink.target = '_blank'; gbLink.rel = 'noreferrer';
      gbCopy.append(gbLink, document.createTextNode('. Agents search it before answering and add to it as they work. Ronin provides a local embeddings model that uses about 0.3 GB.'));
      gb.append(wantGbrain, gbCopy);
      terms.append(gb);
      card.append(terms);
      wantServices.addEventListener('change', () => {
        terms.hidden = !wantServices.checked;
        if (!wantServices.checked) wantGbrain.checked = false;
        if (wantServices.checked) serviceEmail.focus();
      });
    }

    // `ask: false` marks a leaf the ⚙ room edits but first run does not ask.
    for (const f of schema.fields.filter((x) => x.sec === sec.id && x.ask !== false)) read[f.id] = renderField(card, f, ctx);
  }

  const reviewRows = {};
  const addReview = (id, label) => {
    const row = el('div', 'fr-review-row');
    row.append(el('dt', null, label));
    const value = el('dd'); row.append(value); reviewList.append(row); reviewRows[id] = value;
  };
  for (const [id, label] of [['machineName','Coworkspace name'],['ownerName','Ronin will call you'],['agents','Ready agents'],['add','RoninCoWork will install'],['model','New sessions start with'],['mika','Mika uses'],['cap','Maximum agent sessions'],['services','Ronin Services'],['gbrain','gbrain memory'],['projName','First project'],['projDir','Working folder'],['projRemit','What are you working on?']]) addReview(id, label);
  const refreshReview = () => {
    const val = (id) => read[id]?.() || '';
    reviewRows.machineName.textContent = val('machineName') || machine.host || 'Use the hostname';
    reviewRows.ownerName.textContent = val('ownerName') || 'Use the machine user';
    reviewRows.agents.textContent = agents.filter((a) => a.installed).map((a) => a.label).join(', ') || 'None detected';
    reviewRows.add.textContent = [...wantAgents].filter(([, b]) => b.checked).map(([id]) => agents.find((a) => a.id === id)?.label || id).join(', ') || 'Nothing';
    const modelText = (id) => { const v = val(id); return ctx.modelOpts.find((o) => o.value === v)?.label || 'No runnable model detected'; };
    reviewRows.model.textContent = modelText('model'); reviewRows.mika.textContent = modelText('mika');
    reviewRows.cap.textContent = val('cap') === '0' ? 'No limit' : (val('cap') ? `${val('cap')} sessions · about 700 MB each` : 'No limit');
    reviewRows.services.textContent = wantServices?.checked ? `Begin activation${serviceEmail.value.trim() ? ` for ${serviceEmail.value.trim()}` : ' after an email is entered'}` : 'Not selected — nothing will be sent';
    reviewRows.gbrain.textContent = wantServices?.checked && wantGbrain?.checked ? 'Local memory and embeddings · about 0.3 GB' : 'Not selected';
    reviewRows.projName.textContent = val('projName') || 'Not named yet'; reviewRows.projDir.textContent = val('projDir') || 'Not chosen yet'; reviewRows.projRemit.textContent = val('projRemit') || 'No description yet';
  };
  layout.addEventListener('input', refreshReview); layout.addEventListener('change', refreshReview); refreshReview();

  const foot = el('div', 'fr-foot');
  const line = status('fr-status');
  const save = button('Save and open RoninCoWork', {
    cls: 'fr-go',
    onClick: async () => {
      save.disabled = true;
      line.say('Saving…', 'busy');
      const values = Object.fromEntries(Object.entries(read).map(([id, get]) => [id, get()]));
      const problems = [];
      let installNote = '';
      /** The tiles this Save lands on, in reading order. */
      const landOn = [];

      for (const req of toRequests(schema, values)) {
        const r = await request(req.route, { method: req.method, json: req.json });
        // A project handle already taken is not worth blocking on: the floor root exists
        // on every box, and the owner can rename from ▣ Roots.
        if (!r.ok && r.status !== 409) problems.push(req.route + ': ' + (r.message || 'failed'));
      }
      if (wantServices?.checked) {
        if (!serviceEmail.value.trim() || !serviceEmail.checkValidity()) {
          problems.push('services: enter a valid email for the confirmation');
        }
      }
      if (wantServices?.checked && !problems.length) {
        const r = await request('/api/settei/services', {
          method: 'PUT',
          json: { email: serviceEmail.value.trim(), terms: 'accepted-pending-email' },
        });
        if (!r.ok) problems.push('services: ' + (r.message || 'failed'));
      }
      {
        const r = await request('/api/settei/gbrain', { method: 'PUT', json: { enabled: Boolean(wantServices?.checked && wantGbrain?.checked) } });
        if (!r.ok) problems.push('gbrain: ' + (r.message || 'failed'));
      }

      if (problems.length) {
        line.say(problems[0], 'bad');
        save.disabled = false;
        return;
      }

      // FIRST RUN IS FINISHED — clear the birth flag now, after the writes landed and
      // before the handoff. Only the surface knows the questions were answered, and a
      // session that fails to start below must not leave the box pending forever.
      await request('/api/settei/setup', { method: 'PUT' });

      // THE TICKED AGENTS — intent stored, then installed, in that order and for that
      // reason. The want is the intent and it PERSISTS (docs/wanted-needed.md), so an
      // install that fails leaves the thing on the needed list where ⚙ still offers it;
      // the dispatch is only the attempt. Both happen BEFORE the early return below,
      // because a box with no agent at all is exactly the box that ticked some.
      //
      // DISPATCHED AT SAVE, IMMEDIATELY AND UNBIDDEN: the tick was the permission, and
      // asking again at the landing would be asking twice. Nothing waits for it — the
      // installs run in their own tiles while the coworkspace opens.
      const picks = [...wantAgents].filter(([, box]) => box.checked).map(([id]) => id);
      if (picks.length) {
        const already = (record.set?.wanted ?? []).filter((w) => !(w.kind === 'agent' && picks.includes(w.name)));
        await request('/api/settei/wanted', {
          method: 'PUT',
          json: { wanted: [...already, ...picks.map((id) => ({ kind: 'agent', name: id }))] },
        });
        const r = await request('/api/install', {
          method: 'POST',
          json: { items: picks.map((id) => ({ kind: 'agent', name: id })) },
        });
        // THE TILES ARE THE NARRATION. What came back is what actually STARTED, so the
        // landing names only sessions that exist — never what we hoped would.
        if (r.ok && Array.isArray(r.data)) landOn.push(...r.data.filter((x) => x.session).map((x) => x.session));
        // A dispatch that would not start must not strand a finished setup either: the
        // want is stored, ⚙ still offers it, and the workspace opens regardless. It is a
        // clause on the way out, never a wall — nothing gates someone starting work.
        if (!r.ok) installNote = ' The installs did not start — tick them again from ⚙ Configuration.';
      }

      // SETUP IS COMPLETE RIGHT HERE. The page is mechanical and needs no agent — a box
      // with no CLI on it is finished, not failing, and nothing on screen may suggest
      // otherwise. The handoff below is a bonus for a box that already has an agent:
      // the first session starts with a brief instead of the owner typing context.
      if (!ctx.modelOpts.length) {
        line.say('Saved. Opening your coworkspace…' + installNote, installNote ? 'bad' : 'ok');
        onDone?.({ tiles: landOn });
        return;
      }

      line.say('Opening your first session…', 'busy');
      // THE POINTER, NOT THE BRIEF. Nothing is composed at Save: the seat's own shelf
      // (ronin_session_boot/job/Atarashi/) has it read GET /api/settei at start, so a
      // session born now and one born three weeks from now read the same fresh truth,
      // and nothing here can go stale or be lost. The seat itself is the registry's.
      const born = await request('/api/launch', {
        method: 'POST',
        json: {
          session_job: schema.seat.job,
          name: schema.seat.name,
          project_root: String(values.projName || '').trim().toLowerCase() || undefined,
          prompt: schema.seat.prompt,
        },
      });
      // A session that would not start must not strand a finished setup: everything is
      // already saved, so say so and let them into the workspace.
      // The seat's OWN name, not the one we asked for: /api/launch resolves collisions,
      // and a tile named after a session that does not exist is an empty tile.
      if (born.ok && born.data?.name) landOn.push(born.data.name);
      line.say(
        (born.ok ? 'Saved. Your first session is opening.' : 'Saved — but the first session did not start. Open one from ＋ New when you are in.') + installNote,
        born.ok && !installNote ? 'ok' : 'bad',
      );
      onDone?.({ tiles: landOn });
    },
  });
  foot.append(save, el('span', 'fr-note', 'Your coworkspace opens straight away. Anything still to be fetched carries on in the background.'));
  review.append(foot, line.el);
}
