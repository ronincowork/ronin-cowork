/* FIRST LOAD — the ordered surface a fresh install opens on. It explains, asks once,
 * and ENDS. That is the whole difference between this and the ⚙ Setup room
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
 * DELIBERATELY NOT HERE: an "install it" button for a missing agent (no installer
 * exists yet, and a control that does nothing is the dead cell this page removes); any
 * claim about whether an agent is SIGNED IN (/api/agents reports presence only); a key
 * field (no route accepts a credential value, by design).
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

/** Build the surface into `host`. `onDone` runs once the answers are saved. */
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
  };

  const head = el('div', 'fr-mast');
  const mark = el('div', 'fr-mark');
  mark.append(el('span', 'fr-torii', '⛩'), document.createTextNode(' ronin'));
  head.append(mark, el('h1', 'fr-title', 'Set up your coworkspace'));
  head.append(el('p', 'fr-sub', "You've downloaded Ronin onto this machine. A few answers and it's yours — all of them changeable later."));
  host.append(head);

  const read = {}; // id -> () => value
  let wantServices = null;
  let serviceEmail = null;

  for (const sec of schema.sections) {
    const s = el('section', 'fr-sec');
    s.append(el('h2', 'fr-h', sec.title));
    if (sec.lede) s.append(el('p', 'fr-lede', sec.lede));
    const card = el('div', 'fr-card');
    s.append(card);
    host.append(s);

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
      for (const a of agents) {
        const row = el('div', 'fr-agent');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = a.installed;
        box.disabled = !a.installed; // nothing installs it yet, so nothing pretends to
        box.id = 'fr-agent-' + a.id;
        const body = el('div', 'fr-agent-body');
        const name = el('div', 'fr-agent-name');
        const lab = el('label', null, a.label);
        lab.htmlFor = box.id;
        name.append(lab, el('span', a.installed ? 'fr-tag on' : 'fr-tag off', a.installed ? 'installed' : 'not installed'));
        body.append(name, el('div', 'fr-agent-what', a.installed ? 'Found at ' + a.path : a.from + '. Not on this machine yet — install it and it appears here.'));
        row.append(box, body);
        card.append(row);
      }
      if (!agents.length) card.append(el('p', 'fr-lede', 'Could not read this machine for agents. You can set this later from ⚙ Setup.'));
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
      ef.say('We email you a link. Confirming it is how you accept the two above, and the services install themselves after.');
      terms.append(ef.el);
      card.append(terms);
      wantServices.addEventListener('change', () => {
        terms.hidden = !wantServices.checked;
        if (wantServices.checked) serviceEmail.focus();
      });
    }

    // `ask: false` marks a leaf the ⚙ room edits but first run does not ask.
    for (const f of schema.fields.filter((x) => x.sec === sec.id && x.ask !== false)) read[f.id] = renderField(card, f, ctx);
  }

  const foot = el('div', 'fr-foot');
  const line = status('fr-status');
  const save = button('Save and open Ronin', {
    cls: 'fr-go',
    onClick: async () => {
      save.disabled = true;
      line.say('Saving…', 'busy');
      const values = Object.fromEntries(Object.entries(read).map(([id, get]) => [id, get()]));
      const problems = [];

      for (const req of toRequests(schema, values)) {
        const r = await request(req.route, { method: req.method, json: req.json });
        // A project handle already taken is not worth blocking on: the floor root exists
        // on every box, and the owner can rename from ▣ Roots.
        if (!r.ok && r.status !== 409) problems.push(req.route + ': ' + (r.message || 'failed'));
      }
      if (wantServices?.checked) {
        const r = await request('/api/settei/services', {
          method: 'PUT',
          json: { email: serviceEmail.value.trim(), terms: 'accepted-pending-email' },
        });
        if (!r.ok) problems.push('services: ' + (r.message || 'failed'));
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

      // SETUP IS COMPLETE RIGHT HERE. The page is mechanical and needs no agent — a box
      // with no CLI on it is finished, not failing, and nothing on screen may suggest
      // otherwise. The handoff below is a bonus for a box that already has an agent:
      // the first session starts with a brief instead of the owner typing context.
      if (!ctx.modelOpts.length) {
        line.say('Saved. Opening your coworkspace…', 'ok');
        onDone?.();
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
      line.say(born.ok ? 'Saved. Your first session is opening.' : 'Saved — but the first session did not start. Open one from ＋ New when you are in.', born.ok ? 'ok' : 'bad');
      onDone?.();
    },
  });
  foot.append(save, el('span', 'fr-note', 'Your coworkspace opens straight away. Anything still to be fetched carries on in the background.'));
  host.append(foot, line.el);
}
