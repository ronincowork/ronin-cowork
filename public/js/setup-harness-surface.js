/* part of the ronin-cowork client — see js/README.md */
/**
 * THE HARNESS STEP, SETUP'S WORKSPACE 2 (owner, 24 Nov 2026; samurai_lab/wip/SETUP_HARNESS.md;
 * the owner's prototype O2-Setup-Harnesses): one thin bar per harness, drawn from the measured runtime.
 *
 *  - Signed in: the bar says so. Off: the bar says so.
 *  - A harness Ronin signs in itself (AGENTS `login`: Claude Code, Codex): Sign in opens the bar on two
 *    presses, Sign in with your subscription and Use an API key. Either starts the CLI's own login
 *    (src/provider-sign-in.ts); the bar then shows only what the person must do: the link, the code, a
 *    box for the code or key the CLI waits for, and Cancel. It closes when the CLI exits; the measure
 *    that follows turns it Signed in.
 *  - Any other harness signs in on its terminal tile in the bar, with Close.
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
import { recordRuntime } from './provider-surface.js';
import { mountProviderAttachment } from './setup-provider-state.js';
import { mountHermesSurface } from './hermes-surface.js';

export const HARNESS_SURFACE_TYPE = 'setup.harness';

const el = (tag, cls = '', text = null) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };
const button = (label, primary, onClick) => { const out = el('button', `wk-btn setup-harness-btn${primary ? ' primary' : ''}`, label); out.type = 'button'; out.addEventListener('click', onClick); return out; };

const WAYS = Object.freeze({
  subscription: () => t('setup_harness.subscription', 'Sign in with your subscription'),
  api_key: () => t('setup_harness.api_key', 'Use an API key'),
});

export function harnessSurfaceDefinition() {
  return { type: HARNESS_SURFACE_TYPE, header: 'surface', label: () => t('setup_harness.label', 'Harness'), create: (context) => createHarnessSurface(context) };
}

function createHarnessSurface(context) {
  const out = WorkspaceKit.primitives.createSurface({ label: t('setup_harness.label', 'Harness'), className: 'setup-surface setup-harness' });
  const head = el('p', 'setup-harness-head', t('setup_harness.head', '1 · Harnesses'));
  const stack = el('div', 'setup-harness-stack');
  const note = el('p', 'setup-harness-note');
  out.content.append(head, stack, note);
  let runtime = recordRuntime();
  let signIn = { runs: [], failed: {} };
  let open = '';
  let mounted = null;
  let terminalHost = null;
  let hermesHost = null;
  let disposed = false;
  // What the person is typing survives a repaint (a push may land mid-word).
  const drafts = new Map();

  const hers = () => (irasshaiIn(S.sessions) ? IRASSHAI : '');
  const post = (path, json = {}) => request(path, { method: 'POST', json });
  const readRuntime = async () => { const r = await request('/api/setup/runtime', { cache: 'no-store' }); if (r.ok && !disposed) { runtime = r.data; paint(); } };

  const start = async (provider, way) => {
    const to = hers();
    const result = await post(`/api/setup/providers/${encodeURIComponent(provider.id)}/sign-in`, { way, tell: to });
    if (result.ok && to) void sendPress(to, `${provider.label} · ${WAYS[way]()}`);
    if (!result.ok) { signIn.failed[provider.id] = result.message; paint(); }
  };

  /** The window: only what the person must do now, from what the CLI printed. */
  const windowOf = (provider, run) => {
    const box = el('div', 'setup-harness-window');
    const line = run.paste === 'key' ? t('setup_harness.paste_key', 'Paste your API key. It goes straight to {cli}.', { cli: provider.label })
      : run.paste === 'code' ? t('setup_harness.paste_code', 'Open the link, sign in, and paste the code it gives you here.')
        : t('setup_harness.enter_code', 'Open the link, sign in, and enter this code.');
    box.append(el('p', 'setup-harness-line', run.sent ? t('setup_harness.sent', 'Sent. Finishing the sign-in…') : line));
    if (run.link) { const link = el('a', 'setup-harness-link', run.link.replace(/^https:\/\//, '').replace(/[?#].*$/, '')); link.href = run.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.append(link); }
    const row = el('div', 'setup-harness-row');
    if (run.code) {
      row.append(el('span', 'setup-harness-code', run.code));
      const copy = button(t('setup_harness.copy', 'Copy'), false, () => { void navigator.clipboard?.writeText(run.code).catch(() => {}); });
      row.append(copy);
    }
    if (run.paste && !run.sent) {
      const input = el('input', 'setup-harness-input');
      input.type = run.paste === 'key' ? 'password' : 'text';
      input.autocomplete = 'off';
      input.placeholder = run.paste === 'key' ? t('setup_harness.key_hint', 'API key') : t('setup_harness.code_hint', 'Code');
      input.value = drafts.get(provider.id) || '';
      input.addEventListener('input', () => drafts.set(provider.id, input.value));
      const send = button(t('setup_harness.send', 'Send'), true, async () => {
        send.disabled = true;
        const result = await post(`/api/setup/providers/${encodeURIComponent(provider.id)}/sign-in/paste`, { text: input.value });
        if (result.ok) drafts.delete(provider.id); else send.disabled = false;
      });
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') send.click(); });
      row.append(input, send);
    }
    row.append(button(t('setup_harness.cancel', 'Cancel'), false, () => post(`/api/setup/providers/${encodeURIComponent(provider.id)}/sign-in/cancel`)));
    box.append(row);
    return box;
  };

  /** A harness without `login`: its terminal sign-in, in the bar, with Close. */
  const terminalOf = (provider) => {
    const box = el('div', 'setup-harness-window');
    if (!provider.login_open) {
      box.append(el('p', 'setup-harness-line', t('setup_harness.terminal', '{cli} signs in in a terminal.', { cli: provider.label })),
        button(t('setup_harness.open_terminal', 'Open its sign-in'), true, async () => { await post(`/api/setup/providers/${encodeURIComponent(provider.id)}/login`); await readRuntime(); }));
      return box;
    }
    if (provider.sign_in_how) box.append(el('p', 'setup-harness-line', provider.sign_in_how));
    // One host for the open terminal, kept across repaints so the tile is never torn down by one.
    terminalHost ||= el('div', 'setup-harness-terminal');
    box.append(terminalHost, button(t('setup_harness.close', 'Close'), false, async () => { mounted?.destroy?.(); mounted = null; terminalHost = null; await post(`/api/setup/providers/${encodeURIComponent(provider.id)}/close`); await readRuntime(); }));
    if (!mounted) mounted = mountProviderAttachment(context.environment, terminalHost, provider, context.workspace, () => { mounted = null; });
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
    const top = el('div', 'setup-harness-top');
    const name = el('div', 'setup-harness-name');
    name.append(el('b', '', provider.label || provider.id), el('small', '', provider.from || ''));
    top.append(name);
    const state = provider.off ? t('setup_harness.off', 'Off') : signed ? t('setup_harness.signed_in', 'Signed in')
      : run ? t('setup_harness.signing_in', 'Signing in') : hermes ? t('setup_harness.set_up', 'Set up') : t('setup_harness.sign_in', 'Sign in');
    const go = el('button', 'setup-harness-go', state);
    go.type = 'button';
    go.disabled = Boolean(run);
    go.addEventListener('click', () => { open = open === provider.id ? '' : provider.id; paint(); });
    top.append(go);
    bar.append(top);
    if (!selected) return bar;
    if (run) bar.append(windowOf(provider, run));
    else if (hermes) {
      // Mounted once while its bar is open, so a repaint keeps what is being edited there.
      if (!hermesHost) { hermesHost = el('div', 'setup-harness-window'); mountHermesSurface(hermesHost, provider, () => { void readRuntime(); }); }
      bar.append(hermesHost);
    }
    else if (signed || provider.off) {
      bar.append(el('p', 'setup-harness-line', provider.off ? t('setup_harness.off_line', 'Turned off. Your sign-in is kept.') : t('setup_harness.signed_line', 'Signed in on this office.')));
    } else if (own) {
      if (failed) bar.append(el('p', 'setup-harness-line bad', failed));
      const row = el('div', 'setup-harness-row');
      row.append(button(WAYS.subscription(), true, () => start(provider, 'subscription')), button(WAYS.api_key(), false, () => start(provider, 'api_key')));
      bar.append(row);
    } else bar.append(terminalOf(provider));
    return bar;
  };

  const paint = () => {
    if (disposed) return;
    const harnesses = (runtime.providers || []).filter((provider) => provider?.installed);
    if (open !== 'hermes') hermesHost = null;
    if (mounted && !harnesses.some((provider) => provider.login_open && open === provider.id)) { mounted.destroy?.(); mounted = null; terminalHost = null; }
    stack.replaceChildren(...harnesses.map(barOf));
    const signed = harnesses.filter((provider) => provider.activated).length;
    note.textContent = signed === 0 ? t('setup_harness.note_none', 'One harness is enough to start. You sign in with your own subscription or API key.')
      : t('setup_harness.note_some', '{n} of {m} signed in. A second one keeps your Agents working when one hits a limit.', { n: signed, m: harnesses.length });
  };

  const onSignIn = (message) => { signIn = { runs: message.runs || [], failed: message.failed || {} }; paint(); };
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
