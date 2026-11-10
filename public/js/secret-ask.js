/* part of the ronin-cowork client — see js/README.md */
/**
 * THE SECRET ASK — an Agent's `secret ask <name>` as a paste field over its tile (w385). The
 * ask rides the Agent's home row (`secret_ask`); the field opens while it is there and closes
 * when it goes. The value goes from this field to the server and to its file, and nothing
 * sends it back: the field is cleared the moment it is sent.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { WorkspacePrimitives } from './workspace-primitives.js';

const { createAction, createActionBar } = WorkspacePrimitives;

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = String(text);
  return node;
};

export function buildSecretAsk(tile) {
  const root = el('form', 'tile-secret-ask');
  root.hidden = true;
  root.autocomplete = 'off';
  const card = el('div', 'tile-secret-card');
  const title = el('p', 'tile-secret-title');
  const what = el('p', 'tile-secret-for');
  const input = Object.assign(el('input', 'tile-secret-value'), {
    type: 'password', autocomplete: 'off', spellcheck: false,
    placeholder: t('secret.paste', 'Paste it here'),
  });
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('aria-label', t('secret.value', 'Secret'));
  const notice = el('p', 'tile-secret-notice');
  const save = createAction({ label: t('secret.save', 'Save'), kind: 'primary', size: 'compact', action: () => root.requestSubmit() });
  const cancel = createAction({ label: t('secret.cancel', 'Cancel'), size: 'compact', action: () => void send(null) });
  card.append(title, what, input, notice, createActionBar({ actions: [save, cancel] }).el);
  root.append(card);

  let open = null; // the ask on screen: { name, for }
  let busy = false;

  async function send(value) {
    if (!open || busy) return;
    busy = true;
    notice.textContent = '';
    const json = value == null ? { session: tile.session, cancel: true } : { session: tile.session, value };
    input.value = '';
    const result = await request(`/api/secrets/${encodeURIComponent(open.name)}`, { method: 'POST', json });
    busy = false;
    // A good answer closes the field through the row; a refusal stays and says why.
    if (!result.ok) notice.textContent = result.message;
  }

  root.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value) { notice.textContent = t('secret.empty', 'Paste the secret first, or Cancel.'); input.focus(); return; }
    void send(input.value);
  });
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); void send(null); } });

  return {
    el: root,
    /** Follow the row: open on a new ask, close when it is answered. */
    sync(row) {
      const ask = row?.secret_ask || null;
      if (open && ask && open.name === ask.name) return;
      open = ask;
      input.value = '';
      notice.textContent = '';
      root.hidden = !ask;
      if (!ask) return;
      title.textContent = t('secret.title', '{agent} asks for {name}', { agent: tile.sessionName?.textContent || tile.session, name: ask.name });
      what.textContent = ask.for || t('secret.for_none', 'Saved as a file for this Agent to use. It never appears in chat.');
      input.focus();
    },
  };
}
