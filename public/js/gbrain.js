/* part of the tmux-ronin client — see js/README.md */
import { request } from './request.js';

const words = {
  running: '● running',
  stopped: '○ stopped',
  vm_only: 'VM only',
  network: 'network reachable',
  none: 'none',
  off: 'off',
  on: 'on',
  unknown: 'unknown',
};

const value = (v) => words[v] || String(v ?? 'unknown').replaceAll('_', ' ');

/** The service-owned gbrain commons_tab. Without its service it is never entered. */
export function buildGbrain(root, isShowing, askPersonalAssistant) {
  const head = document.createElement('div');
  head.className = 'gb-head';
  const intro = document.createElement('div');
  intro.className = 'gb-intro';
  intro.textContent = 'What is running, what can leave this VM, and what gbrain can draw from.';
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = '↻ Refresh';
  head.append(intro, refresh);

  const privacy = document.createElement('section');
  privacy.className = 'gb-card gb-privacy';
  const search = document.createElement('section');
  search.className = 'gb-card';
  const integrations = document.createElement('section');
  integrations.className = 'gb-card';
  root.append(head, privacy, search, integrations);

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
    const integrationText = connected === null ? 'unknown' : connected === 0 ? 'none' : `${connected} connected`;
    const facts = [
      ['Local gbrain process', data.process.state],
      ['Listening', data.listener.scope],
      ['External model provider', data.externalModelProvider],
      ['Integrations', connected === null ? 'unknown' : connected === 0 ? 'none' : integrationText],
      ['Public access', data.publicAccess.state],
    ];
    privacy.append(heading('Privacy and reach'));
    for (const [label, raw] of facts) privacy.append(row(label, value(raw), toneFor(raw)));

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Local details';
    const endpoint = document.createElement('p');
    endpoint.textContent = `${data.listener.address}:${data.listener.port} · gbrain ${data.process.version || 'version unknown'} · observed ${new Date(data.observedAt).toLocaleString()}`;
    details.append(summary, endpoint);
    privacy.append(details);
  };

  const renderSearch = (data) => {
    search.innerHTML = '';
    search.append(heading('Search'));
    const weightsTone = data.search.weights === 'running' ? 'good' : 'bad';
    search.append(row('Local embeddings', value(data.search.weights), weightsTone));
    // Measured or absent — a dash, never a claimed model on a box that has none.
    search.append(row('Model', data.search.model ?? '—', data.search.model ? '' : 'warn'));
    search.append(row('Dimensions', data.search.dimensions === null ? '—' : String(data.search.dimensions)));
    const retrieval = data.search.mode === 'hybrid' ? 'hybrid (keyword + semantic)' : data.search.mode === 'keyword_only' ? 'degraded — keyword only' : 'unknown';
    search.append(row('Retrieval', retrieval, toneFor(data.search.mode)));
    if (data.search.reason) search.append(row('Reason', value(data.search.reason), 'warn'));
  };

  const renderIntegrations = (data) => {
    integrations.innerHTML = '';
    integrations.append(heading('Integrations'));
    if (!data.integrationsKnown) {
      integrations.append(Object.assign(document.createElement('p'), { className: 'gb-empty', textContent: 'Integration status could not be read.' }));
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
        ask.textContent = 'Ask PersonalAssistant';
        ask.addEventListener('click', () => askPersonalAssistant(`Help me connect ${item.label} to gbrain. Explain every outside connection before asking me to approve it.`));
        el.append(ask);
      }
      integrations.append(el);
    }
    if (!ordered.length) integrations.append(Object.assign(document.createElement('p'), { className: 'gb-empty', textContent: 'No integrations were reported by gbrain.' }));
  };

  // NOT INSTALLED → the whole tab is one button (owner's ask, 2026-08-17): press Load
  // and the service's own installer runs — weights, gbrain, cabinet, wiring, shelves.
  // The button exists ONLY while gbrain is absent; once installed the panel takes over.
  let polling = null;
  const renderLoad = (data) => {
    search.innerHTML = '';
    integrations.innerHTML = '';
    privacy.innerHTML = '';
    privacy.append(heading('gbrain is not installed'));
    if (data.install.state === 'running') {
      const removing = data.install.op === 'uninstall';
      privacy.append(
        row(
          removing ? 'Removing' : 'Installing',
          removing ? 'running — units, wiring, shelves (your brain repo is kept)' : 'running — weights, gbrain, cabinet, wiring',
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
      privacy.append(row(data.install.op === 'uninstall' ? 'Remove' : 'Install', 'failed — the log below says where', 'bad'));
      const log = document.createElement('pre');
      log.className = 'gb-log';
      log.textContent = data.install.log.join('\n');
      privacy.append(log);
    } else {
      privacy.append(
        Object.assign(document.createElement('p'), {
          className: 'gb-empty',
          textContent:
            'One press installs everything: the local embedding weights, gbrain itself (pinned), your brain repo, the server, and the session wiring. Downloads come from github.com and huggingface.co; nothing else leaves the VM.',
        }),
      );
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = data.install.state === 'failed' && data.install.op !== 'uninstall' ? 'Retry install' : 'Load gbrain';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await request('/api/gbrain/install', { method: 'POST', json: {} });
      load();
    });
    privacy.append(btn);
  };

  // The way back out (owner's ask, 2026-08-17): removing is a press too — a quiet one,
  // at the foot of the panel, and it says out loud that the brain repo is kept.
  const renderRemove = () => {
    const el = document.createElement('div');
    el.className = 'gb-remove';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Remove gbrain…';
    btn.addEventListener('click', async () => {
      const sure = window.confirm(
        'Remove gbrain from this machine? The server, tokens, wiring and shelves go; your brain repo and its pages are KEPT.',
      );
      if (!sure) return;
      btn.disabled = true;
      await request('/api/gbrain/uninstall', { method: 'POST', json: {} });
      load();
    });
    el.append(btn);
    return el;
  };

  const load = async () => {
    refresh.disabled = true;
    refresh.textContent = 'checking…';
    const r = await request('/api/gbrain');
    refresh.disabled = false;
    refresh.textContent = '↻ Refresh';
    if (!r.ok) {
      privacy.innerHTML = '';
      privacy.append(row('gbrain status', r.message, 'bad'));
      search.innerHTML = '';
      integrations.innerHTML = '';
      return;
    }
    if (!r.data.installed || r.data.install.state === 'running') {
      renderLoad(r.data);
      return;
    }
    if (polling) {
      clearInterval(polling);
      polling = null;
    }
    renderPrivacy(r.data);
    renderSearch(r.data);
    renderIntegrations(r.data);
    integrations.append(renderRemove());
  };
  refresh.addEventListener('click', load);

  return { enter: () => void load(), isShowing };
}
