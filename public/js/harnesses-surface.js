/* part of the ronin-cowork client — see js/README.md */
/**
 * THE HARNESS PAGES IN SETTINGS (docs/architecture/setup-workbench.md "Harnesses"): the stones of
 * harnesses (`harnessStones`) and, for the one pressed, its page (`createHarnessDrawing`): three
 * numbered steps (install; authenticate, with Agent or on the CLI's own terminal with Done and Cancel,
 * the same two presses as Setup's Harness step, harness-authenticate.js; ready), read
 * from the measured runtime alone (setup-harness-state.js), then Models (harness-model-entries.js).
 * The stones paint at once from the recorded summary; the measure runs behind them and repaints.
 * Refresh all (`createRefreshAll`) is the one press that reads the CLIs' model lists.
 */
import { t } from './lexicon.js';
import { harnessModelEditor } from './harness-model-entries.js';
import { request } from './request.js';
import { WorkspaceKit } from './workspace-kit.js';
import { dayTime, loadHarnessCatalog, modelLabel, harnessCatalog, tierWord } from './form-steps.js';
import { mountHarnessAttachment, harnessFromRuntime, harnessPresentation, harnessReadiness } from './setup-harness-state.js';
import { createStatusMarker } from './status-marker.js';
import { signInHandlers } from './events.js';
import { authenticateWithAgent, createAgentWindow, signInChoices, signInWindow } from './harness-authenticate.js';

const el = (tag, cls = '', text = null) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };

/** The recorded summary as a runtime: the record every reader takes, before any measure lands. */
export const recordRuntime = () => {
  const read = harnessCatalog();
  const providers = Array.isArray(read.machine) ? read.machine : [];
  return {
    harnesses: providers,
    activated_count: providers.filter((provider) => provider?.activated === true).length,
    measured_at: read.measured_at || '',
    refreshed_at: read.refreshed_at || '',
  };
};

/** A catalog provider no registry CLI serves is a stone of its own, keyed by its vendor id. */
const catalogOnly = (runtime) => {
  const known = new Set((runtime.harnesses || []).map((provider) => provider?.id));
  return (harnessCatalog().harnesses || []).filter((entry) => !known.has(entry.cli));
};

/** THE STONES, one builder (owner, 2026-10-19): every CLI the runtime knows wearing its measured
 * state, then every catalog provider no CLI serves. The stones and the selector's cards read this. */
const modelCount = (vendor, n) => n === 1 ? t('setup_surface.provider_models_1', '{vendor} · 1 model', { vendor }) : t('setup_surface.provider_models_n', '{vendor} · {n} models', { vendor, n });
export function harnessStones(runtime) {
  const rows = harnessCatalog().rows;
  const providers = (Array.isArray(runtime.harnesses) ? runtime.harnesses : []).filter((provider) => provider?.id);
  const stoneOf = (id, label, secondary, state, activated, marker = null) => ({ id, label, secondary, state, marker, className: 'setup-provider-stone', attrs: { 'data-provider': id, 'data-activated': String(activated) } });
  const items = [
    ...providers.map((provider) => {
      const own = rows.filter((row) => row.cli === provider.id);
      const vendor = own[0]?.provider_label || provider.from || '';
      const entry = (harnessCatalog().harnesses || []).find((candidate) => candidate.cli === provider.id);
      return stoneOf(String(provider.id), provider.label || provider.id, own.length ? modelCount(vendor, own.length) : vendor, provider.id === 'hermes' ? (own.length ? t('setup_surface.hermes_ready', 'Ready') : t('setup_surface.hermes_no_service', 'No model service yet')) : harnessPresentation(provider).inventoryState, provider.activated === true, createStatusMarker(entry?.maturity));
    }),
    ...catalogOnly(runtime).map((entry) => ({
      ...stoneOf(entry.provider, entry.label, entry.models.length ? modelCount(entry.label, entry.models.length) : '', entry.models.length ? t('setup_surface.no_cli_state', 'No CLI') : '', false, createStatusMarker(entry.maturity)),
      disabled: entry.models.length === 0,
    })),
  ];
  return items;
}

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
 * REFRESH ALL, the one press that reads model lists (owner, 2026-09-25): every activated CLI's own
 * list and its newest release, then (`between`, KAN-236) each model service's list; never on a timer.
 * The line beside it says when it last ran. `onStep(key, state)` hears each step start and end
 * (`lists` | `accounts`, `running` | `done` | `failed`); `paint()` is the host's.
 */
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
    const when = String(drawing.runtime().refreshed_at || harnessCatalog().refreshed_at || '');
    const words = when
      ? t('setup_surface.last_ran', 'Last ran {date}', { date: dayTime(when) })
      : t('setup_surface.never_ran', 'Never run — every harness offers Native only until it runs.');
    if (lastRan.textContent !== words) lastRan.textContent = words; // an unchanged push touches nothing (KAN-414)
  };
  button.classList.add('setup-provider-refresh-all');
  bar.append(button, lastRan);
  return { el: bar, paint };
}

/**
 * THE HARNESS DRAWING (owner, 2026-10-19): a harness's page (the three steps with the terminal
 * sign-in tile, then Models) and the frame read behind it (the record, then any measure); every
 * Settings harness surface calls this. `repaint()` is the host's: it paints from `runtime()` and
 * `stones()` whenever the frame moves; `say(text, bad)` is the host's notice line.
 */
export function createHarnessDrawing(context, { repaint, say = () => {} }) {
  const action = (label, kind, onClick) => { const made = WorkspaceKit.primitives.createAction({ label, kind, action: onClick }); return made.el ?? made; };
  const yesNo = (on) => (on ? t('setup_surface.yes', 'yes') : t('setup_surface.no', 'no'));
  let alignedHarness = '';
  let mounted = null;
  let runtime = { harnesses: [] };
  // A sign-in the Helpful Assistant started (harness sign-in): its link and code under the step,
  // drawn in place on each push, so the page is never redrawn under the person.
  let signIn = { runs: [] };
  let agentWindow = null;
  const runHosts = new Map();
  const drafts = new Map();
  const paintRun = (provider) => {
    const host = runHosts.get(provider.id);
    const run = signIn.runs.find((one) => one.provider === provider.id);
    host?.replaceChildren(...(run ? [signInWindow(provider, run, drafts)] : []));
  };
  const onSignIn = (message) => {
    const ended = signIn.runs.some((one) => !(message.runs || []).some((now) => now.provider === one.provider));
    signIn = { runs: message.runs || [] };
    for (const [id, host] of runHosts) {
      if (!host.isConnected) { runHosts.delete(id); continue; }
      const provider = harnessFromRuntime(runtime, id);
      if (provider) paintRun(provider);
    }
    if (ended) void measure();
  };
  signInHandlers.add(onSignIn);
  void request('/api/setup/sign-in', { cache: 'no-store' }).then((r) => { if (r.ok) onSignIn(r.data); });
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
    const steps = harnessReadiness(provider);
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
        const path = `/api/setup/harnesses/${encodeURIComponent(provider.id)}/close`;
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
        finish(`/api/setup/harnesses/${encodeURIComponent(provider.id)}/done`);
        installRow.item.append(completion);
      }
      mounted = mountHarnessAttachment(context.environment, terminal, provider, context.workspace);
      if (!mounted) terminal.append(el('p', 'setup-notice bad', t('setup_surface.login_attachment_missing', 'The native setup session is open but its terminal attachment is unavailable.')));
    // Update is useful only when there is somewhere newer to move AND the provider is
    // usable. Otherwise the row already says the complete fact: up to date, or not signed in.
    } else if (install.status === 'installed' && provider.activated && provider.updatable && provider.update_available) {
      const label = t('setup_surface.update_to', 'Update to {latest}', { latest: provider.latest });
      const update = action(label, '', async () => {
        update.disabled = true;
        update.textContent = t('setup_surface.update_starting', 'Starting…');
        const result = await request(`/api/setup/harnesses/${encodeURIComponent(provider.id)}/update`, { method: 'POST', json: {} });
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
        const result = await request(`/api/setup/harnesses/${encodeURIComponent(provider.id)}/install`, { method: 'POST', json: {} });
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
      // The same two presses as Setup's Harness step (harness-authenticate.js); she opens in a window
      // on this surface, and a sign-in she starts shows its link and code under the step.
      authRow.item.append(signInChoices({
        agent: async () => {
          agentWindow ||= createAgentWindow();
          agentWindow.show(card.closest('.setup-surface') || card);
          const result = await authenticateWithAgent(provider);
          if (!result.ok) { problem.textContent = result.message; problem.hidden = false; }
        },
        terminal: () => press(`/api/setup/harnesses/${encodeURIComponent(provider.id)}/login`),
      }));
      const runHost = el('div', 'setup-provider-sign-in');
      runHosts.set(provider.id, runHost);
      paintRun(provider);
      authRow.item.append(runHost);
    } else if (auth.action === 'login_open') {
      const terminal = el('div', 'setup-provider-terminal');
      finish(`/api/setup/harnesses/${encodeURIComponent(provider.id)}/done`);
      authRow.item.append(terminal, completion);
      mounted = mountHarnessAttachment(context.environment, terminal, provider, context.workspace);
      if (!mounted) terminal.append(el('p', 'setup-notice bad', t('setup_surface.login_attachment_missing', 'The native setup session is open but its terminal attachment is unavailable.')));
    }
    // THE SWITCH lives on the Ready step. Activated: Turn off, with the sentence that says
    // exactly what it does and does not do. Off: Turn on. Neither touches a sign-in or a
    // running tile, and both say so where the owner presses (owner, 2026-09-09).
    const readyRow = stepRow(ready, ready.status === 'ready' ? t('setup_surface.ready_launch', 'Activated for Launch')
      : ready.status === 'off' ? t('setup_surface.off', 'Off') : t('setup_surface.not_ready', 'Not yet'));
    if (ready.status === 'ready') {
      const turnOff = action(t('setup_surface.turn_off', 'Turn off'), '', () => press(`/api/setup/harnesses/${encodeURIComponent(provider.id)}/off`));
      turnOff.classList.add('setup-provider-action', 'setup-provider-turn-off');
      readyRow.controls.append(turnOff);
    } else if (ready.status === 'off') {
      const turnOn = control(ready, t('setup_surface.turn_on', 'Turn on'), () => press(`/api/setup/harnesses/${encodeURIComponent(provider.id)}/on`));
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
  // `models`: the two-tier picker (harness-model-entries.js) in place of the plain model table.
  const paintCatalog = (rows, entry, host, label = '', { facts: withFacts = true, models = null } = {}) => {
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
    if (models) { section.append(models); host.append(section); return; }
    paintModels(rows, section, host);
  };
  /** The model table under a provider's page; the section is the caller's, appended to host here. */
  const paintModels = (rows, section, host) => {
    if (!rows.length) { section.append(el('p', 'setup-fine', t('setup_surface.no_models', 'The catalog lists no models for this harness.'))); host.append(section); return; }
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
      // A Ronin Gateway tier option (model `light`, tier light) is its name already; so is an id equal to it.
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

  const paintHarness = (id, host) => {
    const provider = harnessFromRuntime(runtime, id);
    const rows = harnessCatalog().rows.filter((row) => (provider ? row.cli === provider.id : row.provider === id));
    if (!provider && !rows.length) { host.append(el('p', 'setup-notice bad', t('setup_surface.provider_missing', 'This harness is no longer in the harness catalog.'))); return null; }
    // Hermes has no sign-in of its own: it runs on a model service, so its page is only Models.
    const harness = harnessCatalog().harnesses.find(entry => entry.cli === id);
    const openServices = (tab) => context.environment.openModelServices(tab, context.workspace);
    const editor = harness && harnessModelEditor(harnessCatalog(), harness, openServices);
    if (id === 'hermes') {
      if (editor) {
        const models = el('section', 'setup-provider-catalog');
        models.append(el('h3', 'setup-provider-eyebrow', t('setup_surface.section_models', 'Models')), editor.el);
        host.append(models);
      }
      return () => { editor?.destroy(); };
    }
    const yours = el('section', 'setup-provider-yours');
    yours.append(el('h3', 'setup-provider-eyebrow', t('setup_surface.section_yours', 'Yours')));
    if (provider) paintYours(provider, yours);
    else {
      yours.append(el('h2', '', rows[0].provider_label), el('p', 'setup-fine', t('setup_surface.no_cli', 'No CLI in Ronin’s registry serves this harness, so it cannot be installed or signed in here.')));
    }
    host.append(yours);
    paintCatalog(rows, provider, host, '', { models: editor?.el });
    if (alignedHarness !== id) {
      alignedHarness = id;
      requestAnimationFrame(() => {
        if (!host.isConnected || alignedHarness !== id) return;
        const current = host.querySelector('.setup-provider-step[data-current="true"]');
        host.scrollTop = current
          ? host.scrollTop + current.getBoundingClientRect().top - host.getBoundingClientRect().top
          : 0;
      });
    }
    return () => { editor?.destroy(); disposeMount(); };
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
    await loadHarnessCatalog();
    runtime = recordRuntime();
    await paintFrom();
  };
  /** Refresh all is the owner's press; a plain repaint reads the record. */
  const measure = async (refresh = false) => {
    const result = refresh ? await request('/api/setup/harnesses/refresh', { method: 'POST', json: {} }) : await request('/api/setup/runtime', { cache: 'no-store' });
    if (!result.ok) { say(result.message, true); return false; }
    runtime = result.data;
    await loadHarnessCatalog();
    await paintFrom();
    return true;
  };
  /** After a press: repaint the record; Setup progress performs any completion scan. */
  const paint = async (refresh = false) => { await showRecord(); return measure(refresh); };
  // Back from a browser sign-in: while a sign-in is open, coming back to this tab reads the
  // runtime once, so the step can say the CLI is signed in (KAN-723). No timer.
  const onFocus = () => { if (runtime.harnesses?.some((row) => row.login_open)) void measure(); };
  window.addEventListener('focus', onFocus);
  return {
    paintHarness, paint, showRecord, measure,
    /** The open page is gone: the next one scrolls to its current step afresh. */
    closed: () => { alignedHarness = ''; },
    runtime: () => runtime,
    stones: () => harnessStones(runtime),
    destroy: () => { window.removeEventListener('focus', onFocus); signInHandlers.delete(onSignIn); agentWindow?.destroy(); disposeMount(); },
  };
}
