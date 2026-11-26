/* part of the ronin-cowork client — see js/README.md */
/**
 * HERMES ON SETUP'S HARNESS STEP (owner, 25 Nov 2026; docs/architecture/model_services_README.md). Shows;
 * Settings edits. Three model services as stones, each ticked when set up:
 * Ronin Gateway, API key, OpenRouter. The one pressed opens below with its own model entries, never
 * another's; API key with several keys picks one. Adding or changing a model is a link to that service's
 * page in Settings v2 (model-services-surface.js); the Ronin Gateway's models are supplied.
 * Read: GET /api/model-services; anyone's write is read again on model-services-changed.
 */
import { request } from './request.js';
import { store } from './store.js';
import { openWorkbenchTab } from './workspace.js';
import { modelServicePageRequest, serviceKind } from './model-services-surface.js';
import { createTable } from './data-table.js';

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
    const sources = row(); sources.classList.add('setup-hermes-sources');
    for (const [kind, name] of SOURCES) {
      const made = stone(name, shown === kind, () => { shown = kind; paint(); });
      if (of(kind).some((s) => s.configured)) { made.prepend(el('span', 'hermes-tick', '✓')); made.setAttribute('aria-label', `${name}, set up`); }
      sources.append(made);
    }
    const parts = [el('p', '', 'Hermes runs on the Ronin Gateway, your own API key or OpenRouter. Each model entry shows under Model when you start an Agent.'), sources];

    const mine = of(shown);
    if (shown === 'private' && mine.length > 1) {
      if (!mine.some((s) => s.id === key)) key = mine[0].id;
      const keys = row();
      for (const s of mine) keys.append(stone(s.name, s.id === key, () => { key = s.id; paint(); }));
      parts.push(keys);
    }
    const service = shown === 'private' ? mine.find((s) => s.id === key) || mine[0] : mine[0];

    // Name and Model ID always, even when they match.
    const models = service?.models || [];
    const label = (m) => [m.model, ...knobs(m)].join(' · ');
    const open = () => openWorkbenchTab(modelServicePageRequest(shown, shown === 'private' ? service?.id : undefined));
    const lines = shown === 'gateway'
      ? (models.length ? [] : [['No Ronin Gateway models yet.', null]])
      : [[service?.configured ? (models.length ? '+ Add or change in Settings' : '+ Add a model in Settings') : '+ Add your key in Settings', open]];
    const table = createTable({
      headings: ['Name', 'Model ID'],
      rows: models.map((m) => ({ cells: [m.name, label(m)] })),
      lines,
    });
    const options = el('div', 'hermes-options'); options.append(el('h3', '', 'Model entries'), table);
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
