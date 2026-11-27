/* part of the ronin-cowork client — see js/README.md */
/**
 * HARNESS SIGN-IN, ONE WAY EVERYWHERE (owner, 27 Nov 2026; KAN-938; docs/architecture/setup-workbench.md
 * "Harnesses"). Every harness signs in by one of two presses, in the same words on Setup's Harness step
 * and on the harness's page in Settings:
 *  - Authenticate with Agent (recommended): the Helpful Assistant is asked for when she is not here, told
 *    what was pressed, and runs the harness's sign-in with the person (her `harness` tool). Setup shows
 *    her in its work surface; Settings in a window on the surface (`createAgentWindow`).
 *  - Terminal: the harness's own sign-in in a terminal tile, then Done.
 * A sign-in she starts on Claude Code or Codex prints a link and a code: `signInWindow` draws what the
 * person must do with it, in both places.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { sendPress } from './press.js';
import { IRASSHAI, IRASSHAI_NAME, askIrasshai, createIrasshaiChat, irasshaiLive } from './setup-irasshai.js';

const el = (tag, cls = '', text = null) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };
// Every button is an erabi stone (ask.js): `ask-opt ask-rect` with its name, in an `ask` row.
export const signInStone = (label, onClick) => {
  const out = el('button', 'ask-opt ask-rect');
  out.type = 'button';
  out.append(el('span', 'ask-name', label));
  out.addEventListener('click', () => { if (!out.disabled) onClick(); });
  return out;
};
export const signInRow = () => { const row = el('div', 'ask setup-harness-row'); row.dataset.density = 'tight'; return row; };
export const shortName = (provider) => String(provider.label || provider.id).replace(/ CLI$/, '');
const post = (path, json = {}) => request(path, { method: 'POST', json });

/** The two presses, one row. `agent` and `terminal` are the caller's. */
export function signInChoices({ agent, terminal }) {
  const row = signInRow();
  row.classList.add('setup-harness-ways');
  row.append(
    signInStone(t('harness_sign_in.agent', 'Authenticate with Agent (recommended)'), agent),
    signInStone(t('harness_sign_in.terminal', 'Terminal'), terminal),
  );
  return row;
}

/** Authenticate with Agent: ask for her when she is not here (unless the caller's `opened` did), then
 *  tell her what was pressed. The press waits in her queue until she reads it. */
export async function authenticateWithAgent(provider, { opened: asked = false } = {}) {
  if (!asked && !irasshaiLive()) {
    const opened = await askIrasshai();
    if (!opened.ok || opened.data?.ok === false) return { ok: false, message: String(opened.message || opened.data?.error || '') };
  }
  return sendPress(IRASSHAI, `${shortName(provider)} · Authenticate with Agent`);
}

/** Terminal: the harness's own sign-in in its terminal tile, opened on the page that asked. */
export const openTerminalSignIn = (provider) => post(`/api/setup/harnesses/${encodeURIComponent(provider.id)}/login`);

/** What the person must do now in a sign-in she started, from what the CLI printed: the link, the code,
 *  the box for the code or key the CLI waits for, and Cancel. `drafts` keeps typing across repaints. */
export function signInWindow(provider, run, drafts, pressed = () => {}) {
  const box = el('div', 'setup-harness-window');
  const line = run.paste === 'key' ? t('setup_harness.paste_key', 'Paste your API key. It goes straight to {cli}.', { cli: shortName(provider) })
    : run.paste === 'code' ? t('setup_harness.paste_code', 'Open the link, sign in, and paste the code it gives you here.')
      : t('setup_harness.enter_code', 'Open the link, sign in, and enter this code.');
  box.append(el('p', 'setup-harness-line', run.sent ? t('setup_harness.sent', 'Sent. Finishing the sign-in…') : line));
  if (run.link) { const link = el('a', 'setup-harness-link', run.link.replace(/^https:\/\//, '').replace(/[?#].*$/, '')); link.href = run.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; box.append(link); }
  if (run.code) box.append(el('span', 'setup-harness-code', run.code));
  const row = signInRow();
  if (run.code) row.append(signInStone(t('setup_harness.copy', 'Copy'), () => { void navigator.clipboard?.writeText(run.code).catch(() => {}); }));
  if (run.paste && !run.sent) {
    const input = el('input', 'setup-harness-input');
    input.type = run.paste === 'key' ? 'password' : 'text';
    input.autocomplete = 'off';
    input.placeholder = run.paste === 'key' ? t('setup_harness.key_hint', 'API key') : t('setup_harness.code_hint', 'Code');
    input.value = drafts.get(provider.id) || '';
    input.addEventListener('input', () => drafts.set(provider.id, input.value));
    const send = signInStone(t('setup_harness.send', 'Send'), async () => {
      send.disabled = true;
      const result = await post(`/api/setup/harnesses/${encodeURIComponent(provider.id)}/sign-in/paste`, { text: input.value });
      if (result.ok) { drafts.delete(provider.id); pressed(`${shortName(provider)} · Sent the ${run.paste}`); } else send.disabled = false;
    });
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') send.click(); });
    row.append(input, send);
  }
  row.append(signInStone(t('setup_harness.cancel', 'Cancel'), async () => { const r = await post(`/api/setup/harnesses/${encodeURIComponent(provider.id)}/sign-in/cancel`); if (r.ok) pressed(`${shortName(provider)} · Cancel sign-in`); }));
  box.append(row);
  return box;
}

/** Settings' window on the surface: her chat over the page, with − to put it away. One per page. */
export function createAgentWindow() {
  const out = el('section', 'harness-agent-window');
  const head = el('header', 'harness-agent-window-head');
  const close = el('button', 'harness-agent-window-close', '−');
  close.type = 'button';
  close.setAttribute('aria-label', t('harness_sign_in.put_away', 'Put away'));
  head.append(el('b', '', IRASSHAI_NAME), close);
  const chat = createIrasshaiChat();
  head.insertBefore(chat.toggle, close);
  out.append(head, chat.el);
  const hide = () => { chat.hide(); out.remove(); };
  close.addEventListener('click', hide);
  return {
    /** Open it on `surface` (the page's own surface element). */
    show: (surface) => { if (!out.isConnected) surface.append(out); chat.show(); },
    hide,
    destroy: () => { out.remove(); chat.dispose(); },
  };
}
