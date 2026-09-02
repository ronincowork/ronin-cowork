/* COWORK_SETUP — the live companion page to the RoninCoWork workspace. */
import { request } from './request.js';
import { status } from './ui.js';
import { LIGHT, pm, initialOf, toRequests } from './settei-schema.js';
import { t } from './lexicon.js';

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

function choiceField(id, choices, selected) {
  const grid = el('div', 'cs-bundles'); const inputs = [];
  for (const raw of choices) {
    const choice = typeof raw === 'string' ? { value: raw, label: t('kind.' + raw, raw) } : raw;
    const label = el('label', `cs-bundle${choice.services ? ' services' : ''}`);
    const input = document.createElement('input'); input.type = 'radio'; input.name = id; input.value = choice.value; input.checked = choice.value === selected;
    const heading = el('strong', null, choice.labelKey ? t(choice.labelKey, choice.label) : choice.label);
    if (choice.recommended) heading.append(document.createTextNode(' '), el('small', null, t('setup.recommended_short', 'recommended')));
    label.append(input, heading);
    if (choice.copy) label.append(el('span', null, t(choice.copyKey, choice.copy)));
    grid.append(label); inputs.push(input);
  }
  return { wrap: grid, inputs, value: () => inputs.find((input) => input.checked)?.value || selected };
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

export async function buildCoworkSetup(host, onDone) {
  host.className = 'cs-root';
  host.style.cssText = 'position:fixed;inset:0;overflow-y:auto;overscroll-behavior:contain;';
  host.replaceChildren();
  const [setteiRes, agentsRes, specsRes, profilesRes] = await Promise.all([
    request('/api/settei', { cache: 'no-store' }), request('/api/agents', { cache: 'no-store' }),
    request('/api/session-launch-specs', { cache: 'no-store' }), request('/api/desk-profiles', { cache: 'no-store' }),
  ]);
  const record = setteiRes.ok ? setteiRes.data : {};
  const schema = record.schema ?? { fields: [], families: {}, seat: {} };
  const agents = agentsRes.ok && Array.isArray(agentsRes.data) ? agentsRes.data : [];
  const specs = specsRes.ok && Array.isArray(specsRes.data) ? specsRes.data : [];
  const profiles = profilesRes.ok && Array.isArray(profilesRes.data?.profiles) ? profilesRes.data.profiles : [];
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
  top.append(brand, el('div', 'cs-step', t('setup.step', 'cowork setup · nothing is saved yet'))); shell.append(top);
  const hero = el('section', 'cs-hero');
  const proof = el('p', 'cs-live-proof'); proof.append(el('strong', null, t('setup.connected', 'YOU’RE CONNECTED')), document.createTextNode(' ' + t('setup.connected_tail', '— Ronin is live on your machine.')));
  hero.append(proof, el('h1', null, t('setup.hero', 'Make this coworkspace yours.')), el('p', null, t('setup.hero_lede', 'Tell Ronin Cowork who you are, where your work lives, and which agents you want here. You can change all of this later.')));
  const connected = el('div', 'cs-connected'); connected.append(el('span', 'cs-dot'), document.createTextNode(t('setup.running_on', 'Running privately on {host}', { host: machine.host || t('setup.this_machine', 'this machine') })));
  hero.append(connected); shell.append(hero);
  const layout = el('div', 'cs-layout'); const form = el('form', 'cs-form');
  form.addEventListener('submit', (event) => event.preventDefault());
  const reviewShell = el('aside', 'cs-review-shell'); reviewShell.setAttribute('aria-live', 'polite');
  layout.append(form, reviewShell); shell.append(layout); form.append(stage(t('setup.stage_first', 'First'), t('setup.stage_first_title', 'Set up your coworkspace')));

  const campaignCard = card(1, t('setup.campaign', 'Campaign'), t('setup.campaign_lede', 'The body of work this Ronin configuration serves.'));
  const campaignFields = el('div', 'cs-fields');
  const campaignName = inputField('cs-campaign', t('setup.campaign_name', 'Campaign name'), '', { placeholder: 'Ronin Home' });
  const campaignDescription = inputField('cs-campaign-description', t('setup.campaign_description', 'Description'), '', { placeholder: t('setup.campaign_description_placeholder', 'What this campaign is for') });
  campaignName.input.value = record.set?.campaign?.name || 'Ronin Home'; campaignDescription.input.value = record.set?.campaign?.description || '';
  campaignFields.append(campaignName.wrap, campaignDescription.wrap); campaignCard.append(campaignFields); form.append(campaignCard);

  const machineCard = card(2, t('setup.machine', 'This machine'), t('setup.identity_lede', 'This is how you’ll recognize this machine in your roster.'));
  const machineFields = el('div', 'cs-fields');
  const machineField = inputField('cs-machine', t('setup.machine_name', 'Coworkspace name'), t('setup.machine_name_hint', 'The machine’s real hostname will not change.'), { placeholder: t('setup.machine_name_placeholder', 'The workshop') });
  machineField.input.value = initialOf(fieldById(schema, 'machineName'), ctx) || record.status?.machine_name || '';
  machineFields.append(machineField.wrap); machineCard.append(machineFields);
  const facts = el('details', 'cs-machine-details'); facts.append(el('summary', null, t('setup.machine_details', 'Machine details')), el('div', 'cs-detail-body',
    [machine.host, record.observed?.os?.name, machine.cores && t('setup.cores', '{n} cores', { n: machine.cores }), ram && t('setup.memory', '{n} GB memory', { n: ram })].filter(Boolean).join(' · ')));
  machineCard.append(facts); form.append(machineCard);

  const youCard = card(3, t('setup.you', 'You'), t('setup.you_lede', 'The name Ronin and your Agents use when they address you.'));
  const youFields = el('div', 'cs-fields');
  const ownerField = inputField('cs-owner', t('setup.owner_name', 'What should Ronin call you?'), t('setup.owner_name_hint', 'Mika and your working agents use this name.'), { placeholder: t('setup.owner_name_placeholder', 'Your name') });
  ownerField.input.value = initialOf(fieldById(schema, 'ownerName'), ctx) || record.status?.owner_name || '';
  youFields.append(ownerField.wrap); youCard.append(youFields); form.append(youCard);

  const kindDef = fieldById(schema, 'mainIntent');
  const kindCard = card(4, t('setup.kind', 'Kind'), t('setup.kind_lede', 'What do you want to use this app for?'));
  const kindField = choiceField('cs-kind', kindDef?.choices || [], initialOf(kindDef, ctx) || 'open'); kindCard.append(kindField.wrap); form.append(kindCard);

  const bundleDef = fieldById(schema, 'routineBundle');
  const bundleCard = card(5, t('setup.routine_bundles', 'Routine Bundles'), t('setup.routine_bundles_lede', 'Choose how much Ronin hands to each new Agent.'));
  const bundleField = choiceField('cs-routine-bundle', bundleDef?.choices || [], initialOf(bundleDef, ctx) || 'control'); bundleCard.append(bundleField.wrap); form.append(bundleCard);

  const agentsCard = card(6, t('setup.agents', 'Your agents'), t('setup.agents_lede', 'Agents already found here are ready. Select any others you want RoninCoWork to add.'));
  const agentGrid = el('div', 'cs-agents'); const agentHead = el('div', 'cs-agent-head');
  for (const text of ['', t('setup.col_agent', 'Agent'), t('setup.col_when_saved', 'When you save'), t('setup.col_status', 'Status')]) agentHead.append(el('span', null, text));
  agentGrid.append(agentHead); const wantAgents = new Map();
  for (const agent of agents) {
    const row = el('div', `cs-agent${!agent.installed && !agent.get ? ' unavailable' : ''}`);
    const check = document.createElement('input'); check.type = 'checkbox'; check.id = `cs-agent-${agent.id}`;
    const name = el('label', 'cs-agent-name', agent.label); name.htmlFor = check.id;
    let consequence; let tag;
    if (agent.installed) { check.checked = true; check.disabled = true; consequence = t('setup.agent_ready', 'Nothing—already ready.'); tag = el('span', 'cs-tag on', t('setup.agent_installed', 'Installed')); }
    else if (agent.get) { wantAgents.set(agent.id, check); consequence = t('setup.agent_install_if', 'Install if selected.'); tag = el('span', 'cs-tag add', t('setup.agent_available', 'Available to add')); }
    else { check.disabled = true; consequence = t('setup.agent_needs_sudo', 'Nothing—vendor installer needs sudo.'); tag = el('span', 'cs-tag', t('setup.agent_manual', 'Manual install')); }
    row.append(check, name, el('div', 'cs-agent-desc', consequence), tag);
    if (!agent.installed) {
      const more = el('details', 'cs-agent-more'); more.append(el('summary', null, agent.get ? t('setup.agent_details', 'Installation details') : t('setup.agent_why_not', 'Why Ronin can’t install it')),
        el('div', 'cs-detail-body', agent.get ? t('setup.agent_will_run', '{from}. RoninCoWork will run {command} on this machine.', { from: agent.from, command: agent.get }) : agent.parked)); row.append(more);
    }
    agentGrid.append(row);
  }
  agentsCard.append(agentGrid); form.append(agentsCard);

  const defaults = card(7, t('setup.defaults', 'How new sessions should start'), t('setup.defaults_lede', 'This is only the default. You can choose something different each time.'));
  const defaultFields = el('div', 'cs-fields');
  const modelField = selectField('cs-model', t('setup.model', 'Start new sessions with'), t('setup.model_hint', 'These are the runnable models in Ronin’s launch catalog. A saved choice wins when one exists.'));
  const mikaField = selectField('cs-mika', t('setup.mika', 'Mika uses'), t('setup.mika_hint', 'The same runnable launch catalog supplies this list. A light model is recommended for Mika.'));
  const deskProfileField = selectField('cs-desk-profile', t('setup.desk_profile', 'Desk profile'), t('setup.desk_profile_hint', 'The look, the words, and how much terminal detail your workspace shows.'));
  deskProfileField.select.add(new Option(t('setup.desk_profile_stock', 'Stock'), ''));
  for (const profile of profiles) deskProfileField.select.add(new Option(profile.label || profile.name, profile.name));
  deskProfileField.select.value = initialOf(fieldById(schema, 'deskProfile'), ctx);
  for (const option of ctx.modelOpts) {
    modelField.select.add(new Option(option.label, option.value));
    mikaField.select.add(new Option(LIGHT.test(option.spec.model) ? t('setup.recommended', '{model} (recommended)', { model: option.label }) : option.label, option.value));
  }
  modelField.select.value = initialOf(fieldById(schema, 'model'), ctx); mikaField.select.value = initialOf(fieldById(schema, 'mika'), ctx);
  modelField.wrap.classList.add('full');
  const capField = selectField('cs-cap', t('setup.cap', 'Maximum agent sessions'), t('setup.cap_hint', '≈700 MB per agent. Ronin reserves 25% (minimum 2 GB). Shells don’t count.'));
  const savedCap = Number(initialOf(fieldById(schema, 'cap'), ctx));
  const caps = [...new Set([sessionEstimate, 2, 4, 8, 24, savedCap, 0].filter((x) => Number.isFinite(x) && x >= 0))];
  for (const cap of caps) capField.select.add(new Option(cap === 0 ? t('setup.cap_none', 'No limit — allow any number') : cap === sessionEstimate ? t('setup.cap_estimate', '{n} — Ronin estimate for this {ram} GB machine', { n: cap, ram }) : t('setup.cap_n', '{n} agent sessions', { n: cap }), String(cap)));
  capField.select.value = String(savedCap); defaultFields.append(modelField.wrap, deskProfileField.wrap, mikaField.wrap, capField.wrap); defaults.append(defaultFields); form.append(defaults);

  const servicesCard = card(8, t('settei.ronin_services', 'Ronin Services'), t('setup.services_lede', 'Extra capabilities for your coworkspace, in beta today. Base RoninCoWork works fully without them.'));
  servicesCard.querySelector('h2').append(el('span', 'cs-optional', t('setup.optional', 'Optional')));
  const intro = el('div', 'cs-service-intro'); intro.append(el('strong', null, t('setup.services_intro_strong', 'Keep the work on your machine, add the view around it.') + ' '), document.createTextNode(t('setup.services_intro', 'Services add live agent plans, readable transcripts, voice, usage history, and long-term memory. It is early days for this side. Sharing your email is optional — it registers your interest, keeps you part of the Ronin community as it grows, and what is ready reaches you as it lands.')));
  servicesCard.append(intro); const features = el('div', 'cs-features');
  for (const [name] of record.schema?.services?.features ?? []) features.append(el('div', 'cs-feature', name === 'gbrain' ? t('setup.feature_gbrain', 'Long-term agent memory') : name));
  servicesCard.append(features);
  const choice = el('div', 'cs-choice'); const wantServices = document.createElement('input'); wantServices.type = 'checkbox'; wantServices.id = 'cs-services';
  const activationStage = record.set?.services?.activation?.stage || 'not_requested';
  const activationExists = !['not_requested', 'cancelled'].includes(activationStage);
  wantServices.checked = activationExists;
  wantServices.disabled = activationExists;
  const choiceLabel = el('label'); choiceLabel.htmlFor = wantServices.id; choiceLabel.append(el('div', 'cs-choice-title', t('setup.services_start', 'Start Ronin Services activation')), el('div', 'cs-choice-copy', t('setup.services_start_copy', 'Ronin will send your email address, this terms version, and an activation request.')));
  const serviceFields = el('div', 'cs-service-fields'); const emailField = inputField('cs-email', t('setup.email', 'Email for the confirmation'), '', { type: 'email', placeholder: 'you@example.com' });
  if (activationExists) {
    choiceLabel.querySelector('.cs-choice-title').textContent = activationStage === 'installed' ? t('setup.services_active', 'Ronin Services are active') : t('setup.services_in_progress', 'Ronin Services activation is already in progress');
    choiceLabel.querySelector('.cs-choice-copy').textContent = t('setup.services_status', 'Current status: {stage}.', { stage: activationStage.replaceAll('_', ' ') });
    emailField.input.placeholder = record.set?.services?.activation?.email_masked || t('setup.email_recorded', 'Email already recorded securely');
  }
  serviceFields.append(emailField.wrap, el('div', 'cs-activation-flow', t('setup.activation_flow', '1. Ronin emails a link → 2. You confirm the terms → 3. Services install.')), el('div', 'cs-terms', t('setup.terms', 'Confirming accepts the Services terms: share anonymous operating measurements—never your code or conversations—and don’t resell the Services. Declining sends nothing.')));
  const gbrainLabel = el('label', 'cs-gbrain-choice'); const wantGbrain = document.createElement('input'); wantGbrain.type = 'checkbox'; wantGbrain.id = 'cs-gbrain'; wantGbrain.checked = record.set?.gbrain?.enabled === true;
  const gbrainCopy = el('span'); const gbrainDesc = el('span', 'cs-choice-copy'); const gbrainLink = el('a', null, t('setup.gbrain_link', 'Garry Tan’s open-source agent memory'));
  gbrainLink.href = 'https://github.com/garrytan/gbrain'; gbrainLink.target = '_blank'; gbrainLink.rel = 'noreferrer';
  gbrainDesc.append(gbrainLink, document.createTextNode(t('setup.gbrain_copy', '. Agents search it before answering and add to it as they work. To keep your data local and serve gbrain, Ronin provides a local embeddings model that requires about 0.3 GB.')));
  gbrainCopy.append(el('span', 'cs-choice-title', t('setup.gbrain_use', 'Use gbrain memory')), gbrainDesc); gbrainLabel.append(wantGbrain, gbrainCopy); serviceFields.append(gbrainLabel);
  choice.append(wantServices, choiceLabel, serviceFields); servicesCard.append(choice); form.append(servicesCard);

  reviewShell.append(stage('', t('setup.review_stage', 'When you save'))); const review = el('div', 'cs-review'); const reviewHead = el('div', 'cs-review-head');
  reviewHead.append(el('p', null, t('setup.review_lede', 'Review what RoninCoWork will do.'))); review.append(reviewHead); const list = el('ul', 'cs-review-list'); review.append(list);
  const rr = { campaign: reviewRow(t('setup.campaign', 'Campaign')), machine: reviewRow(t('setup.machine_name', 'Coworkspace name')), owner: reviewRow(t('setup.review_owner', 'Ronin will call you')), kind: reviewRow(t('setup.kind', 'Kind')), routines: reviewRow(t('setup.routine_bundles', 'Routine Bundles')), ready: reviewRow(t('setup.review_ready', 'Ready agents · detected')), add: reviewRow(t('setup.review_add', 'RoninCoWork will install · consequence')), model: reviewRow(t('setup.review_model', 'New sessions start with')), mika: reviewRow(t('setup.mika', 'Mika uses')), cap: reviewRow(t('setup.cap', 'Maximum agent sessions')), services: reviewRow(t('settei.ronin_services', 'Ronin Services')), gbrain: reviewRow(t('setup.review_gbrain', 'gbrain memory')) };
  Object.values(rr).forEach((row) => list.append(row.li)); rr.add.li.hidden = true;
  const reviewFoot = el('div', 'cs-review-foot'); const save = el('button', 'cs-save', t('setup.save', 'Save and open RoninCoWork')); save.type = 'button';
  const line = status('cs-status'); reviewFoot.append(save, el('p', 'cs-save-note', t('setup.save_note', 'You can change these choices later.')), line.el); review.append(reviewFoot); reviewShell.append(review);

  const updateReview = () => {
    const additions = [...wantAgents].filter(([, box]) => box.checked).map(([id]) => agents.find((a) => a.id === id)?.label || id);
    rr.campaign.out.textContent = campaignName.input.value.trim() || 'Ronin Home';
    rr.machine.out.textContent = machineField.input.value.trim() || t('setup.use_value', 'Use {value}', { value: machine.host || t('setup.the_hostname', 'the hostname') });
    rr.owner.out.textContent = ownerField.input.value.trim() || t('setup.use_value', 'Use {value}', { value: machine.user || t('setup.the_machine_user', 'the machine user') });
    rr.ready.out.textContent = agents.filter((a) => a.installed).map((a) => a.label).join(', ') || t('setup.none_detected', 'None detected');
    rr.add.li.hidden = additions.length === 0; rr.add.out.textContent = additions.length ? t('setup.install_in_tiles', '{agents} — install in visible tiles', { agents: additions.join(', ') }) : '';
    rr.model.out.textContent = modelField.select.selectedOptions[0]?.textContent || t('setup.no_model', 'No runnable model detected'); rr.mika.out.textContent = mikaField.select.selectedOptions[0]?.textContent || t('setup.no_model', 'No runnable model detected'); rr.cap.out.textContent = capField.select.selectedOptions[0]?.textContent || '';
    rr.services.out.textContent = activationExists ? t('setup.services_already', 'Already selected · {stage}', { stage: activationStage.replaceAll('_', ' ') }) : wantServices.checked ? (emailField.input.value.trim() ? t('setup.services_begin_for', 'Begin activation for {email}', { email: emailField.input.value.trim() }) : t('setup.services_begin_after', 'Begin activation after you enter an email')) : t('setup.services_not_selected', 'Not selected — nothing will be sent');
    rr.gbrain.out.textContent = wantServices.checked && wantGbrain.checked ? t('setup.gbrain_selected', 'Add local embeddings model · about 0.3 GB') : t('setup.not_selected', 'Not selected');
    rr.kind.out.textContent = titleCase(kindField.value());
    rr.routines.out.textContent = titleCase(bundleField.value());
  };
  for (const control of shell.querySelectorAll('input, select')) control.addEventListener('input', updateReview);
  wantServices.addEventListener('change', () => { if (!wantServices.checked) { wantGbrain.checked = false; if (bundleField.value() === 'services') bundleField.inputs.find((input) => input.value === 'control').checked = true; } bundleField.wrap.classList.toggle('services-on', wantServices.checked); updateReview(); });
  bundleField.wrap.classList.toggle('services-on', wantServices.checked);

  save.addEventListener('click', async () => {
    if (!activationExists && wantServices.checked && (!emailField.input.value.trim() || !emailField.input.validity.valid)) { line.say(t('setup.err_email', 'Enter the email address for Services confirmation.'), 'bad'); emailField.input.focus(); return; }
    save.disabled = true; line.say(t('setup.saving', 'Saving…'), 'busy');
    const values = { campaignName: campaignName.input.value, campaignDescription: campaignDescription.input.value, machineName: machineField.input.value, ownerName: ownerField.input.value, mainIntent: kindField.value(), routineBundle: bundleField.value(), model: modelField.select.value, deskProfile: deskProfileField.select.value, mika: mikaField.select.value, cap: capField.select.value };
    const problems = []; let installNote = ''; const landOn = [];
    // 409 is an answer only from the project POST — the project already exists from a
    // previous Save. Any other family answering 409 is a problem worth showing.
    for (const req of toRequests(schema, values)) { const result = await request(req.route, { method: req.method, json: req.json }); if (!result.ok && !(result.status === 409 && req.family === 'project')) problems.push(result.message || req.route); }
    const gbrainResult = await request('/api/settei/gbrain', { method: 'PUT', json: { enabled: wantServices.checked && wantGbrain.checked } }); if (!gbrainResult.ok) problems.push(gbrainResult.message);
    if (!activationExists && wantServices.checked) { const result = await request('/api/services/activation', { method: 'POST', json: { email: emailField.input.value.trim() } }); if (!result.ok && result.status === 400) problems.push(result.message); else if (!result.ok) installNote = ' ' + t('setup.note_activation', 'Services activation needs attention in the workspace.'); }
    if (problems.length) { line.say(problems[0], 'bad'); save.disabled = false; return; }
    // The pending flag must actually clear — a silent failure here would loop the
    // person back into setup on their next load with no word about why.
    const done = await request('/api/settei/setup', { method: 'PUT' });
    if (!done.ok) { line.say(done.message || t('setup.err_not_recorded', 'could not record setup as finished — try Save again'), 'bad'); save.disabled = false; return; }
    const picks = [...wantAgents].filter(([, box]) => box.checked).map(([id]) => id);
    if (picks.length) {
      const already = (record.set?.wanted ?? []).filter((w) => !(w.kind === 'agent' && picks.includes(w.name)));
      await request('/api/settei/wanted', { method: 'PUT', json: { wanted: [...already, ...picks.map((name) => ({ kind: 'agent', name }))] } });
      const installed = await request('/api/install', { method: 'POST', json: { items: picks.map((name) => ({ kind: 'agent', name })) } });
      if (installed.ok && Array.isArray(installed.data)) landOn.push(...installed.data.filter((x) => x.session).map((x) => x.session)); else if (!installed.ok) installNote += ' ' + t('setup.note_installs', 'Agent installs can be retried from Configuration.');
    }
    if (ctx.modelOpts.length) { const born = await request('/api/launch', { method: 'POST', json: { behaviours: schema.seat.behaviours, name: schema.seat.name, prompt: schema.seat.prompt } }); if (born.ok && born.data?.name) landOn.push(born.data.name); }
    line.say(t('setup.saved', 'Saved. Opening RoninCoWork…') + installNote, installNote ? 'bad' : 'ok'); onDone?.({ tiles: landOn });
  });
  updateReview();
}
