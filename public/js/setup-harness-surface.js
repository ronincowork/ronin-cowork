/* part of the ronin-cowork client — see js/README.md */
/**
 * THE HARNESS STEP, SETUP'S WORKSPACE 2 (owner, 24 Nov 2026; docs/architecture/setup-workbench.md;
 * the owner's prototype O2-Setup-Harnesses): one thin bar per harness, drawn from the measured runtime.
 *
 *  - Signed in: the bar says so. Off: the bar says so.
 *  - Not signed in, every harness has the same two presses (harness-authenticate.js; owner, 27 Nov
 *    2026): Authenticate with Agent (recommended), which shows the Helpful Assistant in the work
 *    surface and tells her, and Terminal, the harness's own sign-in on its tile in the bar, then Done.
 *    A sign-in she starts on Claude Code or Codex (src/harness-sign-in.ts) shows in the bar only what
 *    the person must do: the link, the code, a box for the code or key, and Cancel.
 *  - Hermes keeps its own connections, opened in its bar.
 *
 * Opening a bar tells nobody. A sign-in press also tells the Helpful Assistant, when she is here, what
 * was pressed (press.js), and the run reports its end to her.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { WorkspaceKit } from './workspace-kit.js';
import { S } from './state.js';
import { signInHandlers } from './events.js';
import { sendPress } from './press.js';
import { IRASSHAI, irasshaiIn } from './setup-journey.js';
import { recordRuntime } from './harnesses-surface.js';
import { mountHarnessAttachment } from './setup-harness-state.js';
import { modelSettingsLink } from './harness-model-entries.js';
import { mountHermesServices } from './setup-hermes-services.js';
import { authenticateWithAgent, openTerminalSignIn, shortName, signInChoices, signInRow, signInStone, signInWindow } from './harness-authenticate.js';

export const HARNESS_SURFACE_TYPE = 'setup.harness';

const el = (tag, cls = '', text = null) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };

/** A way inside a sentence: "subscription", "API key". */
const wayWord = (way) => (way === 'api_key' ? t('setup_harness.api_key_word', 'API key') : t('setup_harness.subscription_word', 'subscription'));

export function harnessSurfaceDefinition() {
  return { type: HARNESS_SURFACE_TYPE, header: 'surface', label: () => t('setup_harness.label', 'Harness'), create: (context) => createHarnessSurface(context) };
}

function createHarnessSurface(context) {
  const out = WorkspaceKit.primitives.createSurface({ label: t('setup_harness.label', 'Harness'), className: 'setup-surface setup-harness' });
  const body = el('div', 'setup-harness-body');
  const stack = el('div', 'setup-harness-stack');
  const note = el('p', 'setup-harness-note');
  // Settings, in its own tab, holds each harness's page, its models and the office defaults.
  const more = el('p', 'setup-harness-note');
  more.append(t('setup_harness.more', 'Defaults and models are in '), modelSettingsLink('', t('settings2.title', 'Settings')), '.');
  body.append(stack, note, more);
  out.content.append(body);
  let runtime = recordRuntime();
  let signIn = { runs: [], failed: {}, ways: {} };
  // The office's Ronin API account: which harnesses run on the gateway (always on: every office runs it).
  let gateway = { harnesses: [] };
  // A press while signed in asks once more (owner, w994): '<harness><press>' of the one pressed.
  let switching = '';
  let open = '';
  let mounted = null;
  let terminalHost = null;
  let hermesHost = null;
  let hermesStop = null;
  let disposed = false;
  // What the person is typing survives a repaint (a push may land mid-word).
  const drafts = new Map();

  const hers = () => (irasshaiIn(S.sessions) ? IRASSHAI : '');
  const post = (path, json = {}) => request(path, { method: 'POST', json });
  const readRuntime = async () => {
    const [r, a] = await Promise.all([request('/api/setup/runtime', { cache: 'no-store' }), request('/api/model-services', { cache: 'no-store' })]);
    if (disposed) return;
    const house = a.ok ? (a.data.services || []).find((one) => one.service_type === 'gateway' && one.configured) : null;
    gateway = { harnesses: house?.bound || [] };
    if (r.ok) runtime = r.data;
    paint();
  };

  /** A press that changes what an Agent can run on goes to her as the person's [Button] line (docs/architecture/setup-workbench.md, See and Chat). */
  const pressed = (text) => { const to = hers(); if (to) void sendPress(to, text); };

  // The two presses (harness-authenticate.js): she opens in the work surface, Workspace 1.
  const agent = async (provider) => {
    context.environment?.showAssistant?.();
    const result = await authenticateWithAgent(provider, { opened: true });
    if (!result.ok) { signIn.failed[provider.id] = result.message; paint(); }
  };
  const terminal = async (provider) => {
    const result = await openTerminalSignIn(provider);
    if (!result.ok) { signIn.failed[provider.id] = result.message; paint(); return; }
    delete signIn.failed[provider.id];
    pressed(`${shortName(provider)} · Terminal`);
    await readRuntime();
  };


  /** An open terminal sign-in, in the bar: its tile, then Done and Cancel. */
  const terminalOf = (provider) => {
    const box = el('div', 'setup-harness-window');
    if (provider.sign_in_how) box.append(el('p', 'setup-harness-line', provider.sign_in_how));
    // One host for the open terminal, kept across repaints so the tile is never torn down by one.
    terminalHost ||= el('div', 'setup-harness-terminal');
    const end = async (verb, said) => {
      const r = await post(`/api/setup/harnesses/${encodeURIComponent(provider.id)}/${verb}`);
      if (!r.ok) { signIn.failed[provider.id] = r.message; paint(); return; }
      mounted?.destroy?.(); mounted = null; terminalHost = null;
      pressed(`${shortName(provider)} · ${said}`);
      await readRuntime();
    };
    const row = signInRow();
    row.append(signInStone(t('setup_surface.done', 'Done'), () => end('done', 'Done')), signInStone(t('setup_harness.cancel', 'Cancel'), () => end('close', 'Cancel sign-in')));
    box.append(terminalHost, row);
    if (!mounted) mounted = mountHarnessAttachment(context.environment, terminalHost, provider, context.workspace, () => { mounted = null; });
    return box;
  };

  const barOf = (provider) => {
    const run = signIn.runs.find((one) => one.provider === provider.id);
    const failed = signIn.failed[provider.id] || '';
    const own = provider.direct_sign_in === true;
    const hermes = provider.id === 'hermes';
    const signed = provider.activated === true;
    const selected = Boolean(run) || open === provider.id;
    const bar = el('div', `setup-harness-bar${selected ? ' selected' : ''}${signed ? ' signed' : ''}`);
    bar.dataset.provider = provider.id;
    // The whole row is the press (owner, 24 Nov). The tile says Harness, so names drop " CLI".
    const top = el('button', 'setup-harness-top');
    top.type = 'button';
    const name = el('div', 'setup-harness-name');
    name.append(el('b', '', shortName(provider)), el('small', '', provider.from || ''));
    top.append(name);
    // THE BAR NAMES THE STATE, NOT WHAT TO DO (owner, 25 Nov 2026). Active, not Signed in: the Ronin
    // gateway runs with no sign-in at all.
    const state = provider.off ? t('setup_harness.off', 'Off') : signed ? t('setup_harness.active', 'Active')
      : run ? t('setup_harness.signing_in', 'Signing in') : t('setup_harness.not_set_up', 'Not set up');
    top.append(el('span', 'setup-harness-go', state));
    top.disabled = Boolean(run);
    top.addEventListener('click', () => { open = open === provider.id ? '' : provider.id; paint(); });
    bar.append(top);
    if (!selected) return bar;
    bar.append(modelSettingsLink(provider.id));
    if (run) bar.append(signInWindow(provider, run, drafts, pressed));
    else if (hermes) {
      // Mounted once while its bar is open, so a repaint keeps what is being edited there.
      if (!hermesHost) { hermesHost = el('div', 'setup-harness-window'); hermesStop = mountHermesServices(hermesHost); }
      bar.append(hermesHost);
    }
    else if (provider.login_open) bar.append(terminalOf(provider));
    else if (provider.off || (signed && !own)) {
      bar.append(el('p', 'setup-harness-line', provider.off ? t('setup_harness.off_line', 'Turned off. Your sign-in is kept.') : t('setup_harness.signed_line', 'Signed in on this office.')));
    } else {
      // The way it is on, as its CLI says (src/harness-sign-in.ts readWays).
      const current = signed ? signIn.ways[provider.id] || '' : '';
      const presses = { agent, terminal };
      const go = (choice) => {
        // SIGNED IN ALREADY: WARN FIRST (owner, w994, 25 Nov 2026). A CLI's login revokes the sign-in
        // every Agent on that harness runs on, the moment it starts; the first press says so, the
        // second goes ahead.
        if (signed && switching !== `${provider.id}:${choice}`) { switching = `${provider.id}:${choice}`; paint(); return; }
        switching = '';
        void presses[choice](provider);
      };
      const line = switching.split(':')[0] === provider.id
        ? t('setup_harness.signed_in_again', 'You\u2019re already signed in. Signing in again signs out every {cli} Agent until it finishes. Press it again to continue.', { cli: shortName(provider) })
        : current ? t('setup_harness.on_way', 'Signed in with your {way}.', { way: wayWord(current) })
          : signed ? t('setup_harness.signed_line', 'Signed in on this office.') : '';
      if (line) bar.append(el('p', 'setup-harness-line', line));
      bar.append(signInChoices({ agent: () => go('agent'), terminal: () => go('terminal') }));
      if (gateway.harnesses.includes(provider.id)) bar.append(el('p', 'setup-harness-line', t('setup_harness.gateway_line', 'No sign-in needed: pick a Ronin model under Model when you start a {cli} Agent. Your {cli} sign-in stays as it is.', { cli: shortName(provider) })));
    }
    if (failed && !run) bar.append(el('p', 'setup-harness-line bad', failed));
    return bar;
  };

  const paint = () => {
    if (disposed) return;
    const harnesses = (runtime.harnesses || []).filter((provider) => provider?.installed);
    if (open !== 'hermes') { hermesStop?.(); hermesStop = null; hermesHost = null; }
    if (mounted && !harnesses.some((provider) => provider.login_open && open === provider.id)) { mounted.destroy?.(); mounted = null; terminalHost = null; }
    stack.replaceChildren(...harnesses.map(barOf));
    const signed = harnesses.filter((provider) => provider.activated).length;
    note.textContent = signed === 0 ? t('setup_harness.note_none', 'One harness is enough to start. You sign in with your own subscription or API key.')
      : t('setup_harness.note_some', '{n} of {m} signed in. A second one keeps your Agents working when one hits a limit.', { n: signed, m: harnesses.length });
  };

  const onSignIn = (message) => { signIn = { runs: message.runs || [], failed: message.failed || {}, ways: message.ways || {} }; paint(); };
  signInHandlers.add(onSignIn);
  const stopProgress = context.environment?.onSetupProgress?.(() => { void readRuntime(); }) || (() => {});
  void request('/api/setup/sign-in', { cache: 'no-store' }).then((r) => { if (r.ok) onSignIn(r.data); });
  void readRuntime();
  paint();
  return {
    el: out.el,
    destroy: () => { disposed = true; signInHandlers.delete(onSignIn); stopProgress(); mounted?.destroy?.(); },
  };
}
