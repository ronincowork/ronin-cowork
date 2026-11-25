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
// EVERY BUTTON IS AN ERABI STONE (owner, 24 Nov): `ask-opt ask-rect` with its name, in an `ask` row,
// as Setup's zone picks are (setup-zone.js; ask.js).
const button = (label, _primary, onClick) => {
  const out = el('button', 'ask-opt ask-rect');
  out.type = 'button';
  out.append(el('span', 'ask-name', label));
  out.addEventListener('click', () => { if (!out.disabled) onClick(); });
  return out;
};
const stones = () => { const row = el('div', 'ask setup-harness-row'); row.dataset.density = 'tight'; return row; };

const shortName = (provider) => String(provider.label || provider.id).replace(/ CLI$/, '');

const WAYS = Object.freeze({
  subscription: () => t('setup_harness.subscription', 'Subscription'),
  api_key: () => t('setup_harness.api_key', 'API key'),
});
/** EACH HARNESS SHOWS ONLY ITS OWN WAYS (owner, 25 Nov 2026): subscription and API key (its CLI's
 *  sign-in, one at a time); the Ronin gateway only where the office's Ronin API account runs it
 *  (src/accounts.ts: Codex yes, Claude Code never), picked under Model when an Agent starts; OpenRouter
 *  greyed, Coming soon. */
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
  body.append(stack, note);
  out.content.append(body);
  let runtime = recordRuntime();
  let signIn = { runs: [], failed: {}, ways: {} };
  // The office's Ronin API account: which harnesses run on the gateway (always on: every office runs it).
  let gateway = { harnesses: [] };
  let gatewayShown = '';
  // A press on the other way while signed in asks once more: one way at a time (owner, 24 Nov).
  let switching = { provider: '', way: '' };
  let open = '';
  let mounted = null;
  let terminalHost = null;
  let hermesHost = null;
  let disposed = false;
  // What the person is typing survives a repaint (a push may land mid-word).
  const drafts = new Map();

  const hers = () => (irasshaiIn(S.sessions) ? IRASSHAI : '');
  const post = (path, json = {}) => request(path, { method: 'POST', json });
  const readRuntime = async () => {
    const [r, a] = await Promise.all([request('/api/setup/runtime', { cache: 'no-store' }), request('/api/accounts', { cache: 'no-store' })]);
    if (disposed) return;
    const house = a.ok ? (a.data.accounts || []).find((one) => one.kind === 'ronin_api') : null;
    if (house) gateway = { harnesses: house.harnesses || [] };
    if (r.ok) runtime = r.data;
    paint();
  };

  /** A press that changes what an Agent can run on goes to her as the person's [Button] line (SETUP_HARNESS.md §4.1). */
  const pressed = (text) => { const to = hers(); if (to) void sendPress(to, text); };

  const start = async (provider, way) => {
    const to = hers();
    const result = await post(`/api/setup/providers/${encodeURIComponent(provider.id)}/sign-in`, { way, tell: to });
    if (result.ok && to) void sendPress(to, `${shortName(provider)} · Sign in with ${wayWord(way)}`);
    if (!result.ok) { signIn.failed[provider.id] = result.message; paint(); }
  };

  /** The window: only what the person must do now, from what the CLI printed. */
  const windowOf = (provider, run) => {
    const box = el('div', 'setup-harness-window');
    const line = run.paste === 'key' ? t('setup_harness.paste_key', 'Paste your API key. It goes straight to {cli}.', { cli: shortName(provider) })
      : run.paste === 'code' ? t('setup_harness.paste_code', 'Open the link, sign in, and paste the code it gives you here.')
        : t('setup_harness.enter_code', 'Open the link, sign in, and enter this code.');
    box.append(el('p', 'setup-harness-line', run.sent ? t('setup_harness.sent', 'Sent. Finishing the sign-in…') : line));
    if (run.link) { const link = el('a', 'setup-harness-link', run.link.replace(/^https:\/\//, '').replace(/[?#].*$/, '')); link.href = run.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.append(link); }
    // The code on its own line; the stones under it, one size.
    if (run.code) box.append(el('span', 'setup-harness-code', run.code));
    const row = stones();
    if (run.code) row.append(button(t('setup_harness.copy', 'Copy'), false, () => { void navigator.clipboard?.writeText(run.code).catch(() => {}); }));
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
        if (result.ok) { drafts.delete(provider.id); pressed(`${shortName(provider)} · Sent the ${run.paste}`); } else send.disabled = false;
      });
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') send.click(); });
      row.append(input, send);
    }
    row.append(button(t('setup_harness.cancel', 'Cancel'), false, async () => { const r = await post(`/api/setup/providers/${encodeURIComponent(provider.id)}/sign-in/cancel`); if (r.ok) pressed(`${shortName(provider)} · Cancel sign-in`); }));
    box.append(row);
    return box;
  };

  /** A harness without `login`: its terminal sign-in, in the bar, with Close. */
  const terminalOf = (provider) => {
    const box = el('div', 'setup-harness-window');
    if (!provider.login_open) {
      const row = stones();
      row.append(button(t('setup_harness.open_terminal', 'Open its sign-in'), true, async () => { const r = await post(`/api/setup/providers/${encodeURIComponent(provider.id)}/login`); if (r.ok) pressed(`${shortName(provider)} · Open its sign-in`); await readRuntime(); }));
      box.append(el('p', 'setup-harness-line', t('setup_harness.terminal', '{cli} signs in in a terminal.', { cli: shortName(provider) })), row);
      return box;
    }
    if (provider.sign_in_how) box.append(el('p', 'setup-harness-line', provider.sign_in_how));
    // One host for the open terminal, kept across repaints so the tile is never torn down by one.
    terminalHost ||= el('div', 'setup-harness-terminal');
    const row = stones();
    row.append(button(t('setup_harness.close', 'Close'), false, async () => { mounted?.destroy?.(); mounted = null; terminalHost = null; const r = await post(`/api/setup/providers/${encodeURIComponent(provider.id)}/close`); if (r.ok) pressed(`${shortName(provider)} · Close sign-in`); await readRuntime(); }));
    box.append(terminalHost, row);
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
    // The whole row is the press (owner, 24 Nov). The tile says Harness, so names drop " CLI".
    const top = el('button', 'setup-harness-top');
    top.type = 'button';
    const name = el('div', 'setup-harness-name');
    name.append(el('b', '', shortName(provider)), el('small', '', provider.from || ''));
    top.append(name);
    const state = provider.off ? t('setup_harness.off', 'Off') : signed ? t('setup_harness.signed_in', 'Signed in')
      : run ? t('setup_harness.signing_in', 'Signing in') : hermes ? t('setup_harness.set_up', 'Set up') : t('setup_harness.sign_in', 'Sign in');
    top.append(el('span', 'setup-harness-go', state));
    top.disabled = Boolean(run);
    top.addEventListener('click', () => { open = open === provider.id ? '' : provider.id; paint(); });
    bar.append(top);
    if (!selected) return bar;
    if (run) bar.append(windowOf(provider, run));
    else if (hermes) {
      // Mounted once while its bar is open, so a repaint keeps what is being edited there.
      if (!hermesHost) { hermesHost = el('div', 'setup-harness-window'); mountHermesSurface(hermesHost, provider, () => { void readRuntime(); }, (text) => pressed(`Hermes · ${text}`)); }
      bar.append(hermesHost);
    }
    else if (provider.off || (signed && !own)) {
      bar.append(el('p', 'setup-harness-line', provider.off ? t('setup_harness.off_line', 'Turned off. Your sign-in is kept.') : t('setup_harness.signed_line', 'Signed in on this office.')));
    } else if (own) {
      // The way it is on, as its CLI says (src/provider-sign-in.ts readWays); selected when signed in.
      const current = signed ? signIn.ways[provider.id] || '' : '';
      const row = stones();
      row.classList.add('setup-harness-ways');
      for (const way of ['subscription', 'api_key']) {
        const made = button(WAYS[way](), false, () => {
          if (current && current !== way && !(switching.provider === provider.id && switching.way === way)) { switching = { provider: provider.id, way }; gatewayShown = ''; paint(); return; }
          switching = { provider: '', way: '' }; gatewayShown = '';
          void start(provider, way);
        });
        made.setAttribute('aria-selected', String(current === way));
        row.append(made);
      }
      const onGateway = gateway.harnesses.includes(provider.id);
      if (onGateway) {
        const made = button(t('setup_harness.gateway', 'Ronin gateway'), false, () => { switching = { provider: '', way: '' }; gatewayShown = gatewayShown === provider.id ? '' : provider.id; paint(); });
        made.setAttribute('aria-selected', 'false');
        row.append(made);
      }
      const soon = button(t('setup_harness.openrouter', 'OpenRouter'), false, () => {});
      soon.disabled = true;
      soon.setAttribute('aria-disabled', 'true');
      soon.append(el('small', 'ask-word', t('setup_harness.soon', 'Coming soon')));
      row.append(soon);
      bar.append(row);
      const line = onGateway && gatewayShown === provider.id
        ? t('setup_harness.gateway_line', 'No sign-in needed: pick a Ronin model under Model when you start a {cli} Agent. Your {cli} sign-in stays as it is.', { cli: shortName(provider) })
        : switching.provider === provider.id
        ? t('setup_harness.one_at_a_time', 'One at a time: signing in with {next} replaces your {now}. Press it again to switch.', { next: wayWord(switching.way), now: current ? wayWord(current) : 'sign-in' })
        : current ? t('setup_harness.on_way', 'Signed in with your {way}.', { way: wayWord(current) })
          : signed ? t('setup_harness.signed_line', 'Signed in on this office.') : t('setup_harness.pick_way', 'Pick how {cli} signs in. One way at a time.', { cli: shortName(provider) });
      bar.append(el('p', 'setup-harness-line', line));
      if (failed) bar.append(el('p', 'setup-harness-line bad', failed));
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
