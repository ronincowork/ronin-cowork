/* part of the ronin-cowork client — see js/README.md */
/**
 * ONE MODEL PROVIDERS SURFACE, TWO SEATS. Ronin Setup's Model providers card and Ronin
 * Settings' Model providers card open this same surface: one definition under one type,
 * registered by both workbenches. Its first face is an inventory of equal stones on the
 * shared stone work surface — one per CLI the registry knows, each wearing its short
 * measured state, then any catalog provider no registry CLI serves — mounted straight on
 * the surface content so the stone seat owns every inset exactly as Presets does. The
 * footer keeps the catalog research date and this machine's measurement date available
 * behind a short disclosure.
 *
 * Choosing a stone opens that provider beside the rail, top to bottom:
 *   1. YOURS — the three numbered steps (install · authenticate with the native sign-in
 *      tile, Done and Close · ready), read from the runtime row alone
 *      (setup-provider-state.js). The sign-in tile is mounted through the workbench
 *      environment's `mountProviderSetupSession` (provider-setup-session.js), so it works
 *      on either seat. An installed CLI's step says its version and, once Refresh has
 *      asked, the newest release its package source lists; an **Update** control runs the
 *      registry's update line in a tile as Install does — the owner's press, never Ronin's.
 *   2. THE CATALOG — the three measured facts, dated, then every model the catalog lists
 *      for this provider: tier, cost as read, good at, not good at, the default marked.
 *
 * This surface is the one client that measures: showing it probes the machine
 * (POST /api/setup/providers/measure) and writes the Campaign's dated provider summary,
 * which every other reader then takes from the record; the catalog rows come from the one
 * picker's read (form-steps.js), so this surface and every picker cannot disagree.
 *
 * MEASURING IS NOT A REASON TO WITHHOLD THE FRAME. The stones paint at once from the
 * recorded summary — the same read every other surface makes, and the catalog read this
 * one makes anyway — and the measure runs behind them, repainting when it lands. A probe
 * that asks five CLIs their version was sitting between the owner and the first frame
 * (gemini alone took 2.9s to answer, 2026-09-09); nothing measured ever stands there again.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { loadProviderCatalog, modelAvailabilityFact, providerCatalog, tierWord } from './form-steps.js';
import { mountProviderAttachment, providerFromRuntime, providerPresentation, providerReadiness } from './setup-provider-state.js';
import { readyMika } from './mika-ready.js';

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
  const yours = new Set(rows.filter((row) => row.origin === 'user').map((row) => row.provider)).size;
  const stockDate = catalog.stock_updated || catalog.updated;
  const dated = stockDate ? t('setup_surface.providers_summary_dated', '{counts} · catalog updated {date}', { counts, date: stockDate }) : counts;
  return yours ? t('setup_surface.providers_summary_yours', '{dated} · {n} yours', { dated, n: yours }) : dated;
}

export function createProviderSurface(context) {
  const out = WorkspaceKit.primitives.createSurface({ label: t('setup_surface.providers', 'Model providers'), className: 'setup-surface setup-provider-surface' });
  const action = (label, kind, onClick) => { const made = WorkspaceKit.primitives.createAction({ label, kind, action: onClick }); return made.el ?? made; };
  const yesNo = (on) => (on ? t('setup_surface.yes', 'yes') : t('setup_surface.no', 'no'));
  const when = (stamp) => { const date = new Date(stamp); return Number.isNaN(date.getTime()) ? String(stamp) : date.toLocaleString(); };
  const dates = el('details', 'setup-provider-dates');
  const catalogDate = el('dd');
  const machineDate = el('dd');
  const versionsDate = el('dd');
  const dateList = el('dl', 'setup-provider-date-list');
  const dateRow = (label, value) => { const row = el('div'); row.append(el('dt', null, label), value); return row; };
  const withdrawnList = el('dd');
  const withdrawnRow = dateRow(t('setup_surface.withdrawn', 'Withdrawn by your copy'), withdrawnList);
  withdrawnRow.hidden = true;
  dateList.append(
    dateRow(t('setup_surface.catalog_researched', 'Catalog researched'), catalogDate),
    dateRow(t('setup_surface.machine_measured', 'Machine measured'), machineDate),
    dateRow(t('setup_surface.versions_checked', 'Latest versions checked'), versionsDate),
    withdrawnRow,
  );
  // Refresh lives in this box: the box is what-we-know-and-when, and Refresh renews it —
  // measure again AND ask each installed CLI's package source for its newest release. The
  // ask is outbound (one egress line each), so it is this press and never the surface
  // simply opening; opening only measures. What it found is said, changed or not.
  const refreshRow = el('div', 'setup-provider-refresh');
  const refreshNote = el('span', 'setup-fine', t('setup_surface.refresh_note', 'Measures this machine again and asks each installed CLI’s package source for its newest release.'));
  const refreshOutcome = el('p', 'setup-fine setup-provider-refresh-outcome'); refreshOutcome.hidden = true;
  dates.append(el('summary', null, t('setup_surface.check_dates', 'Check dates')), dateList, refreshRow, refreshOutcome);
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const mikaAvailability = el('p', 'setup-fine setup-mika-availability');
  let opened = String(context.detail?.provider || context.detail?.key || '');
  let mounted = null;
  let runtime = { providers: [] };
  const disposeMount = (destroy = true) => {
    if (!mounted) return;
    if (destroy) mounted.destroy?.(); else mounted.park?.();
    mounted = null;
  };
  const measuredDateText = () => {
    const stamp = providerCatalog().measured_at || runtime?.measured_at || '';
    return stamp
      ? when(stamp)
      : t('setup_surface.machine_unmeasured', 'Not measured yet');
  };
  const latestCheckedText = () => {
    const stamps = (runtime.providers || []).map((provider) => provider?.latest_checked_at).filter(Boolean).sort();
    return stamps.length ? when(stamps[stamps.length - 1]) : t('setup_surface.versions_unchecked', 'Not checked yet — press Refresh');
  };
  const paintDates = () => {
    const read = providerCatalog();
    const stockDate = read.stock_updated || t('setup_surface.catalog_date_unstated', 'Date not stated');
    // Two layers, two dates, neither borrowed: the shipped file's, and the owner's copy's when one exists.
    catalogDate.textContent = read.origin === 'user'
      ? t('setup_surface.catalog_two_dates', 'Shipped {stock} · your copy {yours}', { stock: stockDate, yours: read.updated || t('setup_surface.catalog_date_unstated', 'Date not stated') })
      : stockDate;
    machineDate.textContent = measuredDateText();
    versionsDate.textContent = latestCheckedText();
    const gone = Array.isArray(read.withdrawn) ? read.withdrawn : [];
    withdrawnList.textContent = gone.map((row) => row.label || row.provider).join(' · ');
    withdrawnRow.hidden = gone.length === 0;
  };
  /**
   * WHICH LAYER a provider's section came from, said in words — the whole point of the
   * overlay. A shadow nobody can see is what the surface used to be. The cost is said
   * too: a user section replaces the shipped one whole, so one edited price forks the
   * vendor's section until the owner takes the next shipped update.
   */
  const provenance = (rows) => {
    const first = rows[0];
    if (!first) return '';
    const read = providerCatalog();
    const unstated = t('setup_surface.catalog_date_unstated', 'date not stated');
    if (first.origin !== 'user') return t('setup_surface.section_shipped', 'Shipped catalog · updated {date}', { date: read.stock_updated || unstated });
    if (first.shadowed) return t('setup_surface.section_yours_shadowed', 'Your copy of this section (updated {yours}) replaces the shipped one (updated {stock}). It stays yours until you take the next shipped update: one edited price forks the whole section.', { yours: read.updated || unstated, stock: read.stock_updated || unstated });
    return t('setup_surface.section_yours_new', 'Yours · not in the shipped catalog (your copy updated {yours})', { yours: read.updated || unstated });
  };
  /** A path with the home directory folded to ~, for a line meant to be read. */
  const homely = (path) => String(path || '').replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, '~');
  /**
   * The Installed step's state: the version the CLI said and WHICH binary said it, then
   * what Refresh last learned of the newest. The path is not decoration: a version without
   * the file it came from let a correct reading look like a lie (2026-09-09).
   */
  const installedState = (provider) => {
    // Not activated: nothing was asked of it, so there is nothing to say past Installed.
    if (provider.activated !== true) return t('setup_surface.installed', 'Installed');
    const version = provider.version || t('setup_surface.version_unknown', 'version not read');
    const where = provider.path ? ' · ' + homely(provider.path) : '';
    if (provider.latest) {
      return (provider.update_available
        ? t('setup_surface.installed_behind', 'Installed {version} · {latest} available', { version, latest: provider.latest })
        : t('setup_surface.installed_current', 'Installed {version} · up to date', { version })) + where;
    }
    if (provider.askable === false) return t('setup_surface.installed_unaskable', 'Installed {version} · latest unknown: no package source to ask', { version }) + where;
    return t('setup_surface.installed_version', 'Installed {version}', { version }) + where;
  };
  /** After a Refresh: what moved since the last reading, or that nothing did. */
  const refreshSummary = (before, after) => {
    const rows = (runtime) => new Map((runtime?.providers || []).filter((p) => p?.id).map((p) => [p.id, p]));
    const was = rows(before); const changes = [];
    for (const [id, now] of rows(after)) {
      const then = was.get(id) || {};
      if (now.version !== then.version && (now.version || then.version)) changes.push(`${now.label || id}: ${then.version || '—'} → ${now.version || '—'}`);
      if (now.latest !== then.latest && (now.latest || then.latest)) changes.push(`${now.label || id}: ${t('setup_surface.refresh_latest_word', 'latest')} ${then.latest || '—'} → ${now.latest || '—'}`);
    }
    const stamp = when(new Date().toISOString());
    return changes.length
      ? t('setup_surface.refresh_changed', 'Checked {when} — {changes}', { when: stamp, changes: changes.join(' · ') })
      : t('setup_surface.refresh_unchanged', 'Checked {when} — unchanged', { when: stamp });
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
      ? installedState(provider)
      : install.action === 'manual' ? t('setup_surface.manual_install', 'Manual install') : t('setup_surface.not_installed', 'Not installed'));
    // Every step's text — the update running, the line Update runs, "usually updates
    // itself", the switch's sentence — is the step's own `detail`/`command`, painted by
    // stepRow in the text column. Nothing is appended to the grid but a terminal.
    // UPDATE — only for an installed CLI the registry knows how to update. It opens in the
    // page exactly as a sign-in does: a temporary provider_setup session, mounted here, and
    // the same Close ends it. Not the kaki primary (that is the current step's), so the
    // label carries the news instead. A sign-in that is open owns the one attachment.
    if (install.status === 'installed' && provider.update_open && !provider.login_open) {
      const terminal = el('div', 'setup-provider-terminal');
      const close = action(t('setup_surface.close', 'Close'), '', () => { mounted?.park?.(); return press(`/api/setup/providers/${encodeURIComponent(provider.id)}/close`); });
      close.classList.add('setup-provider-action', 'setup-provider-update-close');
      installRow.controls.append(close);
      installRow.item.append(terminal);
      mounted = mountProviderAttachment(context.environment, terminal, provider, context.workspace, () => void paint());
      if (!mounted) terminal.append(el('p', 'setup-notice bad', t('setup_surface.login_attachment_missing', 'The native setup session is open but its terminal attachment is unavailable.')));
    // Update is useful only when there is somewhere newer to move AND the provider is
    // usable. Otherwise the row already says the complete fact: up to date, or not signed in.
    } else if (install.status === 'installed' && provider.activated && provider.updatable && provider.update_available) {
      const label = t('setup_surface.update_to', 'Update to {latest}', { latest: provider.latest });
      const update = action(label, '', async () => {
        update.disabled = true;
        update.textContent = t('setup_surface.update_starting', 'Starting…');
        const result = await request(`/api/setup/providers/${encodeURIComponent(provider.id)}/update`, { method: 'POST', json: {} });
        if (!result.ok) {
          problem.textContent = result.message;
          problem.hidden = false;
          update.textContent = label;
          update.disabled = false;
          return;
        }
        await paint();
      });
      update.classList.add('setup-provider-action', 'setup-provider-update');
      installRow.controls.append(update);
    }
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
    // THE SWITCH lives on the Ready step. Activated: Turn off, with the sentence that says
    // exactly what it does and does not do. Off: Turn on. Neither touches a sign-in or a
    // running tile, and both say so where the owner presses (owner, 2026-09-09).
    const readyRow = stepRow(ready, ready.status === 'ready' ? t('setup_surface.ready_launch', 'Activated for Launch')
      : ready.status === 'off' ? t('setup_surface.off', 'Off') : t('setup_surface.not_ready', 'Not yet'));
    if (ready.status === 'ready') {
      const turnOff = action(t('setup_surface.turn_off', 'Turn off'), '', () => press(`/api/setup/providers/${encodeURIComponent(provider.id)}/off`));
      turnOff.classList.add('setup-provider-action', 'setup-provider-turn-off');
      readyRow.controls.append(turnOff);
    } else if (ready.status === 'off') {
      const turnOn = control(ready, t('setup_surface.turn_on', 'Turn on'), () => press(`/api/setup/providers/${encodeURIComponent(provider.id)}/on`));
      turnOn.classList.add('setup-provider-turn-on');
      readyRow.controls.append(turnOn);
    }
    card.append(head, flow, problem);
    host.append(card);
  };

  /* ---- 2 · THE CATALOG: the measured facts, then every model the catalog lists ---- */
  const paintCatalog = (rows, entry, host) => {
    const section = el('section', 'setup-provider-catalog');
    section.append(el('h3', 'setup-provider-eyebrow', t('setup_surface.section_catalog', 'The catalog')));
    const facts = el('dl', 'setup-provider-facts');
    for (const [label, on] of [
      [t('setup_surface.fact_installed', 'Installed'), entry?.installed === true],
      [t('setup_surface.fact_signed_in', 'Signed in'), entry?.signed_in === true],
      [t('setup_surface.fact_activated', 'Activated'), entry?.activated === true],
    ]) { const fact = el('div'); fact.dataset.on = String(on); fact.append(el('dt', null, label), el('dd', null, yesNo(on))); facts.append(fact); }
    section.append(facts);
    if (!rows.length) { section.append(el('p', 'setup-fine', t('setup_surface.no_models', 'The catalog lists no models for this provider.'))); host.append(section); return; }
    const from = el('p', 'setup-fine setup-provider-provenance', provenance(rows));
    from.dataset.origin = rows[0].origin || 'stock'; from.dataset.shadowed = String(rows[0].shadowed === true);
    section.append(from);
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
      if (row.model_list) name.append(el('span', 'setup-provider-model-status', modelAvailabilityFact(row)));
      line.append(name, el('td', 'setup-provider-tier', tierWord(row.tier)), el('td', null, row.cost || ''), el('td', null, row.good_at || ''), el('td', null, row.not_good_at || ''));
      body.append(line);
    }
    table.append(thead, body);
    const scroll = el('div', 'setup-provider-table'); scroll.append(table);
    section.append(scroll);
    const list = rows[0]?.model_list;
    if (list && Array.isArray(list.models)) {
      const catalogModels = new Set(rows.map((row) => row.model));
      const candidates = list.models.filter((model) => model?.visibility === 'list' && model?.slug && !catalogModels.has(model.slug));
      if (candidates.length) {
        const extra = el('section', 'setup-provider-model-candidates');
        extra.append(el('h4', '', t('setup_surface.model_candidates', 'Listed by the CLI, missing from the catalog')));
        for (const candidate of candidates) {
          const item = el('p', 'setup-provider-model-candidate');
          item.dataset.model = candidate.slug;
          item.append(el('b', null, candidate.slug), el('span', null, candidate.description ? ` — ${candidate.description}` : ''));
          extra.append(item);
        }
        section.append(extra);
      }
    }
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
  stones.mount(out.content, { after: [dates, mikaAvailability, notice] });
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const refresh = action(t('setup_surface.refresh', 'Refresh'), '', async () => {
    const before = runtime;
    if (!(await measure(true))) return;
    refreshOutcome.textContent = refreshSummary(before, runtime);
    refreshOutcome.hidden = false;
    dates.open = true;
  });
  refresh.classList.add('setup-provider-action', 'setup-provider-refresh-action');
  refreshRow.append(refresh, refreshNote);
  /** The frame from whatever `runtime` holds now: the record, or the measure once it lands. */
  const paintFrom = async () => {
    disposeMount();
    context.environment.setupRuntime = runtime;
    const activatedNow = Number(runtime.activated_count || 0);
    mikaAvailability.textContent = activatedNow === 0
      ? t('setup_surface.mika_waits', 'Mika becomes available after you install and sign in to a model provider. Registration, Ronin Services, and gbrain are optional next steps.')
      : activatedNow === 1 ? t('setup_surface.one_model_signed_in', '1 model signed in')
        : t('setup_surface.models_signed_in', '{count} models signed in', { count: activatedNow });
    if (activatedNow > 0) {
      mikaAvailability.replaceChildren(el('span', 'tw-mika-spinner', '人'), el('span', '', t('mika.starting', 'Starting Mika…')));
      mikaAvailability.querySelector('.tw-mika-spinner')?.setAttribute('aria-hidden', 'true');
      mikaAvailability.setAttribute('role', 'status');
      const ready = await readyMika('setup_provider_ready');
      if (ready.ok && ready.data?.state === 'ready' && ready.data?.welcome_delivered === true) {
        try { sessionStorage.setItem('ronin.mika.help.open', '1'); } catch (_) {}
        location.hash = '#/team/ronin_helpers';
      } else if (ready.ok && ready.data?.state === 'ready') {
        mikaAvailability.textContent = activatedNow === 1
          ? t('setup_surface.one_model_signed_in', '1 model signed in')
          : t('setup_surface.models_signed_in', '{count} models signed in', { count: activatedNow });
      } else {
        mikaAvailability.textContent = t('mika.start_refused', 'Mika couldn’t start. You can try Help again.');
      }
    }
    await loadProviderCatalog();
    context.workbench?.refreshSelector?.();
    paintDates();
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
  /** The first frame: the recorded summary, through the one picker's read, at once. */
  const showRecord = async () => {
    await loadProviderCatalog();
    const read = providerCatalog();
    const providers = Array.isArray(read.machine) ? read.machine : [];
    runtime = {
      providers,
      activated_count: providers.filter((provider) => provider?.activated === true).length,
      measured_at: read.measured_at || '',
    };
    await paintFrom();
  };
  /**
   * The measure, behind the frame: this surface is the one reader that measures — every
   * other surface takes the Campaign's recorded summary from GET /api/setup/runtime, which
   * the catalog read takes too, after the measurement has been written. Refresh is the same
   * read through the door that also asks for the newest releases. Resolves once repainted.
   */
  const measure = async (refresh = false) => {
    const result = refresh
      ? await request('/api/setup/providers/refresh', { method: 'POST', json: {} })
      : await request('/api/setup/providers/measure', { method: 'POST', json: {} });
    if (!result.ok) { say(result.message, true); return false; }
    runtime = result.data;
    await loadProviderCatalog();
    await paintFrom();
    return true;
  };
  /** After a press: the record at once, then the measure, awaited — a press is never the first frame. */
  const paint = async (refresh = false) => { await showRecord(); return measure(refresh); };
  return {
    el: out.el,
    // Show resolves on the first frame; the measure follows on its own and repaints.
    show: async () => { await showRecord(); void measure(false); },
    destroy: () => { disposeMount(); stones.destroy(); },
  };
}
