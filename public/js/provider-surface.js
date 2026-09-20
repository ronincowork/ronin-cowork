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
 * The Setup progress resource owns measurement. This surface paints the Campaign's dated
 * provider summary, which every reader takes from the record; the catalog rows come from the one
 * picker's read (form-steps.js), so this surface and every picker cannot disagree.
 *
 * MEASURING IS NOT A REASON TO WITHHOLD THE FRAME. The stones paint at once from the
 * recorded summary — the same read every other surface makes, and the catalog read this
 * one makes anyway — and the measure runs behind them, repainting when it lands. A probe
 * that asks five CLIs their version was sitting between the owner and the first frame
 * (gemini alone took 2.9s to answer, 2026-09-09); nothing measured ever stands there again.
 */
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { createSetupZone } from './setup-zone.js';
import { request } from './request.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { loadProviderCatalog, modelAvailabilityFact, modelLabel, providerCatalog, tierWord } from './form-steps.js';
import { mountProviderAttachment, providerFromRuntime, providerPresentation, providerReadiness } from './setup-provider-state.js';
import { createStatusMarker } from './status-marker.js';

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
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const mikaAvailability = el('p', 'setup-fine setup-mika-availability');
  let opened = String(context.detail?.provider || context.detail?.key || '');
  let firstProviderId = '';
  let alignedProvider = '';
  let openFirstWhenReady = false;
  let mounted = null;
  let signInForm = null;
  const authenticationDrafts = new Map();
  let runtime = { providers: [] };
  const disposeMount = (destroy = true) => {
    signInForm?.destroy(); signInForm = null;
    if (!mounted) return;
    if (destroy) mounted.destroy?.(); else mounted.park?.();
    mounted = null;
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
  /** A catalog provider no registry CLI serves is a stone of its own, keyed by its vendor id. */
  const catalogOnly = () => {
    const known = new Set((runtime.providers || []).map((provider) => provider?.id));
    return (providerCatalog().providers || []).filter((entry) => !known.has(entry.cli));
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
    let saveAuthentication = null;
    const closeSetup = () => {
      const button = action(t('setup_surface.cancel', 'Cancel'), '', async () => {
        button.disabled = true;
        const path = `/api/setup/providers/${encodeURIComponent(provider.id)}/close`;
        authenticationDrafts.delete(provider.id);
        await press(path);
        button.disabled = false;
      });
      button.classList.add('setup-provider-action');
      return button;
    };
    const completion = el('section', 'setup-provider-completion'); completion.hidden = true;
    const finish = (path) => {
      if (!completion.hidden) return;
      completion.hidden = false;
      completion.append(el('h3', 'setup-provider-note', t('setup_surface.naming_authentication', 'Naming this authentication')));
      const draft = authenticationDrafts.get(provider.id) || provider.sign_in || {};
      const title = el('input'); title.type = 'text'; title.maxLength = 120;
      title.value = draft.label || '';
      title.placeholder = t('setup_surface.authentication_title_hint', 'Choose a title');
      const field = el('label', 'setup-provider-sign-in-title', t('setup_surface.authentication_title', 'Authentication title'));
      field.append(title);
      let method = draft.method || '';
      const message = el('p', 'setup-notice bad'); message.hidden = true;
      saveAuthentication = async (destination = path) => {
        if (method !== 'not_signed_in' && !title.value.trim()) {
          message.textContent = t('setup_surface.title_before_done', 'To finish, give this authentication a title.');
          message.hidden = false; title.focus(); return;
        }
        if (!method) {
          message.textContent = t('setup_surface.type_before_close', 'Choose an authentication type, or Not signed in.');
          message.hidden = false; completion.scrollIntoView?.({ block: 'nearest' }); return;
        }
        submit.disabled = true;
        const target = method === 'not_signed_in' ? `/api/setup/providers/${encodeURIComponent(provider.id)}/close` : destination;
        const result = await request(target, { method: 'POST', json: { sign_in: method === 'not_signed_in' ? null : { method, label: title.value.trim() } } });
        if (!result.ok) { problem.textContent = result.message; problem.hidden = false; submit.disabled = false; return; }
        authenticationDrafts.delete(provider.id);
        mounted?.park?.();
        await paint();
        context.environment?.onProviderChoice?.(method === 'not_signed_in' ? 'not_now' : 'acted');
      };
      const submit = action(t('setup_surface.done', 'Done'), 'primary', () => saveAuthentication(path));
      const update = () => { authenticationDrafts.set(provider.id, { method, label: title.value }); field.hidden = method === 'not_signed_in'; submit.disabled = !method || (method !== 'not_signed_in' && !title.value.trim()); };
      const fields = el('div', 'setup-provider-authentication-fields');
      signInForm = ask([{ fields: [{ key: 'method', label: t('setup_surface.authentication_type', 'Authentication type'), options: [
        { v: 'subscription', l: t('setup_surface.account_subscription', 'Account / subscription') },
        { v: 'api_key', l: t('setup_surface.api_key', 'API key') },
        { v: 'third_party', l: t('setup_surface.third_party', 'Third-party service'), sub: t('setup_surface.third_party_hint', 'For example, OpenRouter. Put the service or account name in the title.') },
        { v: 'not_signed_in', l: t('setup_surface.not_authenticated', 'Not signed in') },
      ] }] }], { value: { method }, onChange: (value) => { method = value.method; update(); }, trayHost: fields });
      title.addEventListener('input', update);
      fields.append(field, signInForm.el);
      const actions = el('div', 'setup-provider-completion-actions');
      actions.append(submit, closeSetup());
      completion.append(fields, message, actions);
      update();
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
    // Install and update share the same attachment and Close as sign-in. They open in the
    // page exactly as a sign-in does: a temporary provider_setup session, mounted here, and
    // the same Close ends it. Not the kaki primary (that is the current step's), so the
    // label carries the news instead. A sign-in that is open owns the one attachment.
    if ((provider.install_open || provider.update_open) && !provider.login_open) {
      const terminal = el('div', 'setup-provider-terminal');

      if (!provider.install_open) {
        const close = closeSetup();
        close.classList.add('setup-provider-update-close');
        installRow.item.append(terminal, close);
      }
      if (provider.install_open) installRow.item.append(terminal);
      if (provider.install_open) {
        finish(`/api/setup/providers/${encodeURIComponent(provider.id)}/done`);
        installRow.item.append(completion);
      }
      mounted = mountProviderAttachment(context.environment, terminal, provider, context.workspace);
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
    } else if (install.current && install.action === 'install' && provider.installable && !provider.install_open) {
      const installButton = control(install, t('setup_surface.install', 'Install'), async () => {
        installButton.disabled = true;
        const result = await request(`/api/setup/providers/${encodeURIComponent(provider.id)}/install`, { method: 'POST', json: {} });
        if (!result.ok) { problem.textContent = result.message; problem.hidden = false; installButton.disabled = false; return; }
        runtime = result.data.runtime;
        await paintFrom();
      });
      installRow.controls.append(installButton);
    }
    const authRow = stepRow(auth, auth.status === 'recorded'
      ? t('setup_surface.signed_in', 'Signed in')
      : auth.status === 'open' ? t('setup_surface.sign_in_open', 'Sign-in open')
        : auth.status === 'available' ? t('setup_surface.not_signed_in', 'Not signed in') : t('setup_surface.install_first', 'After install'));
    if (auth.current && auth.action !== 'login_open' && !provider.install_open) {
      authRow.controls.append(control(auth, t('setup_surface.authenticate', 'Authenticate'), () => press(`/api/setup/providers/${encodeURIComponent(provider.id)}/login`)));
    } else if (auth.action === 'login_open') {
      const terminal = el('div', 'setup-provider-terminal');
      finish(`/api/setup/providers/${encodeURIComponent(provider.id)}/done`);
      authRow.item.append(terminal, completion);
      mounted = mountProviderAttachment(context.environment, terminal, provider, context.workspace);
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
    card.append(head, flow);
    if (provider.sign_in) {
      const names = { subscription: t('setup_surface.account_subscription', 'Account / subscription'), api_key: t('setup_surface.api_key', 'API key'), third_party: t('setup_surface.third_party', 'Third-party service') };
      card.append(el('p', 'setup-provider-note', t('setup_surface.sign_in_recorded', 'Your sign-in record: {method} · {title}', { method: names[provider.sign_in.method] || provider.sign_in.method, title: provider.sign_in.label })));
    }
    card.append(problem);
    host.append(card);
  };

  /* ---- 2 · MODELS: the persisted CLI inventory, enriched by catalog descriptions ---- */
  const paintCatalog = (rows, entry, host) => {
    const section = el('section', 'setup-provider-catalog');
    section.append(el('h3', 'setup-provider-eyebrow', t('setup_surface.section_models', 'Models')));
    const facts = el('dl', 'setup-provider-facts');
    for (const [label, on] of [
      [t('setup_surface.fact_installed', 'Installed'), entry?.installed === true],
      [t('setup_surface.fact_signed_in', 'Signed in'), entry?.signed_in === true],
      [t('setup_surface.fact_activated', 'Activated'), entry?.activated === true],
    ]) { const fact = el('div'); fact.dataset.on = String(on); fact.append(el('dt', null, label), el('dd', null, yesNo(on))); facts.append(fact); }
    section.append(facts);
    if (entry) {
      const tools = el('div', 'setup-provider-model-tools');
      const captured = entry.model_list?.fetched_at
        ? t('setup_surface.models_captured', 'Models captured {date}', { date: entry.model_list.fetched_at })
        : t('setup_surface.models_not_captured', 'Models not captured yet');
      const status = el('p', 'setup-fine', captured);
      const refresh = action(t('setup_surface.refresh_models', 'Refresh models'), '', async () => {
        refresh.disabled = true;
        refresh.textContent = t('setup_surface.refreshing_models', 'Refreshing…');
        if (!await measure(true)) {
          refresh.disabled = false;
          refresh.textContent = t('setup_surface.refresh_models', 'Refresh models');
        }
      });
      tools.append(status, refresh);
      section.append(tools);
    }
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
      const name = el('td'); name.append(el('b', null, modelLabel(row)));
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
    if (alignedProvider !== id) {
      alignedProvider = id;
      requestAnimationFrame(() => {
        if (!host.isConnected || alignedProvider !== id) return;
        const current = host.querySelector('.setup-provider-step[data-current="true"]');
        host.scrollTop = current
          ? host.scrollTop + current.getBoundingClientRect().top - host.getBoundingClientRect().top
          : 0;
      });
    }
    return () => disposeMount();
  };

  const stones = createStoneWorkSurface({
    selectedId: opened,
    className: 'setup-provider-stones',
    renderDetail: (item, host) => paintProvider(item.id, host),
    onSelectionChange: (id) => { opened = String(id || ''); if (!id) alignedProvider = ''; },
  });
  const controller = Object.freeze({
    openFirst: () => {
      if (firstProviderId) stones.select(firstProviderId, { focus: true });
      else openFirstWhenReady = true;
    },
  });
  context.environment?.onProviderSurface?.(controller);
  const zone = context.environment?.answerSetupStep ? createSetupZone('provider', context.environment, {
    signIn: () => controller.openFirst(), advance: () => context.environment?.nextSetupStep?.(),
  }) : null;
  stones.mount(out.content, { before: zone ? [zone.el] : [], after: [mikaAvailability, notice] });
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  /** The frame from whatever `runtime` holds now: the record, or the measure once it lands. */
  const paintFrom = async () => {
    disposeMount();
    context.environment.setupRuntime = runtime;
    const activatedNow = Number(runtime.activated_count || 0);
    zone?.setFacts({ activated_count: activatedNow });
    context.environment.onSetupRuntime?.(runtime);
    mikaAvailability.hidden = activatedNow === 0;
    mikaAvailability.textContent = activatedNow === 1
      ? t('setup_surface.one_model_signed_in', '1 model signed in')
      : activatedNow > 1 ? t('setup_surface.models_signed_in', '{count} models signed in', { count: activatedNow }) : '';
    await loadProviderCatalog();
    context.workbench?.refreshSelector?.();
    const rows = providerCatalog().rows;
    const providers = (Array.isArray(runtime.providers) ? runtime.providers : []).filter((provider) => provider?.id);
    const stoneOf = (id, label, secondary, state, activated, marker = null) => ({ id, label, secondary, state, marker, className: 'setup-provider-stone', attrs: { 'data-provider': id, 'data-activated': String(activated) } });
    const items = [
      ...providers.map((provider) => {
        const own = rows.filter((row) => row.cli === provider.id);
        const vendor = own[0]?.provider_label || provider.from || '';
        const entry = (providerCatalog().providers || []).find((candidate) => candidate.cli === provider.id);
        return stoneOf(String(provider.id), provider.label || provider.id, own.length ? t('setup_surface.provider_models_n', '{vendor} · {n} models', { vendor, n: own.length }) : vendor, providerPresentation(provider).inventoryState, provider.activated === true, createStatusMarker(entry?.maturity));
      }),
      ...catalogOnly().map((entry) => ({
        ...stoneOf(entry.provider, entry.label, entry.models.length ? t('setup_surface.provider_models_n', '{vendor} · {n} models', { vendor: entry.label, n: entry.models.length }) : '', entry.models.length ? t('setup_surface.no_cli_state', 'No CLI') : '', false, createStatusMarker(entry.maturity)),
        disabled: entry.models.length === 0,
      })),
    ];
    firstProviderId = String(items[0]?.id || '');
    say(items.length ? '' : t('setup_surface.no_catalog', 'No model providers are in the catalog on this machine.'));
    stones.setItems(items);
    if (openFirstWhenReady && firstProviderId) {
      openFirstWhenReady = false;
      stones.select(firstProviderId, { focus: true });
    }
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
  /** A deliberate provider release refresh remains a provider operation; Setup scans live above it. */
  const measure = async (refresh = false) => {
    const result = refresh ? await request('/api/setup/providers/refresh', { method: 'POST', json: {} }) : await request('/api/setup/runtime', { cache: 'no-store' });
    if (!result.ok) { say(result.message, true); return false; }
    runtime = result.data;
    await loadProviderCatalog();
    await paintFrom();
    return true;
  };
  /** After a press: repaint the record; Setup progress performs any completion scan. */
  const paint = async (refresh = false) => { await showRecord(); return measure(refresh); };
  const onInventory = () => { void showRecord(); };
  window.addEventListener('ronin:provider-inventory', onInventory);
  const stopProgressRefresh = context.environment?.onSetupProgress?.(() => { void showRecord(); }) || (() => {});
  return {
    el: out.el,
    show: async () => { await showRecord(); },
    destroy: () => { stopProgressRefresh(); zone?.destroy(); window.removeEventListener('ronin:provider-inventory', onInventory); context.environment?.onProviderSurface?.(null); disposeMount(); stones.destroy(); },
  };
}
