import { mountModelOptions } from './model-services-surface.js';
/* part of the ronin-cowork client — see js/README.md */
/**
 * ONE MODEL PROVIDERS SURFACE, TWO SEATS. Ronin Setup's Model providers card and Ronin
 * Settings' Model providers card open this same surface: one definition under one type,
 * registered by both workbenches. Its first face is an inventory of equal stones on the
 * shared stone work surface — one per CLI the registry knows, each wearing its short
 * measured state, then any catalog provider no registry CLI serves — mounted straight on
 * the surface content so the stone seat owns every inset. The
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
 *   2. THE CATALOG — the three measured facts, dated, then every model the CLI listed for
 *      this provider with its tier, the default marked.
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
import { createSetupZone, setupStep } from './setup-zone.js';
import { request } from './request.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createPhalanx } from './phalanx.js';
import { dayTime, loadProviderCatalog, modelLabel, providerCatalog, tierWord } from './form-steps.js';
import { mountProviderAttachment, providerFromRuntime, providerPresentation, providerReadiness } from './setup-provider-state.js';
import { createStatusMarker } from './status-marker.js';
import { IRASSHAI_NAME } from './setup-journey.js';

const el = (tag, cls = '', text = null) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };

/** The one type, on both workbenches. */
export const PROVIDER_SURFACE_TYPE = 'setup.providers';

export function providerSurfaceDefinition() {
  return {
    type: PROVIDER_SURFACE_TYPE,
    header: 'surface',
    groupKey: PROVIDER_SURFACE_TYPE,
    label: () => t('setup_surface.providers', 'Harnesses'),
    summary: () => providersSummary(providerCatalog()),
    create: (context) => createProviderSurface(context),
  };
}

/** The card's line on both seats: the catalog's counts and this machine's. */
export function providersSummary(catalog) {
  if (!catalog?.loaded) return t('setup_surface.providers_summary_unread', 'Every provider and model Ronin offers, and what this machine has.');
  const rows = catalog.rows;
  const providers = new Set(rows.map((row) => row.provider)).size;
  const activated = new Set(rows.filter((row) => row.operational).map((row) => row.provider)).size;
  return t('setup_surface.providers_summary', '{providers} providers · {models} models · {activated} activated here', { providers, models: rows.length, activated });
}

/** The recorded summary as a runtime: the record every reader takes, before any measure lands. */
export const recordRuntime = () => {
  const read = providerCatalog();
  const providers = Array.isArray(read.machine) ? read.machine : [];
  return {
    providers,
    activated_count: providers.filter((provider) => provider?.activated === true).length,
    measured_at: read.measured_at || '',
    refreshed_at: read.refreshed_at || '',
  };
};

/** A catalog provider no registry CLI serves is a stone of its own, keyed by its vendor id. */
const catalogOnly = (runtime) => {
  const known = new Set((runtime.providers || []).map((provider) => provider?.id));
  return (providerCatalog().providers || []).filter((entry) => !known.has(entry.cli));
};

/** THE STONES, one builder (owner, 2026-10-19): every CLI the runtime knows wearing its measured
 * state, then every catalog provider no CLI serves. The Settings surface, the Models workbench
 * and its selector cards all read this. */
export function providerStones(runtime) {
  // A part's provider (Ronin models, in a hosted office) runs on a CLI but is never in that CLI's list.
  const parts = (providerCatalog().providers || []).filter((entry) => entry.part);
  const parted = new Set(parts.map((entry) => entry.provider));
  const rows = providerCatalog().rows.filter((row) => !parted.has(row.provider));
  const providers = (Array.isArray(runtime.providers) ? runtime.providers : []).filter((provider) => provider?.id);
  const stoneOf = (id, label, secondary, state, activated, marker = null) => ({ id, label, secondary, state, marker, className: 'setup-provider-stone', attrs: { 'data-provider': id, 'data-activated': String(activated) } });
  const items = [
    ...parts.map((entry) => stoneOf(entry.provider, entry.label, t('setup_surface.part_models_n', '{n} models', { n: entry.models.length }),
      entry.operational ? t('setup_surface.ready_launch', 'Activated for Launch') : '', entry.operational === true)),
    ...providers.map((provider) => {
      const own = rows.filter((row) => row.cli === provider.id);
      const vendor = own[0]?.provider_label || provider.from || '';
      const entry = (providerCatalog().providers || []).find((candidate) => candidate.cli === provider.id);
      return stoneOf(String(provider.id), provider.label || provider.id, own.length ? t('setup_surface.provider_models_n', '{vendor} · {n} models', { vendor, n: own.length }) : vendor, provider.id === 'hermes' ? (own.length ? 'Setups available' : 'Add a connection and setup') : providerPresentation(provider).inventoryState, provider.activated === true, createStatusMarker(entry?.maturity));
    }),
    ...catalogOnly(runtime).map((entry) => ({
      ...stoneOf(entry.provider, entry.label, entry.models.length ? t('setup_surface.provider_models_n', '{vendor} · {n} models', { vendor: entry.label, n: entry.models.length }) : '', entry.models.length ? t('setup_surface.no_cli_state', 'No CLI') : '', false, createStatusMarker(entry.maturity)),
      disabled: entry.models.length === 0,
    })),
  ];
  return items;
}

export function createProviderSurface(context) {
  const out = WorkspaceKit.primitives.createSurface({ label: t('setup_surface.providers', 'Harnesses'), className: 'setup-surface setup-provider-surface' });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const mikaAvailability = el('p', 'setup-fine setup-mika-availability');
  let opened = String(context.detail?.provider || context.detail?.key || '');
  let firstProviderId = '';
  let openFirstWhenReady = false;
  const drawing = createProviderDrawing(context, { repaint: () => repaint(), say: (text, bad) => say(text, bad) });
  const stones = createPhalanx({
    selectedId: opened,
    className: 'setup-provider-stones',
    renderDetail: (item, host) => drawing.paintProvider(item.id, host),
    onSelectionChange: (id) => { opened = String(id || ''); if (!id) drawing.closed(); },
  });
  const controller = Object.freeze({
    openFirst: () => {
      if (firstProviderId) stones.select(firstProviderId, { focus: true });
      else openFirstWhenReady = true;
    },
  });
  context.environment?.onProviderSurface?.(controller);
  const refresh = createRefreshAll(drawing);
  const zone = context.environment?.setupZones ? createSetupZone() : null;
  /** Step 1 states one fact: whether any provider is Activated (integrations_authentications, KAN-768). */
  const paintZone = (activated) => {
    if (!zone) return;
    // Ticked is the mark's own condition, so the zone and the card cannot disagree.
    if (setupStep(context.environment, 'provider')?.answered) { zone.paint(); return; }
    zone.paint(activated > 0
      ? { state: 'Provider signed in and authenticated.', picks: [] }
      : { state: 'No provider found on this machine.', picks: [{ label: 'Sign in a provider', action: () => controller.openFirst() }] });
  };
  stones.mount(out.content, { before: [...(zone ? [zone.el] : []), refresh.el], after: [mikaAvailability, notice] });
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; if (notice.textContent !== text) notice.textContent = text; notice.hidden = !text; };
  /** The surface's frame from the drawing's runtime: the zone, the dates, the stones, the selector.
   * Each part compares what it shows (KAN-414): the stones are the phalanx's kept rows, the zone's
   * picks the kit list's, the selector's cards the Workbench's, and the lines write only on a change. */
  const repaint = () => {
    const runtime = drawing.runtime();
    const activatedNow = Number(runtime.activated_count || 0);
    paintZone(activatedNow);
    refresh.paint();
    mikaAvailability.hidden = activatedNow === 0;
    const signedIn = activatedNow === 1
      ? t('setup_surface.one_model_signed_in', '1 model signed in')
      : activatedNow > 1 ? t('setup_surface.models_signed_in', '{count} models signed in', { count: activatedNow }) : '';
    if (mikaAvailability.textContent !== signedIn) mikaAvailability.textContent = signedIn;
    context.workbench?.refreshSelector?.();
    const items = drawing.stones();
    firstProviderId = String(items[0]?.id || '');
    say(items.length ? '' : t('setup_surface.no_catalog', 'No harnesses are in the catalog on this machine.'));
    stones.setItems(items);
    if (openFirstWhenReady && firstProviderId) {
      openFirstWhenReady = false;
      stones.select(firstProviderId, { focus: true });
    }
  };
  const stopProgressRefresh = context.environment?.onSetupProgress?.(() => { void drawing.showRecord(); }) || (() => {});
  return {
    el: out.el,
    show: async () => { await drawing.showRecord(); },
    destroy: () => { stopProgressRefresh(); context.environment?.onProviderSurface?.(null); drawing.destroy(); stones.destroy(); },
  };
}

/**
 * REFRESH ALL — the one door that reads model lists (owner, 2026-09-25): every activated
 * CLI's own list, and the newest release of each, in one press. Never on a timer. The
 * line beside it says when it last ran, so the owner knows how fresh every list is.
 * Exported once (owner, 2026-10-20): Settings' provider surface and the Models workbench's
 * Model refresh surface press the same control over the same drawing; `paint()` is the
 * host's, called whenever the frame moves.
 */
/**
 * ONE STEP, the shape every provider flow draws (the provider page's three, Model refresh's
 * three): a mark that says done, current, failed or its number; the label with its state
 * beside it; at most one short line; then its controls. `copy` takes any further lines.
 */
export function stepItem({ key, n, label, state = '', detail = '', status = '', done = false, current = false, failed = false }) {
  const item = el('li', 'setup-provider-step');
  item.dataset.step = key; item.dataset.status = status;
  item.dataset.done = String(done === true); item.dataset.current = String(current === true); item.dataset.failed = String(failed === true);
  const mark = el('span', 'setup-provider-mark', done ? '✓' : failed ? '!' : String(n));
  mark.setAttribute('aria-hidden', 'true');
  const copy = el('div', 'setup-provider-copy');
  const title = el('div', 'setup-provider-title');
  title.append(el('strong', 'setup-provider-label', label), el('span', 'setup-provider-state', state));
  copy.append(title);
  if (detail) copy.append(el('p', 'setup-provider-note', detail));
  const controls = el('div', 'setup-provider-control');
  item.append(mark, copy, controls);
  return { item, copy, controls };
}

/**
 * REFRESH ALL — one door, said as it runs: the CLIs' own model lists (and npm for their newest
 * releases). `onStep(key, state)` hears each step start and end (`lists` | `accounts`,
 * `running` | `done` | `failed`); a host that draws the steps listens.
 */
/** `between` (KAN-236): a step the Agent Harness workbench's Refresh runs after the harnesses — each
 * account's Discover; it resolves true when every account answered. Settings' surface passes none. */
export function createRefreshAll(drawing, { onStep = () => {}, between = null } = {}) {
  const bar = el('div', 'setup-provider-refresh');
  const lastRan = el('p', 'setup-fine setup-provider-last-ran');
  const made = WorkspaceKit.primitives.createAction({ label: t('setup_surface.refresh_all', 'Refresh all harnesses'), kind: '', action: async () => {
    button.disabled = true;
    button.textContent = t('setup_surface.refreshing_lists', 'Reading model lists…');
    onStep('lists', 'running');
    const ok = await drawing.measure(true);
    onStep('lists', ok ? 'done' : 'failed');
    if (ok && between) {
      button.textContent = t('setup_surface.refreshing_accounts', 'Reading account lists…');
      onStep('accounts', 'running');
      const answered = await between().catch(() => false);
      onStep('accounts', answered ? 'done' : 'failed');
    }
    button.disabled = false;
    button.textContent = t('setup_surface.refresh_all', 'Refresh all harnesses');
    paint();
  } });
  const button = made.el ?? made;
  const paint = () => {
    const when = String(drawing.runtime().refreshed_at || providerCatalog().refreshed_at || '');
    const words = when
      ? t('setup_surface.last_ran', 'Last ran {date}', { date: dayTime(when) })
      : t('setup_surface.never_ran', 'Never run — every provider offers Native only until it runs.');
    if (lastRan.textContent !== words) lastRan.textContent = words; // an unchanged push touches nothing (KAN-414)
  };
  button.classList.add('setup-provider-refresh-all');
  bar.append(button, lastRan);
  return { el: bar, paint };
}

/**
 * THE PROVIDER DRAWING, exported once (owner, 2026-10-19): a provider's page — YOURS, the three
 * steps with the native sign-in tile, then THE CATALOG — and the frame read behind it (the record,
 * then any measure), drawn the same wherever a provider is read: the Settings and Setup surface
 * and the Models workbench call this. `repaint()` is the host's: it paints from `runtime()` and
 * `stones()` whenever the frame moves; `say(text, bad)` is the host's notice line.
 */
export function createProviderDrawing(context, { repaint, say = () => {} }) {
  const action = (label, kind, onClick) => { const made = WorkspaceKit.primitives.createAction({ label, kind, action: onClick }); return made.el ?? made; };
  const yesNo = (on) => (on ? t('setup_surface.yes', 'yes') : t('setup_surface.no', 'no'));
  let alignedProvider = '';
  let mounted = null;
  let runtime = { providers: [] };
  const disposeMount = (destroy = true) => {
    if (!mounted) return;
    if (destroy) mounted.destroy?.(); else mounted.park?.();
    mounted = null;
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
      if (!result.ok) { problem.textContent = result.message; problem.hidden = false; return result; }
      await after();
      return result;
    };
    const closeSetup = () => {
      const button = action(t('setup_surface.cancel', 'Cancel'), '', async () => {
        button.disabled = true;
        const path = `/api/setup/providers/${encodeURIComponent(provider.id)}/close`;
        await press(path);
        button.disabled = false;
      });
      button.dataset.endsEdit = '';
      button.classList.add('setup-provider-action');
      return button;
    };
    const completion = el('section', 'setup-provider-completion'); completion.hidden = true;
    const finish = (path) => {
      if (!completion.hidden) return;
      completion.hidden = false;
      // Done, right under the terminal (KAN-723). It records nothing but the sign-in itself: the
      // CLI's own credentials are the record (owner, 24 Nov 2026: one CLI, one sign-in way).
      const submit = action(t('setup_surface.done', 'Done'), 'primary', async () => {
        submit.disabled = true;
        const result = await request(path, { method: 'POST', json: {} });
        if (!result.ok) { problem.textContent = result.message; problem.hidden = false; submit.disabled = false; return; }
        mounted?.park?.();
        await paint();
        context.environment?.onProviderChoice?.();
      });
      submit.dataset.endsEdit = '';
      submit.classList.add('setup-provider-done');
      const actions = el('div', 'setup-provider-completion-actions');
      actions.append(submit, closeSetup());
      completion.append(actions);
    };
    // One shape for all three steps: a mark that says done, current, or pending; the label
    // with its measured state beside it; at most one short line; then a control of one size.
    // Only the current step's control is the kaki primary.
    const stepRow = (step, state) => {
      const made = stepItem({ ...step, n: steps.indexOf(step) + 1, state });
      if (step.command) made.copy.append(el('code', 'setup-provider-command', step.command));
      flow.append(made.item);
      return made;
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
      const assisted = typeof context.environment?.onMikaProviderGuide === 'function'
        && typeof context.environment?.onMikaProviderConnect === 'function';
      if (assisted) {
        const irasshai = context.environment.assistName?.() === IRASSHAI_NAME;
        const operate = control(auth, irasshai ? t('setup_surface.authenticate_irasshai', 'Let the Helpful Assistant authenticate') : t('setup_surface.authenticate_mika', 'Let Mika authenticate'), () => context.environment.onMikaProviderConnect({ provider, workspace: context.workspace }));
        const guide = action(irasshai ? t('setup_surface.authenticate_guided_irasshai', 'Use the CLI with the Helpful Assistant') : t('setup_surface.authenticate_guided', 'Use the CLI with Mika'), '', async () => {
          guide.disabled = true;
          const result = await press(`/api/setup/providers/${encodeURIComponent(provider.id)}/login`);
          if (result?.ok) await context.environment.onMikaProviderGuide({ provider, setupSession: result.data?.attachment?.key || `provider_setup_${provider.id}`, workspace: context.workspace });
          guide.disabled = false;
        });
        guide.classList.add('setup-provider-action');
        authRow.controls.append(operate, guide);
      } else {
        authRow.controls.append(control(auth, t('setup_surface.authenticate', 'Authenticate'), () => press(`/api/setup/providers/${encodeURIComponent(provider.id)}/login`)));
      }
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
    card.append(problem);
    host.append(card);
  };

  /* ---- 2 · MODELS: what the CLI listed on the last Refresh all, with HQ's tier and line ---- */
  /** The one line about a provider's list: when it was read and by which CLI version, or why there is none. */
  const listState = (entry) => {
    if (!entry?.activated) return '';
    const list = entry.model_list;
    if (!list) return t('setup_surface.models_not_read', 'Model list not read yet — press Refresh all harnesses.');
    if (list.unavailable) return list.unavailable;
    return t('setup_surface.models_read', 'Model list read {date} by {cli} {version}', { date: list.read_at, cli: entry.label || entry.id, version: list.by || '' }).trim();
  };
  const paintCatalog = (rows, entry, host, label = '', { facts: withFacts = true } = {}) => {
    const section = el('section', 'setup-provider-catalog');
    section.append(el('h3', 'setup-provider-eyebrow', label || t('setup_surface.section_models', 'Models')));
    if (!withFacts) return paintModels(rows, section, host);
    const facts = el('dl', 'setup-provider-facts');
    for (const [label, on] of [
      [t('setup_surface.fact_installed', 'Installed'), entry?.installed === true],
      [t('setup_surface.fact_signed_in', 'Signed in'), entry?.signed_in === true],
      [t('setup_surface.fact_activated', 'Activated'), entry?.activated === true],
    ]) { const fact = el('div'); fact.dataset.on = String(on); fact.append(el('dt', null, label), el('dd', null, yesNo(on))); facts.append(fact); }
    section.append(facts);
    const state = listState(entry);
    if (state) section.append(el('p', 'setup-fine setup-provider-list-state', state));
    paintModels(rows, section, host);
  };
  /** The model table under a provider's page; the section is the caller's, appended to host here. */
  const paintModels = (rows, section, host) => {
    if (!rows.length) { section.append(el('p', 'setup-fine', t('setup_surface.no_models', 'The catalog lists no models for this provider.'))); host.append(section); return; }
    const table = el('table', 'setup-provider-models');
    const headRow = el('tr');
    for (const text of [t('setup_surface.col_model', 'Model'), t('setup_surface.col_tier', 'Tier')]) headRow.append(el('th', null, text));
    const thead = el('thead'); thead.append(headRow);
    const body = el('tbody');
    for (const row of rows) {
      const line = el('tr');
      line.dataset.model = row.model; line.dataset.tier = row.tier;
      // Two names, both read: the CLI's own name in bold (the version is in it), and the id
      // every launch uses beneath — the owner can tell Opus 5.5 from Opus 5 at a glance.
      const name = el('td'); name.append(el('b', null, modelLabel(row)));
      if (row.default) name.append(el('span', 'setup-provider-default', t('setup_surface.model_default_mark', 'the default')));
      // A Ronin models tier row (model `light`, tier light) is its name already; so is an id equal to it.
      if (row.model !== 'native' && row.model !== row.tier && row.model !== modelLabel(row)) name.append(el('span', 'setup-provider-model-id', row.model));
      if (row.model === 'native') name.append(el('span', 'setup-provider-default', t('setup_surface.native_description', 'The CLI chooses its own configured or current default model.')));
      // The tier, and beneath it the model's own line from HQ's catalog: which is which, at a glance.
      const tier = el('td'); tier.append(el('span', 'setup-provider-tier', tierWord(row.tier)));
      if (row.model !== 'native' && row.use_for) tier.append(el('span', 'setup-provider-use-for', row.use_for));
      line.append(name, tier);
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
    // Hermes's keys and model options are Model services' (KAN-870); its page shows them, read only.
    if (id === 'hermes') return mountModelOptions(host);
    const part = (providerCatalog().providers || []).find((entry) => entry.provider === id && entry.part);
    if (part) {
      // Nothing to install or sign in: the office's house connection, on the Ronin balance.
      const yours = el('section', 'setup-provider-yours');
      yours.append(el('h2', '', part.label), el('p', 'setup-fine', part.note || ''));
      host.append(yours);
      paintCatalog(part.models, null, host, '', { facts: false });
      return null;
    }
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

  /** The frame from whatever `runtime` holds now: the record, or the measure once it lands.
   * The open page's terminal and sign-in form are not torn down here: the page's own dispose
   * does that when the phalanx redraws it, and a frame that leaves its stone's row unchanged
   * (KAN-414) leaves the page, its live sign-in tile and any draft standing (KAN-472). */
  const paintFrom = async () => {
    context.environment.setupRuntime = runtime;
    context.environment.onSetupRuntime?.(runtime);
    await repaint();
  };
  /** The first frame: the recorded summary, through the one picker's read, at once. */
  const showRecord = async () => {
    await loadProviderCatalog();
    runtime = recordRuntime();
    await paintFrom();
  };
  /** Refresh all is the owner's press; a plain repaint reads the record. */
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
  // Back from a browser sign-in: while a sign-in is open, coming back to this tab reads the
  // runtime once, so the step can say the CLI is signed in (KAN-723). No timer.
  const onFocus = () => { if (runtime.providers?.some((row) => row.login_open)) void measure(); };
  window.addEventListener('focus', onFocus);
  return {
    paintProvider, paint, showRecord, measure,
    /** The open page is gone: the next one scrolls to its current step afresh. */
    closed: () => { alignedProvider = ''; },
    runtime: () => runtime,
    stones: () => providerStones(runtime),
    destroy: () => { window.removeEventListener('focus', onFocus); disposeMount(); },
  };
}
