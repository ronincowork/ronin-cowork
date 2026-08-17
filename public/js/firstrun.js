/* FIRST LOAD — the ordered surface a fresh install opens on. It explains, asks once,
 * and ENDS. That is the whole difference between this and the ⚙ Setup room
 * (js/settei.js): Setup has no order and no ending, every row re-answerable forever,
 * and it is what the owner opens six months later to ask what this box is set to.
 * Same record underneath, two surfaces, and neither stores anything of its own.
 *
 * IT ALSO TEACHES. A first install is the one moment someone will read a sentence about
 * what Ronin is, so each section says what the thing IS before it asks for a value. A
 * form that only collects leaves the owner with a configured box they cannot reason
 * about.
 *
 * NOTHING HERE IS A NEW STORE. Every answer is written through a route that already
 * exists — owner, machine, agents, session max, project roots, services.
 *
 * DELIBERATELY NOT HERE: an "install it" button for a missing agent (no installer
 * exists yet, and a control that does nothing is the dead cell this page removes); any
 * claim about whether an agent is SIGNED IN (/api/agents reports presence only — the
 * owner's accounts are not ours to inspect); a key field (no route accepts a credential
 * value, by design).
 */
import { request } from './request.js';
import { field, status, button } from './ui.js';

/** The whole condition: nobody has said who they are. One read, no flag file — and
 * finishing the page is what makes it stop appearing, which is what "asked once" means. */
export async function needsFirstRun() {
  const r = await request('/api/settei', { cache: 'no-store' });
  if (!r.ok) return false; // a box that cannot answer is not a box to interrogate
  return !String(r.data?.set?.owner?.name ?? '').trim();
}

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

function section(host, title, lede) {
  const s = el('section', 'fr-sec');
  s.append(el('h2', 'fr-h', title));
  if (lede) s.append(el('p', 'fr-lede', lede));
  const card = el('div', 'fr-card');
  s.append(card);
  host.append(s);
  return card;
}

function textRow(card, label, hint, value = '', placeholder = '') {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  const f = field(input, { label, sr: false });
  f.el.classList.add('fr-row');
  if (hint) f.say(hint);
  card.append(f.el);
  return input;
}

function selectRow(card, label, hint, options) {
  const sel = document.createElement('select');
  for (const o of options) sel.add(new Option(o.label, o.value));
  const f = field(sel, { label, sr: false });
  f.el.classList.add('fr-row');
  if (hint) f.say(hint);
  card.append(f.el);
  return sel;
}

/** Build the surface into `host`. `onDone` runs once the answers are saved. */
export async function buildFirstRun(host, onDone) {
  host.className = 'fr-root';
  host.replaceChildren();

  const [rec, agentsRes, specsRes] = await Promise.all([
    request('/api/settei', { cache: 'no-store' }),
    request('/api/agents', { cache: 'no-store' }),
    request('/api/session-launch-specs'),
  ]);
  const observed = rec.ok ? (rec.data?.observed ?? {}) : {};
  const agents = agentsRes.ok && Array.isArray(agentsRes.data) ? agentsRes.data : [];
  const specs = specsRes.ok && Array.isArray(specsRes.data) ? specsRes.data : [];

  const head = el('div', 'fr-mast');
  const mark = el('div', 'fr-mark');
  mark.append(el('span', 'fr-torii', '⛩'), document.createTextNode(' ronin'));
  head.append(mark, el('h1', 'fr-title', 'Set up your coworkspace'));
  head.append(el('p', 'fr-sub', "You've downloaded Ronin onto this machine. A few answers and it's yours — all of them changeable later."));
  host.append(head);

  const m = observed.machine ?? {};
  const facts = [
    ['hostname', m.hostname],
    ['system', m.system ?? m.os],
    ['architecture', m.arch],
    ['cores', m.cores],
    ['memory', m.memory ?? m.ram],
    ['disk free', m.disk],
    ['tmux', m.tmux],
    ['node', m.node],
  ].filter(([, v]) => v != null && v !== '');

  const machineCard = section(
    host,
    'This machine',
    'Ronin runs here and shows you its terminals in a browser — this page is that browser, already talking to it. Everything below was measured on the box just now, so nothing here is a guess.',
  );
  if (facts.length) {
    const dl = el('dl', 'fr-facts');
    for (const [k, v] of facts) {
      const cell = el('div', 'fr-fact');
      cell.append(el('dt', null, k), el('dd', null, String(v)));
      dl.append(cell);
    }
    machineCard.append(dl);
  }
  const boxName = textRow(
    machineCard,
    'What do you want to call this machine?',
    'Yours to choose — it is what you will see in the roster. The hostname stays what it is.',
    '',
    'the workshop',
  );

  const youCard = section(
    host,
    'You',
    'One name, used by everything on the box that has to address you — the assistant, the roster, an agent writing you a note.',
  );
  const ownerName = textRow(youCard, 'What should we call you?', '', '', 'Your name');

  const projCard = section(
    host,
    'Your first project',
    'A project is a directory Ronin is allowed to work in, plus a line saying what it is for. Every session carries two things — where it works and what it is doing — and this is the first half. Add as many as you like later from ▣ Roots.',
  );
  const projName = textRow(projCard, 'Name', 'Short, lowercase. You will type it when you point an agent somewhere.', '', 'ronin');
  const projRemit = textRow(projCard, 'What is it for?', 'One line. Agents read it to know what they have been put in front of.', '', 'The browser grid of live tmux sessions');
  const projDir = textRow(projCard, 'Where does it live?', '', String(m.home ?? ''), '/home/you/projects/thing');
  projDir.classList.add('fr-path');

  const agentCard = section(
    host,
    'Agents',
    'Ronin does not talk to a model itself. It runs the agent you already use — Claude Code, Codex and their kin — each in its own terminal, and gives you all of them in one place. So this asks only what is on the machine: something present asks whether you want it here, something absent tells you how to get it. Ronin checks the command and nothing else — signing in happens inside the agent, the first time you use it.',
  );
  for (const a of agents) {
    const row = el('div', 'fr-agent');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = a.installed;
    box.disabled = !a.installed;
    box.id = 'fr-agent-' + a.id;

    const body = el('div', 'fr-agent-body');
    const name = el('div', 'fr-agent-name');
    const lab = el('label', null, a.label);
    lab.htmlFor = box.id;
    name.append(lab, el('span', a.installed ? 'fr-tag on' : 'fr-tag off', a.installed ? 'installed' : 'not installed'));
    body.append(name);
    body.append(el('div', 'fr-agent-what', a.installed ? 'Found at ' + a.path : a.from + '. Not on this machine yet — install it and it appears here.'));
    row.append(box, body);
    agentCard.append(row);
  }
  if (!agents.length) agentCard.append(el('p', 'fr-lede', 'Could not read this machine for agents. You can set this later from ⚙ Setup.'));

  const runnable = specs.filter((s) => {
    const first = String(s.cmd || '').split(/\s+/)[0];
    const a = agents.find((x) => x.cmd === first);
    return a && a.installed;
  });
  const opts = runnable.map((s) => ({ label: s.provider + ' · ' + s.model, value: s.provider + '\t' + s.model }));

  const defCard = section(
    host,
    'Defaults for new sessions',
    'A default is what a new session starts as, never what it is stuck with — every launch can pick something else.',
  );
  const model = selectRow(
    defCard,
    'Model',
    runnable.length ? 'Any session can be launched with another.' : 'Nothing installed yet — set this once an agent is on the machine.',
    opts,
  );

  /* MIKA — Ronin's own assistant, and the one job whose model should NOT be your best.
   * She answers questions about the house and runs small mechanical errands, so a cheap
   * fast model is the right tool. The suggestion is the smallest thing on offer: a name
   * we know is a light tier, else the LAST column of the table, because the launch table
   * puts a provider's default — its richest — first. Overridable here and in ⚙ Setup. */
  const LIGHT = /haiku|mini|flash|small|lite/i;
  const mika = selectRow(
    defCard,
    'Which model answers Mika?',
    'Mika is Ronin’s own assistant — she explains the house and runs small errands. She does not need your best model, and using one is how a helper gets expensive.',
    opts,
  );
  const light = runnable.find((s) => LIGHT.test(s.model)) ?? runnable[runnable.length - 1];
  if (light) mika.value = light.provider + '\t' + light.model;

  const cap = selectRow(
    defCard,
    'How many agents at once',
    'Budget about 700 MB per agent. Ronin refuses a new session past your number rather than letting the machine run out of memory.',
    [5, 10, 15, 20].map((n) => ({ label: String(n), value: String(n) })),
  );
  cap.value = '10';

  const svcCard = section(host, 'Optional');
  const sell = el('div', 'fr-sell');
  sell.append(el('h3', null, 'Ronin Services'), el('p', null, "Five things your coworkspace can't do on its own."));
  svcCard.append(sell);
  for (const [n, w] of [
    ['Live status ladders', 'Every agent shows its plan and how far through it is — on the tile and in the roster. Stop asking how it is going.'],
    ['Readable transcripts', 'Tiles become real text instead of a terminal mirror. Select it, copy it, scroll back through it — on your phone too.'],
    ['Voice', 'Talk to a session instead of typing at it, and have it read back to you.'],
    ['Usage statistics', 'What every session spent, by model, over time.'],
    ['gbrain', 'A memory your agents search before they answer, and write to as they work.'],
  ]) {
    const f = el('div', 'fr-feat');
    f.append(el('b', null, n), el('span', null, w));
    svcCard.append(f);
  }

  const dealRow = el('div', 'fr-deal');
  const want = document.createElement('input');
  want.type = 'checkbox';
  want.id = 'fr-services';
  const wantLab = el('label', 'fr-deal-lab');
  wantLab.htmlFor = want.id;
  wantLab.append(el('span', 'fr-deal-name', 'Add Ronin Services'), el('span', 'fr-deal-sub', 'A separate download, on separate terms.'));
  dealRow.append(want, wantLab);
  svcCard.append(dealRow);

  const terms = el('div', 'fr-terms');
  terms.hidden = true;
  terms.append(el('p', 'fr-lede', 'Ronin itself is open source — Apache-2.0, free, yours, with or without any of this. The services licence asks two things in return.'));
  for (const [n, w] of [
    ['Share how it runs', 'How many sessions, which models, how long they ran. Never your code, and never what was typed — by you or by your agents. It is how we find out where the experience is bad and make it better for everyone.'],
    ["Don't resell it", 'Use the services for your own work, commercial or not, as much as you like. Just don’t turn around and sell the services themselves.'],
  ]) {
    const a = el('div', 'fr-ask');
    a.append(el('b', null, n), el('span', null, w));
    terms.append(a);
  }
  const email = document.createElement('input');
  email.type = 'email';
  email.placeholder = 'you@example.com';
  const emailField = field(email, { label: 'Where should we send the confirmation?', sr: false });
  emailField.el.classList.add('fr-row');
  emailField.say('We email you a link. Confirming it is how you accept the two above, and the services install themselves after.');
  terms.append(emailField.el);
  svcCard.append(terms);
  want.addEventListener('change', () => {
    terms.hidden = !want.checked;
    if (want.checked) email.focus();
  });

  const foot = el('div', 'fr-foot');
  const line = status('fr-status');
  const save = button('Save and open Ronin', {
    cls: 'fr-go',
    onClick: async () => {
      save.disabled = true;
      line.say('Saving…', 'busy');
      const problems = [];
      const put = async (url, json) => {
        const r = await request(url, { method: 'PUT', json });
        if (!r.ok) problems.push(url + ': ' + (r.message || 'failed'));
      };

      const who = ownerName.value.trim();
      if (who) await put('/api/owner', { name: who });
      if (boxName.value.trim()) await put('/api/settei/machine', { name: boxName.value.trim() });
      await put('/api/session-max', { max: Number(cap.value) });

      const [prov, mod] = String(model.value || '').split('\t');
      const [mprov, mmod] = String(mika.value || '').split('\t');
      if (prov && mod) {
        await put('/api/settei/agents', {
          sessions: { default: { provider: prov, model: mod } },
          // Keyed by the session_job's own name — the token the launcher, memory and
          // counting all use, so nothing has to translate it.
          jobs: mprov && mmod ? { MikaAssist: { provider: mprov, model: mmod } } : {},
        });
      }

      const handle = projName.value.trim().toLowerCase();
      const dir = projDir.value.trim();
      if (handle && dir) {
        const r = await request('/api/project-roots', {
          method: 'POST',
          json: { name: handle, dir, remit: projRemit.value.trim(), ...(prov ? { provider: prov, model: mod } : {}) },
        });
        // A handle already taken is not worth blocking on: the floor root exists on every
        // box, and the owner can rename from ▣ Roots.
        if (!r.ok && r.status !== 409) problems.push('project: ' + (r.message || 'failed'));
      }

      if (want.checked) await put('/api/settei/services', { email: email.value.trim(), terms: 'accepted-pending-email' });

      if (problems.length) {
        line.say(problems[0], 'bad');
        save.disabled = false;
        return;
      }
      line.say('Saved.', 'ok');
      onDone?.();
    },
  });
  foot.append(save, el('span', 'fr-note', 'Your coworkspace opens straight away. Anything still to be fetched carries on in the background.'));
  host.append(foot, line.el);
}
