/* part of the ronin-cowork client — see js/README.md */
/**
 * ONE MODEL PROVIDERS SURFACE, TWO SEATS. Ronin Setup's Model providers card and Ronin
 * Settings' Model providers card open this same surface: one definition under one type,
 * registered by both workbenches. Its first face is an inventory of equal stones on the
 * shared stone work surface — one per CLI the registry knows, each wearing its short
 * measured state, then any catalog provider no registry CLI serves — mounted straight on
 * the surface content so the stone seat owns every inset exactly as Presets does. The
 * header says which catalog copy is shown and when it was updated (a snapshot, not live
 * data) and when this machine was last measured.
 *
 * Choosing a stone opens that provider beside the rail, top to bottom:
 *   1. YOURS — the three numbered steps (install · authenticate with the native sign-in
 *      tile, Done and Close · ready), read from the runtime row alone
 *      (setup-provider-state.js). The sign-in tile is mounted through the workbench
 *      environment's `mountProviderSetupSession` (provider-setup-session.js), so it works
 *      on either seat.
 *   2. THE CATALOG — the three measured facts, dated, then every model the catalog lists
 *      for this provider: tier, cost as read, good at, not good at, the default marked.
 *
 * This surface is the one client that measures: showing it probes the machine
 * (POST /api/setup/providers/measure) and writes the Campaign's dated provider summary,
 * which every other reader then takes from the record; the catalog rows come from the one
 * picker's read (form-steps.js), so this surface and every picker cannot disagree.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { loadProviderCatalog, providerCatalog, tierWord } from './form-steps.js';
import { mountProviderAttachment, providerFromRuntime, providerPresentation, providerReadiness } from './setup-provider-state.js';

const el = (tag, cls = '', text = null) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };

/** The one type, on both workbenches. */
export const PROVIDER_SURFACE_TYPE = 'setup.providers';

export function providerSurfaceDefinition() {
  return {
    type: PROVIDER_SURFACE_TYPE,
    header: 'surface',
    groupKey: PROVIDER_SURFACE_TYPE,
    label: () => t('setup_surface.providers', 'Model providers'),
    summary: () => providersSummary(providerCatalog()),
    create: (context) => createProviderSurface(context),
  };
}

/** The card's line on both seats: the catalog's counts, this machine's, and the catalog's date. */
export function providersSummary(catalog) {
  if (!catalog?.loaded) return t('setup_surface.providers_summary_unread', 'Every provider and model Ronin offers, and what this machine has.');
  const rows = catalog.rows;
  const providers = new Set(rows.map((row) => row.provider)).size;
  const activated = new Set(rows.filter((row) => row.operational).map((row) => row.provider)).size;
  const counts = t('setup_surface.providers_summary', '{providers} providers · {models} models · {activated} activated here', { providers, models: rows.length, activated });
  return catalog.updated ? t('setup_surface.providers_summary_dated', '{counts} · catalog updated {date}', { counts, date: catalog.updated }) : counts;
}

/** THE CATALOG IS A SNAPSHOT, NOT LIVE DATA: one line saying which copy and its date. */
export function catalogLine(catalog) {
  const date = catalog?.updated || t('setup_surface.catalog_undated', 'date not stated');
  return catalog?.origin === 'user'
    ? t('setup_surface.catalog_yours', 'Your catalog copy, updated {date}.', { date })
    : t('setup_surface.catalog_stock', 'Catalog updated {date} · prices and models as read then; refreshed with each Ronin update.', { date });
}

export function createProviderSurface(context) {
  const out = WorkspaceKit.primitives.createSurface({ label: t('setup_surface.providers', 'Model providers'), className: 'setup-surface setup-provider-surface' });
  const action = (label, kind, onClick) => { const made = WorkspaceKit.primitives.createAction({ label, kind, action: onClick }); return made.el ?? made; };
  const yesNo = (on) => (on ? t('setup_surface.yes', 'yes') : t('setup_surface.no', 'no'));
  const when = (stamp) => { const date = new Date(stamp); return Number.isNaN(date.getTime()) ? String(stamp) : date.toLocaleString(); };
  const intro = el('div', 'setup-provider-intro');
  const snapshot = el('p', 'setup-fine setup-provider-snapshot');
  const measured = el('p', 'setup-fine setup-provider-measured');
  intro.append(el('p', 'setup-fine', t('setup_surface.providers_help', 'Every model provider and model Ronin offers, from the catalog: tier, cost as read, what each is good at and not. Installed, signed in and activated are what this machine measured.')), snapshot, measured);
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  let opened = String(context.detail?.provider || context.detail?.key || '');
  let mounted = null;
  let runtime = { providers: [] };
  const disposeMount = (destroy = true) => {
    if (!mounted) return;
    if (destroy) mounted.destroy?.(); else mounted.park?.();
    mounted = null;
  };
  const measuredLine = () => {
    const stamp = providerCatalog().measured_at || runtime?.measured_at || '';
    return stamp
      ? t('setup_surface.providers_measured', 'This machine was measured {when}; opening this surface measures it again.', { when: when(stamp) })
      : t('setup_surface.providers_unmeasured', 'This machine has not been measured yet.');
  };
  /** A catalog provider no registry CLI serves is a stone of its own, keyed by its vendor id. */
  const catalogOnly = () => {
    const known = new Set((runtime.providers || []).map((provider) => provider?.id));
    const rows = providerCatalog().rows;
    return rows.filter((row, index) => !known.has(row.cli) && rows.findIndex((other) => other.provider === row.provider) === index);
  };

  /* ---- 1 · YOURS: the three steps, exactly as the runtime row measures them ---- */
  const paintYours = (provider, host) => {
    const steps = providerReadiness(provider);
    const [install, auth, ready] = steps;
    const card = el('article', 'setup-provider');
    card.dataset.provider = provider.id;
    const head = el('header', 'setup-provider-head');
    head.append(el('h2', '', provider.label || provider.id));
    if (provider.from) head.append(el('p', 'setup-provider-from', t('setup_surface.provider_from', 'From {vendor}', { vendor: provider.from })));
    const flow = el('ol', 'setup-provider-steps');
    // What the last press answered when it failed; the only way a server refusal is seen.
    const problem = el('p', 'setup-notice bad setup-provider-problem'); problem.hidden = true;
    const press = async (path, after = paint) => {
      const result = await request(path, { method: 'POST', json: {} });
      if (!result.ok) { problem.textContent = result.message; problem.hidden = false; return; }
      await after();
    };
    // One shape for all three steps: a mark that says done, current, or pending; the label
    // with its measured state beside it; at most one short line; then a control of one size.
    // Only the current step's control is the kaki primary.
    const stepRow = (step, state) => {
      const item = el('li', 'setup-provider-step');
      item.dataset.step = step.key; item.dataset.status = step.status;
      item.dataset.done = String(step.done === true); item.dataset.current = String(step.current === true);
      const mark = el('span', 'setup-provider-mark', step.done ? '✓' : String(steps.indexOf(step) + 1));
      mark.setAttribute('aria-hidden', 'true');
      const copy = el('div', 'setup-provider-copy');
      const title = el('div', 'setup-provider-title');
      title.append(el('strong', 'setup-provider-label', step.label), el('span', 'setup-provider-state', state));
      copy.append(title);
      if (step.detail) copy.append(el('p', 'setup-provider-note', step.detail));
      if (step.command) copy.append(el('code', 'setup-provider-command', step.command));
      const controls = el('div', 'setup-provider-control');
      item.append(mark, copy, controls);
      flow.append(item);
      return { item, controls };
    };
    const control = (step, label, onClick) => {
      const made = action(label, step.current ? 'primary' : '', onClick);
      made.classList.add('setup-provider-action');
      return made;
    };
    // Only the current step owns a control. A done step is a quiet fact and a waiting
    // step says what it waits for; neither carries a dead button.
    const installRow = stepRow(install, install.status === 'installed'
      ? t('setup_surface.installed', 'Installed')
      : install.action === 'manual' ? t('setup_surface.manual_install', 'Manual install') : t('setup_surface.not_installed', 'Not installed'));
    if (install.current && install.action === 'manual' && install.manual) {
      const link = el('a', 'wk-action setup-provider-action setup-provider-manual', install.manual.label);
      link.href = install.manual.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      installRow.controls.append(link);
    } else if (install.current && install.action === 'install' && provider.installable) {
      installRow.controls.append(control(install, t('setup_surface.install', 'Install'), async () => {
        const result = await request('/api/install', { method: 'POST', json: { items: [{ kind: 'agent', name: provider.id }] } });
        if (!result.ok) { problem.textContent = result.message; problem.hidden = false; return; }
        await paint();
      }));
    }
    const authRow = stepRow(auth, auth.status === 'recorded'
      ? t('setup_surface.signed_in', 'Signed in')
      : auth.status === 'open' ? t('setup_surface.sign_in_open', 'Sign-in open')
        : auth.status === 'available' ? t('setup_surface.not_signed_in', 'Not signed in') : t('setup_surface.install_first', 'After install'));
    if (auth.current && auth.action !== 'login_open') {
      authRow.controls.append(control(auth, t('setup_surface.authenticate', 'Authenticate'), () => press(`/api/setup/providers/${encodeURIComponent(provider.id)}/login`)));
    } else if (auth.action === 'login_open') {
      const terminal = el('div', 'setup-provider-terminal');
      const done = control(auth, t('setup_surface.done', 'Done'), () => { mounted?.park?.(); return press(`/api/setup/providers/${encodeURIComponent(provider.id)}/done`); });
      const close = action(t('setup_surface.close', 'Close'), '', () => { mounted?.park?.(); return press(`/api/setup/providers/${encodeURIComponent(provider.id)}/close`); });
      close.classList.add('setup-provider-action');
      authRow.controls.append(done, close);
      authRow.item.append(terminal);
      mounted = mountProviderAttachment(context.environment, terminal, provider, context.workspace, () => void paint());
      if (!mounted) terminal.append(el('p', 'setup-notice bad', t('setup_surface.login_attachment_missing', 'The native setup session is open but its terminal attachment is unavailable.')));
    }
    stepRow(ready, ready.status === 'ready' ? t('setup_surface.ready_launch', 'Activated for Launch') : t('setup_surface.not_ready', 'Not yet'));
    card.append(head, flow, problem);
    host.append(card);
  };

  /* ---- 2 · THE CATALOG: the facts as measured, dated, then every model the catalog lists ---- */
  const paintCatalog = (rows, entry, host) => {
    const section = el('section', 'setup-provider-catalog');
    const catalog = providerCatalog();
    section.append(el('h3', 'setup-provider-eyebrow', catalog.updated
      ? t('setup_surface.section_catalog_dated', 'The catalog · updated {date}', { date: catalog.updated })
      : t('setup_surface.section_catalog', 'The catalog')));
    const facts = el('dl', 'setup-provider-facts');
    for (const [label, on] of [
      [t('setup_surface.fact_installed', 'Installed'), entry?.installed === true],
      [t('setup_surface.fact_signed_in', 'Signed in'), entry?.signed_in === true],
      [t('setup_surface.fact_activated', 'Activated'), entry?.activated === true],
    ]) { const fact = el('div'); fact.dataset.on = String(on); fact.append(el('dt', null, label), el('dd', null, yesNo(on))); facts.append(fact); }
    section.append(facts, el('p', 'setup-fine', measuredLine()));
    if (!rows.length) { section.append(el('p', 'setup-fine', t('setup_surface.no_models', 'The catalog lists no models for this provider.'))); host.append(section); return; }
    const table = el('table', 'setup-provider-models');
    const headRow = el('tr');
    for (const text of [t('setup_surface.col_model', 'Model'), t('setup_surface.col_tier', 'Tier'), t('setup_surface.col_cost', 'Cost'), t('setup_surface.col_good_at', 'Good at'), t('setup_surface.col_not_good_at', 'Not good at')]) headRow.append(el('th', null, text));
    const thead = el('thead'); thead.append(headRow);
    const body = el('tbody');
    for (const row of rows) {
      const line = el('tr');
      line.dataset.model = row.model; line.dataset.tier = row.tier;
      const name = el('td'); name.append(el('b', null, row.model));
      if (row.default) name.append(el('span', 'setup-provider-default', t('setup_surface.model_default_mark', 'the default')));
      line.append(name, el('td', 'setup-provider-tier', tierWord(row.tier)), el('td', null, row.cost || ''), el('td', null, row.good_at || ''), el('td', null, row.not_good_at || ''));
      body.append(line);
    }
    table.append(thead, body);
    const scroll = el('div', 'setup-provider-table'); scroll.append(table);
    section.append(scroll);
    host.append(section);
  };

  const paintProvider = (id, host) => {
    const provider = providerFromRuntime(runtime, id);
    const rows = providerCatalog().rows.filter((row) => (provider ? row.cli === provider.id : row.provider === id));
    if (!provider && !rows.length) { host.append(el('p', 'setup-notice bad', t('setup_surface.provider_missing', 'This provider is no longer in the model-provider catalog.'))); return null; }
    const yours = el('section', 'setup-provider-yours');
    yours.append(el('h3', 'setup-provider-eyebrow', t('setup_surface.section_yours', 'Yours')));
    if (provider) paintYours(provider, yours);
    else {
      yours.append(el('h2', '', rows[0].provider_label), el('p', 'setup-fine', t('setup_surface.no_cli', 'No CLI in Ronin’s registry serves this provider, so it cannot be installed or signed in here.')));
    }
    host.append(yours);
    paintCatalog(rows, provider, host);
    return () => disposeMount();
  };

  const stones = createStoneWorkSurface({
    selectedId: opened,
    className: 'setup-provider-stones',
    renderDetail: (item, host) => paintProvider(item.id, host),
    onSelectionChange: (id) => { opened = String(id || ''); },
  });
  stones.mount(out.content, { before: [intro], after: [notice] });
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const paint = async () => {
    // This surface is the one reader that measures: every other surface takes the
    // Campaign's recorded summary from GET /api/setup/runtime — which the catalog read
    // below takes too, after the measurement has been written.
    const result = await request('/api/setup/providers/measure', { method: 'POST', json: {} });
    disposeMount();
    if (!result.ok) { stones.setItems([]); say(result.message, true); return; }
    runtime = result.data;
    context.environment.setupRuntime = runtime;
    await loadProviderCatalog();
    context.workbench?.refreshSelector?.();
    snapshot.textContent = catalogLine(providerCatalog());
    measured.textContent = measuredLine();
    const rows = providerCatalog().rows;
    const providers = (Array.isArray(runtime.providers) ? runtime.providers : []).filter((provider) => provider?.id);
    const stoneOf = (id, label, secondary, state, activated) => ({ id, label, secondary, state, className: 'setup-provider-stone', attrs: { 'data-provider': id, 'data-activated': String(activated) } });
    const items = [
      ...providers.map((provider) => {
        const own = rows.filter((row) => row.cli === provider.id);
        const vendor = own[0]?.provider_label || provider.from || '';
        return stoneOf(String(provider.id), provider.label || provider.id, own.length ? t('setup_surface.provider_models_n', '{vendor} · {n} models', { vendor, n: own.length }) : vendor, providerPresentation(provider).inventoryState, provider.activated === true);
      }),
      ...catalogOnly().map((row) => stoneOf(row.provider, row.provider_label, t('setup_surface.provider_models_n', '{vendor} · {n} models', { vendor: row.provider_label, n: rows.filter((item) => item.provider === row.provider).length }), t('setup_surface.no_cli_state', 'No CLI'), false)),
    ];
    say(items.length ? '' : t('setup_surface.no_catalog', 'No model providers are in the catalog on this machine.'));
    stones.setItems(items);
  };
  return { el: out.el, show: paint, destroy: () => { disposeMount(); stones.destroy(); } };
}
