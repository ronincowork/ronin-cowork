/* COWORK_SETUP — the live companion page to the RoninCoWork workspace. */
import { request } from './request.js';
import { status } from './ui.js';
import { LIGHT, pm, initialOf, toRequests } from './settei-schema.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const titleCase = (value) => String(value).split(/[-_]/).map((x) => /^gpt$/i.test(x) ? 'GPT' : x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
const modelLabel = (spec) => `${spec.provider === 'anthropic' ? 'Claude Code' : spec.provider === 'openai' ? 'Codex' : titleCase(spec.provider)} · ${titleCase(spec.model)}`;
const fieldById = (schema, id) => schema.fields.find((f) => f.id === id);

function inputField(id, label, hint, { type = 'text', placeholder = '', cls = '' } = {}) {
  const wrap = el('div', 'cs-field');
  const lab = el('label', null, label); lab.htmlFor = id;
  const input = document.createElement('input'); input.id = id; input.type = type; input.placeholder = placeholder;
  if (cls) input.className = cls;
  wrap.append(lab, input);
  if (hint) wrap.append(el('span', 'cs-hint', hint));
  return { wrap, input };
}

function selectField(id, label, hint) {
  const wrap = el('div', 'cs-field');
  const lab = el('label', null, label); lab.htmlFor = id;
  const select = document.createElement('select'); select.id = id;
  wrap.append(lab, select, el('span', 'cs-hint', hint));
  return { wrap, select };
}

function card(number, title, lede) {
  const details = el('details', 'cs-card'); details.open = true;
  const summary = el('summary', 'cs-section-head');
  summary.append(el('div', 'cs-num', String(number)));
  const copy = el('div'); copy.append(el('h2', null, title), el('p', null, lede));
  summary.append(copy); details.append(summary);
  return details;
}

function stage(first, title, cls = '') {
  const row = el('div', `cs-stage ${cls}`.trim());
  if (first) row.append(el('small', null, first));
  row.append(document.createTextNode(title));
  return row;
}

function reviewRow(key) {
  const li = el('li'); const out = el('span', 'cs-review-value');
  li.append(el('span', 'cs-review-key', key), out);
  return { li, out };
}

function logo() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 104'); svg.setAttribute('aria-hidden', 'true');
  const paths = [
    ['none', 'M31 6h58l25 46-25 46H31L6 52z'],
    ['currentColor', 'M52.3 21.8c3.9-4.3 10.4-4.1 14.5-.5l3.8 3.4c2 1.8 2.1 4.4.5 6.7-5.4 7.8-8.7 15.8-12.1 23.7-6.1 14.4-15.7 24.7-29.4 32.7-3.7 2.2-7.4 1.4-8.8-1.6-1.2-2.6.4-5 3.7-7.4 11.2-8.1 19.1-17.7 24-29.2 3.8-9 6.8-17.1 5.1-22.4l-1.8-3c-.5-.8-.3-1.7.5-2.4z'],
    ['currentColor', 'M54.2 50c2.8-2.5 6.3-2.1 9.3 1.2 9.9 11.1 19.8 20 32.2 27.2 3.7 2.1 4.6 5 2.2 7.4-1.8 1.8-5 2.5-9.2 1.8-13.2-2.4-24.7-12.4-36.3-25.8-3.7-4.2-2.9-8.6 1.8-11.8z'],
  ];
  for (const [fill, d] of paths) {
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('fill', fill); path.setAttribute('d', d);
    if (fill === 'none') { path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '8'); path.setAttribute('stroke-linejoin', 'miter'); }
    svg.append(path);
  }
  return svg;
}

export async function buildFirstRun(host, onDone) {
  host.className = 'cs-root';
  host.style.cssText = 'position:fixed;inset:0;overflow-y:auto;overscroll-behavior:contain;';
  host.replaceChildren();
  const [setteiRes, agentsRes, specsRes] = await Promise.all([
    request('/api/settei', { cache: 'no-store' }), request('/api/agents', { cache: 'no-store' }),
    request('/api/session-launch-specs', { cache: 'no-store' }),
  ]);
  const record = setteiRes.ok ? setteiRes.data : {};
  const schema = record.schema ?? { fields: [], families: {}, seat: {} };
  const agents = agentsRes.ok && Array.isArray(agentsRes.data) ? agentsRes.data : [];
  const specs = specsRes.ok && Array.isArray(specsRes.data) ? specsRes.data : [];
  const machine = record.observed?.machine ?? {};
  const runnable = specs.filter((spec) => agents.some((agent) => agent.installed && agent.cmd === String(spec.cmd || '').split(/\s+/)[0]));
  const ram = Number(machine.ram_gb || 0);
  const sessionEstimate = Math.max(1, Math.floor((ram - Math.max(ram * 0.25, 2)) / 0.7));
  const ctx = { record, home: machine.home ?? '', sessionEstimate,
    modelOpts: runnable.map((spec) => ({ value: pm(spec), label: modelLabel(spec), spec })),
    light: runnable.find((spec) => LIGHT.test(spec.model)) ?? runnable[runnable.length - 1] };

  const shell = el('main', 'cs-shell'); host.append(shell);
  const top = el('header', 'cs-topbar');
  const brand = el('div', 'cs-brand');
  brand.append(logo(), document.createTextNode('RONIN '), el('span', 'cs-brand-cowork', 'COWORK'));
  top.append(brand, el('div', 'cs-step', 'cowork setup · nothing is saved yet')); shell.append(top);
  const hero = el('section', 'cs-hero');
  const proof = el('p', 'cs-live-proof'); proof.append(el('strong', null, 'YOU’RE CONNECTED'), document.createTextNode(' — Ronin is live on your machine.'));
  hero.append(proof, el('h1', null, 'Make this coworkspace yours.'), el('p', null, 'Tell Ronin Cowork who you are, where your work lives, and which agents you want here. You can change all of this later.'));
  const connected = el('div', 'cs-connected'); connected.append(el('span', 'cs-dot'), document.createTextNode(`Running privately on ${machine.host || 'this machine'}`));
  hero.append(connected); shell.append(hero);
  const layout = el('div', 'cs-layout'); const form = el('form', 'cs-form');
  form.addEventListener('submit', (event) => event.preventDefault());
  const reviewShell = el('aside', 'cs-review-shell'); reviewShell.setAttribute('aria-live', 'polite');
  layout.append(form, reviewShell); shell.append(layout); form.append(stage('First', 'Set up your coworkspace'));

  const identity = card(1, 'Name your coworkspace', 'This is how you’ll recognize this machine in your roster.');
  const identityFields = el('div', 'cs-fields');
  const machineField = inputField('cs-machine', 'Coworkspace name', 'The machine’s real hostname will not change.', { placeholder: 'The workshop' });
  const ownerField = inputField('cs-owner', 'What should Ronin call you?', 'Mika and your working agents use this name.', { placeholder: 'Your name' });
  machineField.input.value = initialOf(fieldById(schema, 'machineName'), ctx) || record.status?.machine_name || '';
  ownerField.input.value = initialOf(fieldById(schema, 'ownerName'), ctx) || record.status?.owner_name || '';
  identityFields.append(machineField.wrap, ownerField.wrap); identity.append(identityFields);
  const facts = el('details', 'cs-machine-details'); facts.append(el('summary', null, 'Machine details'), el('div', 'cs-detail-body',
    [machine.host, record.observed?.os?.name, machine.cores && `${machine.cores} cores`, ram && `${ram} GB memory`].filter(Boolean).join(' · ')));
  identity.append(facts); form.append(identity);

  const agentsCard = card(2, 'Your agents', 'Agents already found here are ready. Select any others you want RoninCoWork to add.');
  const agentGrid = el('div', 'cs-agents'); const agentHead = el('div', 'cs-agent-head');
  for (const text of ['', 'Agent', 'When you save', 'Status']) agentHead.append(el('span', null, text));
  agentGrid.append(agentHead); const wantAgents = new Map();
  for (const agent of agents) {
    const row = el('div', `cs-agent${!agent.installed && !agent.get ? ' unavailable' : ''}`);
    const check = document.createElement('input'); check.type = 'checkbox'; check.id = `cs-agent-${agent.id}`;
    const name = el('label', 'cs-agent-name', agent.label); name.htmlFor = check.id;
    let consequence; let tag;
    if (agent.installed) { check.checked = true; check.disabled = true; consequence = 'Nothing—already ready.'; tag = el('span', 'cs-tag on', 'Installed'); }
    else if (agent.get) { wantAgents.set(agent.id, check); consequence = 'Install if selected.'; tag = el('span', 'cs-tag add', 'Available to add'); }
    else { check.disabled = true; consequence = 'Nothing—vendor installer needs sudo.'; tag = el('span', 'cs-tag', 'Manual install'); }
    row.append(check, name, el('div', 'cs-agent-desc', consequence), tag);
    if (!agent.installed) {
      const more = el('details', 'cs-agent-more'); more.append(el('summary', null, agent.get ? 'Installation details' : 'Why Ronin can’t install it'),
        el('div', 'cs-detail-body', agent.get ? `${agent.from}. RoninCoWork will run ${agent.get} on this machine.` : agent.parked)); row.append(more);
    }
    agentGrid.append(row);
  }
  agentsCard.append(agentGrid); form.append(agentsCard);

  const defaults = card(3, 'How new sessions should start', 'This is only the default. You can choose something different each time.');
  const defaultFields = el('div', 'cs-fields');
  const modelField = selectField('cs-model', 'Start new sessions with', 'These are the runnable models in Ronin’s launch catalog. A saved choice wins when one exists.');
  const mikaField = selectField('cs-mika', 'Mika uses', 'The same runnable launch catalog supplies this list. A light model is recommended for Mika.');
  for (const option of ctx.modelOpts) {
    modelField.select.add(new Option(option.label, option.value));
    mikaField.select.add(new Option(`${option.label}${LIGHT.test(option.spec.model) ? ' (recommended)' : ''}`, option.value));
  }
  modelField.select.value = initialOf(fieldById(schema, 'model'), ctx); mikaField.select.value = initialOf(fieldById(schema, 'mika'), ctx);
  modelField.wrap.classList.add('full');
  const capField = selectField('cs-cap', 'Maximum agent sessions', '≈700 MB per agent. Ronin reserves 25% (minimum 2 GB). Shells don’t count.');
  const savedCap = Number(initialOf(fieldById(schema, 'cap'), ctx));
  const caps = [...new Set([sessionEstimate, 2, 4, 8, 24, savedCap, 0].filter((x) => Number.isFinite(x) && x >= 0))];
  for (const cap of caps) capField.select.add(new Option(cap === 0 ? 'No limit — allow any number' : cap === sessionEstimate ? `${cap} — Ronin estimate for this ${ram} GB machine` : `${cap} agent sessions`, String(cap)));
  capField.select.value = String(savedCap); defaultFields.append(modelField.wrap, mikaField.wrap, capField.wrap); defaults.append(defaultFields); form.append(defaults);

  const servicesCard = card(4, 'Ronin Services', 'Extra capabilities for your coworkspace. Base RoninCoWork works fully without them.');
  servicesCard.querySelector('h2').append(el('span', 'cs-optional', 'Optional'));
  const intro = el('div', 'cs-service-intro'); intro.append(el('strong', null, 'Keep the work on your machine, add the view around it. '), document.createTextNode('Services add live agent plans, readable transcripts, voice, usage history, and long-term memory.'));
  servicesCard.append(intro); const features = el('div', 'cs-features');
  for (const [name] of record.schema?.services?.features ?? []) features.append(el('div', 'cs-feature', name === 'gbrain' ? 'Long-term agent memory' : name));
  servicesCard.append(features);
  const choice = el('div', 'cs-choice'); const wantServices = document.createElement('input'); wantServices.type = 'checkbox'; wantServices.id = 'cs-services';
  const activationStage = record.set?.services?.activation?.stage || 'not_requested';
  const activationExists = !['not_requested', 'cancelled'].includes(activationStage);
  wantServices.checked = activationExists;
  wantServices.disabled = activationExists;
  const choiceLabel = el('label'); choiceLabel.htmlFor = wantServices.id; choiceLabel.append(el('div', 'cs-choice-title', 'Start Ronin Services activation'), el('div', 'cs-choice-copy', 'Ronin will send your email address, this terms version, and an activation request.'));
  const serviceFields = el('div', 'cs-service-fields'); const emailField = inputField('cs-email', 'Email for the confirmation', '', { type: 'email', placeholder: 'you@example.com' });
  if (activationExists) {
    choiceLabel.querySelector('.cs-choice-title').textContent = activationStage === 'installed' ? 'Ronin Services are active' : 'Ronin Services activation is already in progress';
    choiceLabel.querySelector('.cs-choice-copy').textContent = `Current status: ${activationStage.replaceAll('_', ' ')}.`;
    emailField.input.placeholder = record.set?.services?.activation?.email_masked || 'Email already recorded securely';
  }
  serviceFields.append(emailField.wrap, el('div', 'cs-activation-flow', '1. Ronin emails a link → 2. You confirm the terms → 3. Services install.'), el('div', 'cs-terms', 'Confirming accepts the Services terms: share anonymous operating measurements—never your code or conversations—and don’t resell the Services. Declining sends nothing.'));
  const gbrainLabel = el('label', 'cs-gbrain-choice'); const wantGbrain = document.createElement('input'); wantGbrain.type = 'checkbox'; wantGbrain.id = 'cs-gbrain'; wantGbrain.checked = record.set?.gbrain?.enabled === true;
  const gbrainCopy = el('span'); const gbrainDesc = el('span', 'cs-choice-copy'); const gbrainLink = el('a', null, 'Garry Tan’s open-source agent memory');
  gbrainLink.href = 'https://github.com/garrytan/gbrain'; gbrainLink.target = '_blank'; gbrainLink.rel = 'noreferrer';
  gbrainDesc.append(gbrainLink, document.createTextNode('. Agents search it before answering and add to it as they work. To keep your data local and serve gbrain, Ronin provides a local embeddings model that requires about 0.3 GB.'));
  gbrainCopy.append(el('span', 'cs-choice-title', 'Use gbrain memory'), gbrainDesc); gbrainLabel.append(wantGbrain, gbrainCopy); serviceFields.append(gbrainLabel);
  choice.append(wantServices, choiceLabel, serviceFields); servicesCard.append(choice); form.append(servicesCard);

  form.append(stage('Then', 'Start your first project', 'project'));
  const projectCard = card(5, 'What would you like to work on first?', 'Start with one project and its folder. You can add more whenever you need them.');
  const projectFields = el('div', 'cs-fields');
  const dirField = inputField('cs-folder', 'Working folder', 'No folder is assumed. Enter the full path to an existing directory on this machine. RoninCoWork will not create or clone it.', { placeholder: 'Enter an absolute path', cls: 'path' }); dirField.wrap.classList.add('full');
  const repoFact = el('div', 'cs-detected'); repoFact.append(el('b', null, 'Git repository: '), el('span', null, 'Not checked yet — Git is optional')); dirField.wrap.append(repoFact);
  const projectField = inputField('cs-project', 'Short name', 'Required, unique, and at most 32 characters. Start with a lowercase letter or number; then use lowercase letters, numbers, hyphens, or underscores.', { placeholder: 'my-app' });
  const remitField = inputField('cs-purpose', 'What are you working on? (Optional)', 'One sentence gives agents useful context.', { placeholder: 'A customer support dashboard' });
  projectFields.append(dirField.wrap, projectField.wrap, remitField.wrap); projectCard.append(projectFields); form.append(projectCard);

  reviewShell.append(stage('', 'When you save')); const review = el('div', 'cs-review'); const reviewHead = el('div', 'cs-review-head');
  reviewHead.append(el('p', null, 'Review what RoninCoWork will do.')); review.append(reviewHead); const list = el('ul', 'cs-review-list'); review.append(list);
  const rr = { machine: reviewRow('Coworkspace name'), owner: reviewRow('Ronin will call you'), ready: reviewRow('Ready agents · detected'), add: reviewRow('RoninCoWork will install · consequence'), model: reviewRow('New sessions start with'), mika: reviewRow('Mika uses'), cap: reviewRow('Maximum agent sessions'), services: reviewRow('Ronin Services'), gbrain: reviewRow('gbrain memory'), project: reviewRow('First project'), folder: reviewRow('Working folder'), repo: reviewRow('Git repository · detected'), purpose: reviewRow('What are you working on?') };
  Object.values(rr).forEach((row) => list.append(row.li)); rr.add.li.hidden = true;
  const reviewFoot = el('div', 'cs-review-foot'); const save = el('button', 'cs-save', 'Save and open RoninCoWork'); save.type = 'button';
  const line = status('cs-status'); reviewFoot.append(save, el('p', 'cs-save-note', 'You can change these choices later.'), line.el); review.append(reviewFoot); reviewShell.append(review);

  let repoText = 'Not checked yet — Git is optional'; let inspectTimer;
  const updateReview = () => {
    const additions = [...wantAgents].filter(([, box]) => box.checked).map(([id]) => agents.find((a) => a.id === id)?.label || id);
    rr.machine.out.textContent = machineField.input.value.trim() || `Use ${machine.host || 'the hostname'}`;
    rr.owner.out.textContent = ownerField.input.value.trim() || `Use ${machine.user || 'the machine user'}`;
    rr.ready.out.textContent = agents.filter((a) => a.installed).map((a) => a.label).join(', ') || 'None detected';
    rr.add.li.hidden = additions.length === 0; rr.add.out.textContent = additions.length ? `${additions.join(', ')} — install in visible tiles` : '';
    rr.model.out.textContent = modelField.select.selectedOptions[0]?.textContent || 'No runnable model detected'; rr.mika.out.textContent = mikaField.select.selectedOptions[0]?.textContent || 'No runnable model detected'; rr.cap.out.textContent = capField.select.selectedOptions[0]?.textContent || '';
    rr.services.out.textContent = activationExists ? `Already selected · ${activationStage.replaceAll('_', ' ')}` : wantServices.checked ? `Begin activation${emailField.input.value.trim() ? ` for ${emailField.input.value.trim()}` : ' after you enter an email'}` : 'Not selected — nothing will be sent';
    rr.gbrain.out.textContent = wantServices.checked && wantGbrain.checked ? 'Add local embeddings model · about 0.3 GB' : 'Not selected'; rr.project.out.textContent = projectField.input.value.trim() || 'Not named yet'; rr.folder.out.textContent = dirField.input.value.trim() || 'Not chosen yet'; rr.repo.out.textContent = repoText; rr.purpose.out.textContent = remitField.input.value.trim() || 'No description yet';
  };
  const inspectDir = () => {
    clearTimeout(inspectTimer); repoText = dirField.input.value.trim() ? 'Checking this folder…' : 'Not checked yet — Git is optional'; repoFact.querySelector('span').textContent = repoText; updateReview();
    if (!dirField.input.value.trim()) return;
    inspectTimer = setTimeout(async () => {
      const result = await request(`/api/project-roots/inspect?dir=${encodeURIComponent(dirField.input.value.trim())}`, { cache: 'no-store' });
      repoText = !result.ok ? result.message : !result.data.exists ? 'Folder does not exist' : result.data.repo ? `${result.data.repo.remote || 'Local Git repository'}${result.data.repo.branch ? ` · branch ${result.data.repo.branch}` : ''}` : 'Existing folder · Git is optional';
      repoFact.querySelector('span').textContent = repoText; updateReview();
    }, 350);
  };
  for (const control of shell.querySelectorAll('input, select')) control.addEventListener('input', updateReview);
  dirField.input.addEventListener('input', inspectDir); wantServices.addEventListener('change', () => { if (!wantServices.checked) wantGbrain.checked = false; updateReview(); });

  save.addEventListener('click', async () => {
    const projectName = projectField.input.value.trim().toLowerCase(); const projectDir = dirField.input.value.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(projectName)) { line.say('Give the first project a valid short name.', 'bad'); projectField.input.focus(); return; }
    if (!projectDir) { line.say('Choose the existing working folder for your first project.', 'bad'); dirField.input.focus(); return; }
    if (repoText === 'Folder does not exist') { line.say('The working folder must already exist on this machine.', 'bad'); dirField.input.focus(); return; }
    if (!activationExists && wantServices.checked && (!emailField.input.value.trim() || !emailField.input.validity.valid)) { line.say('Enter the email address for Services confirmation.', 'bad'); emailField.input.focus(); return; }
    save.disabled = true; line.say('Saving…', 'busy');
    const values = { machineName: machineField.input.value, ownerName: ownerField.input.value, projName: projectName, projDir: projectDir, projRemit: remitField.input.value, model: modelField.select.value, mika: mikaField.select.value, cap: capField.select.value };
    const problems = []; let installNote = ''; const landOn = [];
    for (const req of toRequests(schema, values)) { const result = await request(req.route, { method: req.method, json: req.json }); if (!result.ok && result.status !== 409) problems.push(result.message || req.route); }
    const gbrainResult = await request('/api/settei/gbrain', { method: 'PUT', json: { enabled: wantServices.checked && wantGbrain.checked } }); if (!gbrainResult.ok) problems.push(gbrainResult.message);
    if (!activationExists && wantServices.checked) { const result = await request('/api/services/activation', { method: 'POST', json: { email: emailField.input.value.trim() } }); if (!result.ok && result.status === 400) problems.push(result.message); else if (!result.ok) installNote = ' Services activation needs attention in the workspace.'; }
    if (problems.length) { line.say(problems[0], 'bad'); save.disabled = false; return; }
    await request('/api/settei/setup', { method: 'PUT' });
    const picks = [...wantAgents].filter(([, box]) => box.checked).map(([id]) => id);
    if (picks.length) {
      const already = (record.set?.wanted ?? []).filter((w) => !(w.kind === 'agent' && picks.includes(w.name)));
      await request('/api/settei/wanted', { method: 'PUT', json: { wanted: [...already, ...picks.map((name) => ({ kind: 'agent', name }))] } });
      const installed = await request('/api/install', { method: 'POST', json: { items: picks.map((name) => ({ kind: 'agent', name })) } });
      if (installed.ok && Array.isArray(installed.data)) landOn.push(...installed.data.filter((x) => x.session).map((x) => x.session)); else if (!installed.ok) installNote += ' Agent installs can be retried from Configuration.';
    }
    if (ctx.modelOpts.length) { const born = await request('/api/launch', { method: 'POST', json: { session_job: schema.seat.job, name: schema.seat.name, project_root: projectName, prompt: schema.seat.prompt } }); if (born.ok && born.data?.name) landOn.push(born.data.name); }
    line.say(`Saved. Opening RoninCoWork…${installNote}`, installNote ? 'bad' : 'ok'); onDone?.({ tiles: landOn });
  });
  updateReview(); inspectDir();
}
