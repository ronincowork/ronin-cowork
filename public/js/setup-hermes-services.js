/* part of the ronin-cowork client — see js/README.md */
/**
 * HERMES ON SETUP'S HARNESS STEP (owner, 25 Nov 2026; samurai_lab wip/MACHINE_SETTINGS_V2.md "Service
 * pages in Settings"). Shows; Settings v2 edits. Three model services as stones, each ticked when set up:
 * Ronin Gateway, API key, OpenRouter. The one pressed opens below with its own model options, never
 * another's; API key with several keys picks one. Adding or changing a model is a link to that service's
 * page in Settings v2 (model-services-surface.js); the Ronin Gateway's models are supplied.
 * Read: GET /api/model-services; anyone's write is read again on model-services-changed.
 */
import { request } from './request.js';
import { store } from './store.js';
import { openWorkbenchTab } from './workspace.js';
import { modelServicePageRequest, serviceKind } from './model-services-surface.js';

const el = (tag, cls = '', text = null) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };
const stone = (name, pressed, fn) => {
  const out = el('button', 'ask-opt ask-rect');
  out.type = 'button';
  out.append(el('span', 'ask-name', name));
  out.setAttribute('aria-selected', String(pressed)); // the kit's "the one you are on" (ask.css)
  out.addEventListener('click', fn);
  return out;
};
const row = () => { const out = el('div', 'ask setup-harness-row setup-harness-ways'); out.dataset.density = 'tight'; return out; };
const SOURCES = [['gateway', 'Ronin Gateway'], ['private', 'API key'], ['openrouter', 'OpenRouter']];
// Reasoning and approvals beside the model only when they are not the defaults.
const knobs = (m) => [m.reasoning && m.reasoning !== 'default' ? `${m.reasoning[0].toUpperCase()}${m.reasoning.slice(1)} reasoning` : '', m.approvals === 'prompt' ? 'Asks for approval' : ''].filter(Boolean);

export function mountHermesServices(host) {
  let services = [];
  let shown = 'gateway';
  let key = ''; // the API key open, when there are several
  let disposed = false;
  const root = el('section', 'hermes-settings'); host.append(root);

  const paint = () => {
    if (disposed) return;
    const of = (kind) => services.filter((s) => serviceKind(s) === kind);
    const sources = row();
    for (const [kind, name] of SOURCES) {
      const made = stone(name, shown === kind, () => { shown = kind; paint(); });
      if (of(kind).some((s) => s.configured)) { made.prepend(el('span', 'hermes-tick', '✓')); made.setAttribute('aria-label', `${name}, set up`); }
      sources.append(made);
    }
    const parts = [el('p', '', 'Hermes runs on the Ronin Gateway, your own API key or OpenRouter. Each model option shows under Model when you start an Agent.'), sources];

    const mine = of(shown);
    if (shown === 'private' && mine.length > 1) {
      if (!mine.some((s) => s.id === key)) key = mine[0].id;
      const keys = row();
      for (const s of mine) keys.append(stone(s.name, s.id === key, () => { key = s.id; paint(); }));
      parts.push(keys);
    }
    const service = shown === 'private' ? mine.find((s) => s.id === key) || mine[0] : mine[0];

    const table = el('table', 'hermes-table');
    const head = el('tr'); head.append(el('th', '', 'Name'), el('th', '', 'Model'));
    const thead = el('thead'); thead.append(head);
    const body = el('tbody');
    for (const m of service?.models || []) {
      const tr = el('tr'); tr.append(el('th', '', m.name), el('td', '', [m.model, ...knobs(m)].join(' · '))); body.append(tr);
    }
    const count = service?.models?.length || 0;
    if (shown !== 'gateway' || !count) {
      const tr = el('tr', 'hermes-add'); const cell = el('td'); cell.colSpan = 2;
      if (shown === 'gateway') cell.append(el('span', 'hermes-add-note', 'No Ronin Gateway models yet.'));
      else {
        const go = el('button', 'hermes-add-line', service?.configured ? (count ? '+ Add or change in Settings' : '+ Add a model in Settings') : '+ Add your key in Settings');
        go.type = 'button';
        go.addEventListener('click', () => openWorkbenchTab(modelServicePageRequest(shown, shown === 'private' ? service?.id : undefined)));
        cell.append(go);
      }
      tr.append(cell); body.append(tr);
    }
    table.append(thead, body);
    const options = el('div', 'hermes-options'); options.append(el('h3', '', 'Model options'), table);
    root.replaceChildren(...parts, options);
  };

  const read = async () => {
    const result = await request('/api/model-services', { cache: 'no-store' });
    if (disposed) return;
    if (!result.ok) { root.replaceChildren(el('p', '', result.message)); return; }
    services = Array.isArray(result.data.services) ? result.data.services : [];
    paint();
  };
  const off = store.listen('model-services-changed', () => { void read(); });
  void read();
  return () => { disposed = true; off(); };
}
