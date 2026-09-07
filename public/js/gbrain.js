/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { t } from './lexicon.js';
import { gbrainAssistantPrompt, gbrainSetupModel } from './gbrain-setup-state.js';

// A function, not a table: the lexicon loads after this module is evaluated.
function words() {
  return {
    running: t('gbrain.running', '● running'),
    stopped: t('gbrain.stopped', '○ stopped'),
    vm_only: t('gbrain.vm_only', 'VM only'),
    network: t('gbrain.network', 'network reachable'),
    none: t('gbrain.none', 'none'),
    off: t('gbrain.off', 'off'),
    on: t('gbrain.on', 'on'),
    unknown: t('gbrain.unknown', 'unknown'),
  };
}

function value(v) {
  return words()[v] || String(v ?? 'unknown').replaceAll('_', ' ');
}

/**
 * The service-owned gbrain commons_tab. Without its service it is never entered.
 * `options.presentation === 'setup'` is the Ronin Setup work surface instead: the same
 * reads and presses, painted from gbrain-setup-state.js as one status and one action.
 */
export function buildGbrain(root, isShowing, askPersonalAssistant, options = {}) {
  const setup = options.presentation === 'setup';
  const head = document.createElement('div');
  head.className = 'gb-head';
  const intro = document.createElement('div');
  intro.className = 'gb-intro';
  intro.textContent = t('gbrain.intro', 'What is running, what can leave this VM, and what gbrain can draw from.');
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = t('gbrain.refresh', '↻ Refresh');
  head.append(intro, refresh);

  const privacy = document.createElement('section');
  privacy.className = 'gb-card gb-privacy';
  const search = document.createElement('section');
  search.className = 'gb-card';
  const integrations = document.createElement('section');
  integrations.className = 'gb-card';
  if (!setup) root.append(head, privacy, search, integrations);

  const heading = (text) => Object.assign(document.createElement('h3'), { textContent: text });
  const row = (label, text, tone = '') => {
    const el = document.createElement('div');
    el.className = `gb-row ${tone}`.trim();
    el.append(
      Object.assign(document.createElement('span'), { textContent: label }),
      Object.assign(document.createElement('strong'), { textContent: text }),
    );
    return el;
  };
  const toneFor = (v) => (['running', 'vm_only', 'none', 'off', 'hybrid'].includes(v) ? 'good' : ['unknown'].includes(v) ? 'warn' : 'bad');

  const renderPrivacy = (data) => {
    privacy.innerHTML = '';
    const connected = data.integrationsKnown
      ? data.integrations.filter((x) => x.state === 'connected').length
      : null;
    const integrationText = connected === null ? 'unknown' : connected === 0 ? 'none' : t('gbrain.n_connected', '{n} connected', { n: connected });
    const facts = [
      [t('gbrain.process', 'Local gbrain process'), data.process.state],
      [t('gbrain.listening', 'Listening'), data.listener.scope],
      [t('gbrain.provider', 'External model provider'), data.externalModelProvider],
      [t('gbrain.integrations', 'Integrations'), connected === null ? 'unknown' : connected === 0 ? 'none' : integrationText],
      [t('gbrain.public_access', 'Public access'), data.publicAccess.state],
    ];
    privacy.append(heading(t('gbrain.privacy_head', 'Privacy and reach')));
    for (const [label, raw] of facts) privacy.append(row(label, value(raw), toneFor(raw)));

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = t('gbrain.details', 'Local details');
    const endpoint = document.createElement('p');
    endpoint.textContent = t('gbrain.endpoint', '{address}:{port} · gbrain {version} · observed {time}', { address: data.listener.address, port: data.listener.port, version: data.process.version || t('gbrain.version_unknown', 'version unknown'), time: new Date(data.observedAt).toLocaleString() });
    details.append(summary, endpoint);
    privacy.append(details);
  };

  const renderSearch = (data) => {
    search.innerHTML = '';
    search.append(heading(t('gbrain.search_head', 'Search')));
    const weightsTone = data.search.weights === 'running' ? 'good' : 'bad';
    search.append(row(t('gbrain.embeddings', 'Local embeddings'), value(data.search.weights), weightsTone));
    // Measured or absent — a dash, never a claimed model on a box that has none.
    search.append(row(t('gbrain.model', 'Model'), data.search.model ?? '—', data.search.model ? '' : 'warn'));
    search.append(row(t('gbrain.dimensions', 'Dimensions'), data.search.dimensions === null ? '—' : String(data.search.dimensions)));
    const retrieval = data.search.mode === 'hybrid' ? t('gbrain.retrieval_hybrid', 'hybrid (keyword + semantic)') : data.search.mode === 'keyword_only' ? t('gbrain.retrieval_keyword', 'degraded — keyword only') : t('gbrain.unknown', 'unknown');
    search.append(row(t('gbrain.retrieval', 'Retrieval'), retrieval, toneFor(data.search.mode)));
    const answers = data.search.answers?.state === 'on'
      ? t('gbrain.answers_on', 'gbrain composition available')
      : data.search.answers?.state === 'off'
        ? t('gbrain.answers_off', 'composed by the agent (by design)')
        : t('gbrain.unknown', 'unknown');
    search.append(row(t('gbrain.answers', 'Answers'), answers, data.search.answers?.state === 'unknown' ? 'warn' : 'good'));
    if (data.search.reason) search.append(row(t('gbrain.reason', 'Reason'), value(data.search.reason), 'warn'));
  };

  const renderIntegrations = (data) => {
    integrations.innerHTML = '';
    integrations.append(heading(t('gbrain.integrations', 'Integrations')));
    if (!data.integrationsKnown) {
      integrations.append(Object.assign(document.createElement('p'), { className: 'gb-empty', textContent: t('gbrain.integrations_unread', 'Integration status could not be read.') }));
      return;
    }
    const ordered = [...data.integrations].sort((a, b) => Number(a.state !== 'connected') - Number(b.state !== 'connected'));
    for (const item of ordered) {
      const el = document.createElement('div');
      el.className = 'gb-integration';
      const copy = document.createElement('div');
      const name = Object.assign(document.createElement('b'), { textContent: item.label });
      const desc = Object.assign(document.createElement('small'), { textContent: item.description });
      copy.append(name, desc);
      const state = Object.assign(document.createElement('span'), { className: `gb-state ${item.state}`, textContent: value(item.state) });
      el.append(copy, state);
      if (item.state !== 'connected') {
        const ask = document.createElement('button');
        ask.type = 'button';
        ask.textContent = t('gbrain.ask_assistant', 'Ask PersonalAssistant');
        ask.addEventListener('click', () => askPersonalAssistant(`Help me connect ${item.label} to gbrain. Explain every outside connection before asking me to approve it.`));
        el.append(ask);
      }
      integrations.append(el);
    }
    if (!ordered.length) integrations.append(Object.assign(document.createElement('p'), { className: 'gb-empty', textContent: 'No integrations were reported by gbrain.' }));
  };

  // and the service's own installer runs — weights, gbrain, cabinet, wiring, shelves.
  // The button exists ONLY while gbrain is absent; once installed the panel takes over.
  let polling = null;
  const stopPolling = () => { if (polling) { clearInterval(polling); polling = null; } };

  // THE SETUP WORK SURFACE. Value first, then one measured status with one next sentence
  // and at most one action, then the measured rows when there is something to measure.
  // Every fact is the snapshot's own; every press is the same route the commons tab uses.
  const renderSetup = (result) => {
    const model = gbrainSetupModel(result, options.availability?.());
    if (model.summary) options.onState?.(model.summary, model);
    if (model.polling && !polling) polling = setInterval(() => { if (isShowing()) void load(); else stopPolling(); }, 3000);
    if (!model.polling) stopPolling();
    const make = (tag, className, text) => {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (text != null) el.textContent = text;
      return el;
    };
    const wrap = make('section', 'setup-gbrain-compact');
    wrap.dataset.state = model.state;

    const lockup = make('header', 'setup-gbrain-lockup');
    const glyph = make('i', 'setup-gbrain-glyph', '◇');
    glyph.setAttribute('aria-hidden', 'true');
    const identity = make('div', 'setup-gbrain-identity');
    const credit = make('a', 'setup-gbrain-credit', t('gbrain.setup_credit', 'Open-source agent memory by Garry Tan ↗'));
    credit.href = 'https://github.com/garrytan/gbrain';
    credit.target = '_blank';
    credit.rel = 'noopener noreferrer';
    identity.append(make('h2', '', t('pane.gbrain', 'gbrain')), make('p', 'setup-lede', t('gbrain.setup_intro', 'A shared, searchable memory for your Agents.')), credit);
    lockup.append(glyph, identity);

    const benefits = make('div', 'setup-gbrain-benefits');
    for (const [head, copy] of [
      [t('gbrain.setup_find', 'Find by meaning'), t('gbrain.setup_find_copy', 'Notes, decisions, and history come back by what they mean, not only by exact words.')],
      [t('gbrain.setup_recall', 'Shared recall'), t('gbrain.setup_recall_copy', 'Every connected Agent reads and files into the same memory.')],
      [t('gbrain.setup_local', 'Stays local'), t('gbrain.setup_local_copy', 'Local embeddings and a local process. Outside connections open only when you approve one.')],
    ]) {
      const item = make('div', 'setup-gbrain-benefit');
      item.append(make('h3', '', head), make('p', '', copy));
      benefits.append(item);
    }

    const status = make('section', 'setup-gbrain-status');
    status.dataset.tone = model.tone;
    status.setAttribute('aria-live', 'polite');
    status.append(make('p', 'setup-gbrain-status-line', model.status), make('p', 'setup-gbrain-next', model.next));
    wrap.append(lockup, benefits, status);

    if (model.log?.length) {
      const log = make('details', 'setup-gbrain-log');
      log.append(make('summary', '', t('gbrain.setup_install_log', 'Install log')), make('pre', '', model.log.join('\n')));
      wrap.append(log);
    }
    if (model.action) {
      const button = make('button', 'wk-action', model.action.label);
      button.type = 'button';
      button.dataset.action = model.action.id;
      button.addEventListener('click', async () => {
        if (model.action.id === 'open_services') { options.openServices?.(); return; }
        if (model.action.id === 'start_assistant' || model.action.id === 'check_assistant') { askPersonalAssistant(gbrainAssistantPrompt(model.state)); return; }
        button.disabled = true;
        if (model.action.id === 'load' || model.action.id === 'retry') await request('/api/gbrain/install', { method: 'POST', json: {} });
        void load();
      });
      wrap.append(button);
    }
    if (model.facts.length) {
      const facts = make('section', 'setup-gbrain-facts');
      const list = make('dl');
      for (const [label, text, tone] of model.facts) {
        const dd = make('dd', '', text);
        if (tone) dd.dataset.tone = tone;
        list.append(make('dt', '', label), dd);
      }
      facts.append(make('h3', '', t('gbrain.setup_measured', 'Measured now')), list);
      const observed = make('p', 'setup-fine setup-gbrain-observed');
      const time = model.observedAt ? new Date(model.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const recheck = make('button', 'setup-gbrain-recheck', t('gbrain.check_again', 'Check again'));
      recheck.type = 'button';
      recheck.addEventListener('click', () => { recheck.disabled = true; void load(); });
      observed.append(make('span', '', time ? t('gbrain.setup_observed', 'Observed {time}', { time }) : ''), recheck);
      facts.append(observed);
      wrap.append(facts);
    }
    wrap.append(make('p', 'setup-fine setup-gbrain-gate', t('gbrain.setup_gate', 'The Personal Assistant preset waits for gbrain to be active.')));
    root.replaceChildren(wrap);
  };

  const renderLoad = (data) => {
    search.innerHTML = '';
    integrations.innerHTML = '';
    privacy.innerHTML = '';
    privacy.append(heading(t('gbrain.not_installed', 'gbrain is not installed')));
    if (data.install.state === 'running') {
      const removing = data.install.op === 'uninstall';
      privacy.append(
        row(
          removing ? t('gbrain.removing', 'Removing') : t('gbrain.installing', 'Installing'),
          removing ? t('gbrain.removing_detail', 'running — units, wiring, shelves (your brain repo is kept)') : t('gbrain.installing_detail', 'running — weights, gbrain, cabinet, wiring'),
          'warn',
        ),
      );
      const log = document.createElement('pre');
      log.className = 'gb-log';
      log.textContent = data.install.log.join('\n');
      privacy.append(log);
      if (!polling) polling = setInterval(load, 3000);
      return;
    }
    if (polling) {
      clearInterval(polling);
      polling = null;
    }
    if (data.install.state === 'failed') {
      privacy.append(row(data.install.op === 'uninstall' ? t('gbrain.remove', 'Remove') : t('gbrain.install', 'Install'), t('gbrain.failed_detail', 'failed — the log below says where'), 'bad'));
      const log = document.createElement('pre');
      log.className = 'gb-log';
      log.textContent = data.install.log.join('\n');
      privacy.append(log);
    } else {
      privacy.append(
        Object.assign(document.createElement('p'), {
          className: 'gb-empty',
          textContent:
            t('gbrain.install_pitch', 'One press installs everything: the local embedding weights, gbrain itself (pinned), your brain repo, the server, and the session wiring. Downloads come from github.com and huggingface.co; nothing else leaves the VM.'),
        }),
      );
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = data.install.state === 'failed' && data.install.op !== 'uninstall' ? t('gbrain.retry_install', 'Retry install') : t('gbrain.load', 'Load gbrain');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await request('/api/gbrain/install', { method: 'POST', json: {} });
      load();
    });
    privacy.append(btn);
  };

  // at the foot of the panel, and it says out loud that the brain repo is kept.
  const renderRemove = () => {
    const el = document.createElement('div');
    el.className = 'gb-remove';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = t('gbrain.remove_button', 'Remove gbrain…');
    btn.addEventListener('click', async () => {
      const sure = window.confirm(
        t('gbrain.remove_confirm', 'Remove gbrain from this machine? The server, tokens, wiring and shelves go; your brain repo and its pages are KEPT.'),
      );
      if (!sure) return;
      btn.disabled = true;
      await request('/api/gbrain/uninstall', { method: 'POST', json: {} });
      load();
    });
    el.append(btn);
    return el;
  };

  // Setup paints before the read and keeps the last paint until the next read lands, so
  // the body is never empty; an older slow read never overwrites a newer one.
  let reads = 0;
  const load = async () => {
    if (setup) {
      if (!root.querySelector('.setup-gbrain-compact')) renderSetup(undefined);
      const mine = ++reads;
      const result = await request('/api/gbrain');
      if (mine === reads) renderSetup(result);
      return;
    }
    refresh.disabled = true;
    refresh.textContent = t('gbrain.checking', 'checking…');
    const r = await request('/api/gbrain');
    refresh.disabled = false;
    refresh.textContent = t('gbrain.refresh', '↻ Refresh');
    if (!r.ok) {
      privacy.innerHTML = '';
      privacy.append(row(t('gbrain.status', 'gbrain status'), r.message, 'bad'));
      search.innerHTML = '';
      integrations.innerHTML = '';
      return;
    }
    if (!r.data.installed || r.data.install.state === 'running') {
      renderLoad(r.data);
      return;
    }
    stopPolling();
    renderPrivacy(r.data);
    renderSearch(r.data);
    renderIntegrations(r.data);
    integrations.append(renderRemove());
  };
  refresh.addEventListener('click', load);

  return { enter: () => void load(), isShowing };
}
