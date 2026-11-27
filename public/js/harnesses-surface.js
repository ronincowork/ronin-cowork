/* part of the ronin-cowork client — see js/README.md */
/**
 * THE ONE HARNESS PANEL (owner, 27 Nov 2026; docs/architecture/harness-catalog.md, "One harness panel"). Setup's
 * Harness step and Settings' harness surfaces mount this same code: the stones of harnesses
 * (`createHarnessesSurface`), each wearing one state word (`harnessState`), and for the one pressed its panel
 * (`mountHarnessPanel`): name and state; Install or Update; Model services, first the row of services the harness
 * can use (Subscription, API key, Ronin Gateway, OpenRouter, Terminal as Backup),
 * signing in where one needs it, then its model entries under it (harness-model-entries.js); Turn off or on.
 * The place decides only where the Helpful Assistant opens (`openAgent`): Setup's work surface, Settings' window.
 * Refresh all (`createRefreshAll`) is the one press that reads the CLIs' model lists.
 */
import { t } from './lexicon.js';
import { harnessModelEditor } from './harness-model-entries.js';
import { request } from './request.js';
import { WorkspaceKit } from './workspace-kit.js';
import { dayTime, loadHarnessCatalog, harnessCatalog } from './form-steps.js';
import { createStatusMarker } from './status-marker.js';
import { createPhalanx } from './phalanx.js';
import { S } from './state.js';
import { store } from './store.js';
import { signInHandlers } from './events.js';
import { sendPress } from './press.js';
import { IRASSHAI, irasshaiIn } from './setup-journey.js';
import { openWorkbenchTab } from './workspace.js';
import { modelServicePageRequest } from './model-services-surface.js';

const el = (tag, cls = '', text = null) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };
const shortName = (provider) => String(provider?.label || provider?.id || '').replace(/ CLI$/, '');
const action = (label, kind, onClick) => { const made = WorkspaceKit.primitives.createAction({ label, kind, action: onClick }); const out = made.el ?? made; out.classList.add('harness-action'); return out; };
// Every service is an erabi stone (ask.js): `ask-opt ask-rect` with its name, in an `ask` row.
const stone = (label, onClick, word = '') => {
  const out = el('button', 'ask-opt ask-rect');
  out.type = 'button';
  out.append(el('span', 'ask-name', label));
  if (word) out.append(el('small', 'ask-word', word));
  out.addEventListener('click', () => { if (!out.disabled) onClick(); });
  return out;
};
const stoneRow = () => { const row = el('div', 'ask setup-harness-row setup-harness-ways'); row.dataset.density = 'tight'; return row; };

/** The recorded summary as a runtime: the record every reader takes, before any measure lands. */
export const recordRuntime = () => {
  const read = harnessCatalog();
  const providers = Array.isArray(read.machine) ? read.machine : [];
  return {
    harnesses: providers,
    activated_count: providers.filter((provider) => provider?.activated === true || provider?.served === true).length,
    measured_at: read.measured_at || '',
    refreshed_at: read.refreshed_at || '',
  };
};

export const harnessFromRuntime = (runtime, key) => (Array.isArray(runtime?.harnesses) ? runtime.harnesses : []).find((provider) => provider?.id === key) || null;

/* ---- the sign-in runs (src/harness-sign-in.ts), one reading for every panel and stone ---- */
let signIn = { runs: [], failed: {}, ways: {} };
let signInAsked = false;
const signInListeners = new Set();
const heardSignIn = (message) => { signIn = { runs: message.runs || [], failed: message.failed || {}, ways: message.ways || {} }; for (const fn of signInListeners) fn(); };
signInHandlers.add(heardSignIn);
const listenSignIn = (fn) => {
  if (!signInAsked) { signInAsked = true; void request('/api/setup/sign-in', { cache: 'no-store' }).then((r) => { if (r.ok) heardSignIn(r.data); }); }
  signInListeners.add(fn);
  return () => signInListeners.delete(fn);
};
const runOf = (id) => signIn.runs.find((one) => one.provider === id) || null;

/**
 * THE STATE WORD (owner, 25 and 27 Nov 2026): one word per harness, on its stone and its panel alike. It names
 * the state, not what to do. Active: its own sign-in or any model service gives it models.
 */
export function harnessState(provider) {
  if (!provider) return '';
  if (provider.install_open) return t('harness.installing', 'Installing');
  if (!provider.installed) return t('harness.not_installed', 'Not installed');
  if (provider.off) return t('harness.off', 'Off');
  if (provider.login_open || runOf(provider.id)) return t('harness.signing_in', 'Signing in');
  if (provider.activated || provider.served) return t('harness.active', 'Active');
  return t('harness.no_service', 'No model service');
}

/** A catalog provider no registry CLI serves is a stone of its own, keyed by its vendor id. */
const catalogOnly = (runtime) => {
  const known = new Set((runtime.harnesses || []).map((provider) => provider?.id));
  return (harnessCatalog().harnesses || []).filter((entry) => !known.has(entry.cli));
};
const modelCount = (vendor, n) => n === 1 ? t('setup_surface.provider_models_1', '{vendor} · 1 model', { vendor }) : t('setup_surface.provider_models_n', '{vendor} · {n} models', { vendor, n });

/** THE STONES, one builder: every CLI the runtime knows wearing its state word, then every catalog provider no
 * CLI serves. The stones and the selector's cards read this. */
export function harnessStones(runtime) {
  const rows = harnessCatalog().rows;
  const providers = (Array.isArray(runtime.harnesses) ? runtime.harnesses : []).filter((provider) => provider?.id);
  const stoneOf = (id, label, secondary, state, active, marker = null) => ({ id, label, secondary, state, marker, className: 'setup-provider-stone', attrs: { 'data-provider': id, 'data-activated': String(active) } });
  return [
    ...providers.map((provider) => {
      const own = rows.filter((row) => row.cli === provider.id);
      const vendor = own[0]?.provider_label || provider.from || '';
      const entry = (harnessCatalog().harnesses || []).find((candidate) => candidate.cli === provider.id);
      return stoneOf(String(provider.id), shortName(provider), own.length ? modelCount(vendor, own.length) : vendor, harnessState(provider), provider.activated === true || provider.served === true, createStatusMarker(entry?.maturity));
    }),
    ...catalogOnly(runtime).map((entry) => ({
      ...stoneOf(entry.provider, entry.label, entry.models.length ? modelCount(entry.label, entry.models.length) : '', entry.models.length ? t('setup_surface.no_cli_state', 'No CLI') : '', false, createStatusMarker(entry.maturity)),
      disabled: entry.models.length === 0,
    })),
  ];
}

/**
 * ONE STEP, the shape Refresh's steps draw: a mark that says done, current, failed or its number; the label
 * with its state beside it; at most one short line; then its controls.
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
 * REFRESH ALL, the one press that reads model lists (owner, 2026-09-25): every activated CLI's own list and its
 * newest release, then (`between`, KAN-236) each model service's list; never on a timer.
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
 * THE FRAME every harness surface reads: the record, then any measure. `repaint()` is the host's: it paints from
 * `runtime()` and `stones()` whenever the frame moves; an open panel hears it too (`onFrame`).
 */
export function createHarnessDrawing(context, { repaint, say = () => {} }) {
  let runtime = { harnesses: [] };
  const frames = new Set();
  const paintFrom = async () => {
    if (context.environment) context.environment.setupRuntime = runtime;
    context.environment?.onSetupRuntime?.(runtime);
    await repaint();
    for (const fn of frames) fn();
  };
  const showRecord = async () => { await loadHarnessCatalog(); runtime = recordRuntime(); await paintFrom(); };
  /** Refresh all is the owner's press; a plain measure reads the record the server holds. */
  const measure = async (refresh = false) => {
    const result = refresh ? await request('/api/setup/harnesses/refresh', { method: 'POST', json: {} }) : await request('/api/setup/runtime', { cache: 'no-store' });
    if (!result.ok) { say(result.message, true); return false; }
    runtime = result.data;
    await loadHarnessCatalog();
    await paintFrom();
    return true;
  };
  const paint = async (refresh = false) => { await showRecord(); return measure(refresh); };
  // Back from a browser sign-in: coming back to this tab reads the runtime once while one is open (KAN-723). No timer.
  const onFocus = () => { if (runtime.harnesses?.some((row) => row.login_open)) void measure(); };
  window.addEventListener('focus', onFocus);
  const api = {
    paint, showRecord, measure,
    runtime: () => runtime,
    stones: () => harnessStones(runtime),
    onFrame: (fn) => { frames.add(fn); return () => frames.delete(fn); },
    paintHarness: (id, host, options = {}) => mountHarnessPanel(host, id, { drawing: api, context, ...options }),
    destroy: () => { window.removeEventListener('focus', onFocus); frames.clear(); },
  };
  return api;
}

/** What Turn off does and does not do, said where it is pressed. */
const TURN_OFF_SENTENCE = () => t('harness.turn_off_line', 'Turn off stops Ronin measuring, updating and launching it. Tiles already running are not touched, and every sign-in is kept.');
/** Hermes keeps no sign-in of its own: it runs only on model services, so it has no Terminal. */
const NO_TERMINAL = new Set(['hermes']);

/**
 * ONE HARNESS'S PANEL, drawn into `host`; returns its dispose. `openAgent()` is the place's: where the Helpful
 * Assistant opens when a sign-in she helps with starts.
 */
export function mountHarnessPanel(host, id, { drawing, context = {}, openAgent = () => {} } = {}) {
  const card = el('article', 'harness-panel');
  card.dataset.provider = id;
  host.append(card);
  const base = `/api/setup/harnesses/${encodeURIComponent(id)}`;
  const drafts = new Map();
  let switching = '';
  let problem = '';
  let terminalHost = null;
  let mounted = null;
  let mountedKey = '';
  let editor = null;
  let disposed = false;
  const openServices = (tab) => (context.environment?.openModelServices
    ? context.environment.openModelServices(tab, context.workspace)
    : openWorkbenchTab(modelServicePageRequest(tab)));
  const tellHer = (text) => { if (irasshaiIn(S.sessions)) void sendPress(IRASSHAI, text); };
  const press = async (path, json = {}) => {
    const result = await request(path, { method: 'POST', json });
    if (!result.ok) { problem = result.message; paint(); return result; }
    problem = '';
    await drawing.measure();
    return result;
  };
  const catalogEntry = () => (harnessCatalog().harnesses || []).find((entry) => entry.cli === id) || null;
  const newEditor = () => {
    editor?.destroy();
    const entry = catalogEntry();
    // One API key per harness (owner, 27 Nov 2026): its own key login where it has one, else a key in the vault.
    const own = harnessFromRuntime(drawing.runtime(), id)?.direct_sign_in === true;
    editor = entry ? harnessModelEditor(harnessCatalog(), entry, openServices, { skip: own ? ['private_api'] : [] }) : null;
    editor?.onChange(() => { if (!disposed) paint(); });
  };

  /** The one terminal on the panel: the sign-in, install or update session, kept across repaints. */
  const terminalFor = (provider) => {
    const key = provider.attachment?.key || '';
    if (mounted && mountedKey === key) return terminalHost;
    stopCopy(); copyRow = null;
    mounted?.destroy?.();
    terminalHost = el('div', 'setup-harness-terminal');
    mountedKey = key;
    const environment = context.environment;
    mounted = key && typeof environment?.mountHarnessSetupSession === 'function'
      ? environment.mountHarnessSetupSession({ host: terminalHost, provider, session: key, workspace: context.workspace, onClosed: () => { mounted = null; mountedKey = ''; } })
      : null;
    if (!mounted) terminalHost.append(el('p', 'setup-harness-line bad', t('harness.no_terminal', 'The terminal is open but cannot be shown here.')));
    return terminalHost;
  };
  const dropTerminal = () => { stopCopy(); mounted?.destroy?.(); mounted = null; mountedKey = ''; terminalHost = null; copyRow = null; };

  /* UNDER A SIGN-IN TERMINAL (owner, 27 Nov 2026): Copy code, Show URL then Copy link, and Go Back, from what the
   * screen shows. Read, and pressed for the person only where the screen itself offers it: its "show full URL"
   * clicked where it is drawn, its go-back key sent. What was seen stays: a code that leaves the screen when the
   * URL is shown is still the code. */
  // A device code as sign-ins print it: two groups of four or five letters and digits (9Q3Z-9V69).
  const CODE = /\b[A-Z0-9]{4,5}-[A-Z0-9]{4,5}\b/g;
  const LINK = /https:\/\/[^\s<>"'│]+/g;
  const SHOW_URL = /show full url/i;
  // The key the screen names for going back ("esc go back", "ctrl+b back").
  const BACK = /\b(esc|ctrl\+[a-z])\s+(?:to\s+)?(?:go\s+)?back\b/i;
  const keyOf = (name) => (name.toLowerCase() === 'esc' ? '\x1b' : String.fromCharCode(name.toLowerCase().charCodeAt(5) - 96));
  const last = (text, pattern) => (text.match(pattern) || []).pop() || '';
  let copyRow = null;
  let stopCopy = () => {};
  const copyStones = () => {
    if (copyRow) return copyRow;
    copyRow = el('div', 'ask setup-harness-row setup-harness-ways harness-terminal-stones'); copyRow.dataset.density = 'tight';
    const said = el('p', 'setup-fine'); said.hidden = true;
    let seen = { code: '', link: '', show: false, back: '' };
    const copy = (value) => { void navigator.clipboard?.writeText(value).then(() => { said.textContent = t('setup_harness.copied', 'Copied.'); said.hidden = false; }, () => {}); };
    /** A click where the screen draws its own "show full URL" (SGR mouse, as the CLI's mouse mode reads it). */
    const showUrl = () => {
      const at = mounted?.locate?.(SHOW_URL);
      if (!at) return;
      const col = at.col + 6;
      mounted?.send?.(`\x1b[<0;${col};${at.row}M\x1b[<0;${col};${at.row}m`);
    };
    const paintCopy = () => {
      const code = stone(t('harness.copy_code', 'Copy code'), () => { if (seen.code) copy(seen.code); }, seen.code || t('harness.no_code', 'No code yet'));
      code.disabled = !seen.code;
      const link = seen.link
        ? stone(t('harness.copy_link', 'Copy link'), () => copy(seen.link))
        : stone(t('harness.show_url', 'Show URL'), showUrl);
      if (!seen.link && !seen.show) link.disabled = true;
      const stones = [code, link];
      if (seen.back) stones.push(stone(t('harness.go_back', 'Go Back'), () => { mounted?.send?.(keyOf(seen.back)); }));
      copyRow.replaceChildren(...stones, said);
    };
    const scan = () => {
      const text = mounted?.screenText?.() || '';
      const next = { code: last(text, CODE) || seen.code, link: last(text, LINK) || seen.link, show: SHOW_URL.test(text), back: text.match(BACK)?.[1] || '' };
      if (next.code === seen.code && next.link === seen.link && next.show === seen.show && next.back === seen.back) return;
      seen = next;
      paintCopy();
    };
    paintCopy();
    scan();
    stopCopy = mounted?.onOutput?.(scan) || (() => {});
    return copyRow;
  };

  /** What the person must do now in a sign-in run, from what the CLI printed. */
  const runWindow = (provider, run) => {
    const box = el('div', 'setup-harness-window');
    const line = run.paste === 'key' ? t('setup_harness.paste_key', 'Paste your API key. It goes straight to {cli}.', { cli: shortName(provider) })
      : run.paste === 'code' ? t('setup_harness.paste_code', 'Open the link, sign in, and paste the code it gives you here.')
        : t('setup_harness.enter_code', 'Open the link, sign in, and enter this code.');
    box.append(el('p', 'setup-harness-line', run.sent ? t('setup_harness.sent', 'Sent. Finishing the sign-in…') : line));
    if (run.link) { const link = el('a', 'setup-harness-link', run.link.replace(/^https:\/\//, '').replace(/[?#].*$/, '')); link.href = run.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.append(link); }
    if (run.code) box.append(el('span', 'setup-harness-code', run.code));
    const row = el('div', 'ask setup-harness-row'); row.dataset.density = 'tight';
    if (run.code) row.append(stone(t('setup_harness.copy', 'Copy'), () => { void navigator.clipboard?.writeText(run.code).catch(() => {}); }));
    if (run.paste && !run.sent) {
      const input = el('input', 'setup-harness-input');
      input.type = run.paste === 'key' ? 'password' : 'text';
      input.autocomplete = 'off';
      input.placeholder = run.paste === 'key' ? t('setup_harness.key_hint', 'API key') : t('setup_harness.code_hint', 'Code');
      input.value = drafts.get(run.provider) || '';
      input.addEventListener('input', () => drafts.set(run.provider, input.value));
      const send = stone(t('setup_harness.send', 'Send'), async () => {
        send.disabled = true;
        const result = await request(`${base}/sign-in/paste`, { method: 'POST', json: { text: input.value } });
        if (result.ok) { drafts.delete(run.provider); tellHer(`${shortName(provider)} · Sent the ${run.paste}`); } else send.disabled = false;
      });
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') send.click(); });
      row.append(input, send);
    }
    row.append(stone(t('setup_harness.cancel', 'Cancel'), async () => { const r = await request(`${base}/sign-in/cancel`, { method: 'POST', json: {} }); if (r.ok) tellHer(`${shortName(provider)} · Cancel sign-in`); }));
    box.append(row);
    return box;
  };

  /** A terminal on the panel with what ends it: Done records the sign-in (it re-measures), Cancel ends it. */
  /** What ends a terminal: Done records the sign-in (it re-measures), Cancel ends it. */
  const doneStone = () => stone(t('setup_surface.done', 'Done'), async () => { const r = await press(`${base}/done`); if (r.ok) mounted?.park?.(); });
  const cancelStone = (provider) => stone(t('setup_surface.cancel', 'Cancel'), async () => { const r = await press(`${base}/close`); if (r.ok) tellHer(`${shortName(provider)} · Close sign-in`); });
  const terminalWindow = (provider, { line = '', done = true, copy = false } = {}) => {
    const box = el('div', 'setup-harness-window');
    if (line) box.append(el('p', 'setup-harness-line', line));
    box.append(terminalFor(provider));
    // One line under the terminal: what the screen offers (Copy code, Copy link, its key) at the start, and
    // what ends it (Done, Cancel) at the end.
    // A sign-in's Done and Cancel stand in the service row where Terminal was (owner, 27 Nov 2026); under the
    // terminal, what its screen offers. An install or update keeps its ends here.
    if (copy) { if (mounted) box.append(copyStones()); return box; }
    const row = el('div', 'ask setup-harness-row setup-harness-ways'); row.dataset.density = 'tight';
    if (done) row.append(doneStone());
    row.append(cancelStone(provider));
    box.append(row);
    return box;
  };

  /* ---- MODEL SERVICES, part 1: the row of services, signing in where one needs it ---- */
  const servicesPart = (provider) => {
    const part = el('section', 'harness-panel-part');
    part.append(el('h3', 'setup-provider-eyebrow', t('harness.model_services', 'Model services')));
    const run = runOf(id);
    const cli = shortName(provider);
    // Signed in on its own already: a new in-harness sign-in signs out every Agent on it (owner, w994).
    const signedIn = provider.signed_in === true;
    const current = signIn.ways[id] || '';
    const warnFirst = (key, go) => () => {
      if (signedIn && switching !== key) { switching = key; paint(); return; }
      switching = '';
      void go();
    };
    const start = (way) => async () => {
      openAgent();
      const result = await request(`${base}/sign-in`, { method: 'POST', json: { way, tell: IRASSHAI } });
      if (!result.ok) { problem = result.message; paint(); return; }
      problem = '';
      void sendPress(IRASSHAI, `${cli} · Sign in with ${way === 'api_key' ? 'API key' : 'subscription'}`);
    };
    const row = stoneRow();
    if (provider.direct_sign_in) {
      const sub = stone(t('harness.subscription', 'Subscription'), warnFirst('subscription', start('subscription')));
      sub.setAttribute('aria-selected', String(current === 'subscription'));
      const key = stone(t('harness.api_key', 'API key'), warnFirst('api_key', start('api_key')));
      key.setAttribute('aria-selected', String(current === 'api_key'));
      if (run) { sub.disabled = true; key.disabled = true; }
      row.append(sub, key);
    }
    if (editor) row.append(...editor.stones());
    if (!NO_TERMINAL.has(id) && provider.login_open && !run) row.append(doneStone(), cancelStone(provider));
    else if (!NO_TERMINAL.has(id)) {
      // Terminal: the harness's own sign-in by hand, the backup to the others (owner, 27 Nov 2026).
      const terminal = stone(t('harness.terminal', 'Terminal'), warnFirst('terminal', async () => {
        const result = await press(`${base}/login`);
        if (result.ok) tellHer(`${cli} · Terminal`);
      }), row.children.length ? t('harness.backup', 'Backup') : ''); // the only way is no one's backup
      terminal.setAttribute('aria-selected', 'false');
      if (run) terminal.disabled = true;
      row.append(terminal);
    }
    part.append(el('p', 'setup-harness-line', t('harness.services_line', 'Choose how {cli} gets its models. Sign in where a service needs it.', { cli })), row);
    if (run) part.append(runWindow(provider, run));
    else if (provider.login_open) part.append(terminalWindow(provider, { line: provider.sign_in_how || '', copy: true }));
    const said = switching
      ? t('harness.signed_in_already', 'Signing in again signs out every {cli} Agent until you finish. Press it again to go ahead.', { cli })
      : current === 'subscription' ? t('harness.on_subscription', 'Signed in with your subscription.')
        : current === 'api_key' ? t('harness.on_api_key', 'Signed in with an API key.')
          : signedIn ? t('harness.signed_in', 'Signed in on this office.') : '';
    if (said && !run && !provider.login_open) part.append(el('p', 'setup-harness-line', said));
    const failed = signIn.failed[id] || '';
    if (failed && !run) part.append(el('p', 'setup-harness-line bad', failed));
    return part;
  };

  /* ---- MODEL SERVICES, part 2: the model entries of each service that is on ---- */
  const entriesPart = () => {
    const part = el('section', 'harness-panel-part');
    part.append(el('h3', 'setup-provider-eyebrow', t('harness.model_entries', 'Model entries')));
    if (editor) part.append(editor.entries);
    else part.append(el('p', 'setup-fine', t('setup_surface.no_models', 'The catalog lists no models for this harness.')));
    return part;
  };

  /** Install, or the installer open; then Update when a newer release is there, or the update open. */
  const installPart = (provider) => {
    const part = el('section', 'harness-panel-part');
    if (provider.install_open) { part.append(terminalWindow(provider, { line: t('harness.install_open', 'Finish the installation in the terminal, then press Done.') })); return part; }
    if (!provider.installed) {
      const command = String(provider.install || '').trim();
      if (command) part.append(el('code', 'setup-provider-command', command));
      if (provider.installable) part.append(action(t('setup_surface.install', 'Install'), 'primary', () => press(`${base}/install`)));
      else {
        if (provider.blocked) part.append(el('p', 'setup-harness-line', provider.blocked));
        const guide = id === 'hermes' ? 'https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md' : '';
        if (guide) { const link = el('a', 'wk-action harness-action', t('harness.install_guide', 'Install guide')); link.href = guide; link.target = '_blank'; link.rel = 'noopener noreferrer'; part.append(link); }
      }
      return part;
    }
    if (provider.update_open) { part.append(terminalWindow(provider, { done: false, line: t('harness.update_open', 'Updating: when it has printed the new version, press Cancel. Tiles already running keep their version.') })); return part; }
    if (provider.activated && provider.updatable && provider.update_available && provider.latest) {
      part.append(action(t('setup_surface.update_to', 'Update to {latest}', { latest: provider.latest }), '', () => press(`${base}/update`)));
      return part;
    }
    return null;
  };

  const paint = () => {
    if (disposed) return;
    const provider = harnessFromRuntime(drawing.runtime(), id);
    const entry = catalogEntry();
    const head = el('header', 'harness-panel-head');
    const title = el('div', 'harness-panel-title');
    title.append(el('h2', '', provider ? shortName(provider) : entry?.label || id));
    const from = provider?.from || entry?.label || '';
    if (from && provider) title.append(el('p', 'setup-provider-from', t('setup_surface.provider_from', 'From {vendor}', { vendor: from })));
    head.append(title);
    if (provider) head.append(el('span', 'harness-panel-state', harnessState(provider)));
    const parts = [head];
    if (!provider) {
      parts.push(el('p', 'setup-fine', entry ? t('setup_surface.no_cli', 'No CLI in Ronin’s registry serves this harness, so it cannot be installed or signed in here.') : t('setup_surface.provider_missing', 'This harness is no longer in the harness catalog.')));
      card.replaceChildren(...parts);
      return;
    }
    const install = installPart(provider);
    if (install) parts.push(install);
    if (provider.off) {
      const part = el('section', 'harness-panel-part');
      part.append(el('p', 'setup-harness-line', t('harness.off_line', 'Turned off: Ronin is not using {cli}. Every sign-in is kept.', { cli: shortName(provider) })),
        action(t('setup_surface.turn_on', 'Turn on'), 'primary', () => press(`${base}/on`)));
      parts.push(part);
    } else if (provider.installed && !provider.install_open) {
      parts.push(servicesPart(provider), entriesPart());
      const part = el('section', 'harness-panel-part');
      part.append(el('p', 'setup-fine', TURN_OFF_SENTENCE()), action(t('setup_surface.turn_off', 'Turn off'), '', () => press(`${base}/off`)));
      parts.push(part);
    }
    if (problem) parts.push(el('p', 'setup-harness-line bad', problem));
    if (!provider.login_open && !provider.install_open && !provider.update_open && mounted) dropTerminal();
    card.replaceChildren(...parts);
    // The terminal was made before the panel was on the page: fit it to its box once it is, so the CLI draws
    // at the size it is shown, not at whatever it guessed.
    if (mounted) requestAnimationFrame(() => { if (!disposed) mounted?.fit?.(); });
  };

  newEditor();
  // A run that ended has signed in or not: read the record again, which repaints.
  let running = Boolean(runOf(id));
  const stopSignIn = listenSignIn(() => {
    const now = Boolean(runOf(id));
    if (running && !now) void drawing.measure();
    running = now;
    paint();
  });
  const stopFrame = drawing.onFrame(() => { newEditor(); paint(); });
  paint();
  return () => { disposed = true; stopSignIn(); stopFrame(); dropTerminal(); editor?.destroy(); card.remove(); };
}

/**
 * THE HARNESSES SURFACE, Setup's and Settings' alike: the stones; a pressed one opens its panel in place of them
 * (phalanx.js, KAN-939). `openAgent(surfaceEl)` is the place's; `decorate` dresses a stone (Settings' drag).
 */
export function createHarnessesSurface(context, { label, className = '', openAgent = () => {}, decorate = (one) => one } = {}) {
  const out = WorkspaceKit.primitives.createSurface({ label, className: `setup-surface setup-provider-surface harness-surface ${className}`.trim() });
  const notice = el('p', 'setup-fine setup-provider-notice'); notice.hidden = true;
  const say = (text, bad = false) => { notice.className = `${bad ? 'setup-notice bad' : 'setup-fine'} setup-provider-notice`; notice.textContent = text; notice.hidden = !text; };
  const drawing = createHarnessDrawing(context, { repaint: () => repaint(), say });
  const stones = createPhalanx({
    className: 'setup-provider-stones',
    renderDetail: (item, host) => drawing.paintHarness(item.id, host, { openAgent: () => openAgent(out.el) }),
  });
  stones.mount(out.content, { after: [notice] });
  const repaint = () => {
    context.workbench?.refreshSelector?.();
    const items = drawing.stones();
    say(items.length ? '' : t('setup_surface.no_catalog', 'No harnesses are in the catalog on this machine.'));
    stones.setItems(items.map(decorate));
  };
  // A sign-in run moving turns its stone Signing in and back; Setup's progress moving reads the record again.
  const stopSignIn = listenSignIn(() => repaint());
  const stopProgress = context.environment?.onSetupProgress?.(() => { void drawing.measure(); }) || (() => {});
  // Anyone's model service write (a key added, the gateway's list read) moves the services and their entries.
  const stopServices = store.listen('model-services-changed', () => { void drawing.measure(); });
  void drawing.paint();
  return {
    el: out.el,
    show: async () => { await drawing.measure(); },
    destroy: () => { stopSignIn(); stopProgress(); stopServices?.(); drawing.destroy(); stones.destroy(); },
  };
}
