/* part of the ronin-cowork client — see js/README.md */
/**
 * THE SECRET ASK — an Agent's `secret ask <name>` as a paste field over its tile (w385). The
 * ask rides the Agent's home row (`secret_ask`); the field opens while it is there and closes
 * when it goes. The value goes from this field to the server and to its file, and nothing
 * sends it back: the field is cleared the moment it is sent. The pressed button says "Saving…" at
 * once, then "Saved" (or "Cancelled") shows a moment before the field closes; a refusal stays
 * open and says why. An answered ask never reopens from a row that still carries it; a row
 * without it clears that, so a later ask of the same name opens. Nothing takes the focus: the
 * owner clicks into the field, and only there does Escape cancel.
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
  const SAVE = t('secret.save', 'Save');
  const CANCEL = t('secret.cancel', 'Cancel');
  const save = createAction({ label: SAVE, kind: 'primary', size: 'compact', action: () => root.requestSubmit() });
  const cancel = createAction({ label: CANCEL, size: 'compact', action: () => void send(null) });
  card.append(title, what, input, notice, createActionBar({ actions: [save, cancel] }).el);
  root.append(card);

  let open = null; // the ask on screen: { name, for }
  let busy = false;
  let shown = null; // the confirmation's timer: the field stays until it is up
  let next; // the row that came while saving or confirming: the server drops the ask before it answers
  let answered = null; // the name just answered: a row still carrying it is older than the answer

  const settle = (state, text) => {
    card.dataset.state = state || '';
    input.hidden = !!state;
    input.disabled = save.el.disabled = cancel.el.disabled = state === 'saving';
    if (state !== 'saving') { save.el.textContent = SAVE; cancel.el.textContent = CANCEL; }
    notice.textContent = text || '';
  };

  async function send(value) {
    if (!open || busy || shown) return;
    busy = true;
    next = undefined;
    const { name } = open;
    const json = value == null ? { session: tile.session, cancel: true } : { session: tile.session, value };
    input.value = '';
    settle('saving');
    if (value == null) cancel.el.textContent = t('secret.cancelling', 'Cancelling…');
    else save.el.textContent = t('secret.saving', 'Saving…');
    const result = await request(`/api/secrets/${encodeURIComponent(name)}`, { method: 'POST', json });
    busy = false;
    if (!result.ok) { settle('', result.message); if (next !== undefined) view.sync(next); input.focus(); return; }
    answered = name;
    if (value == null) settle('cancelled', t('secret.cancelled', 'Cancelled'));
    else settle('saved', t('secret.saved', 'Saved: {name}', { name }));
    shown = setTimeout(() => { shown = null; open = null; view.sync(next ?? null); }, value == null ? 1000 : 2000);
  }

  root.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value) { notice.textContent = t('secret.empty', 'Paste the secret first, or Cancel.'); input.focus(); return; }
    void send(input.value);
  });
  input.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); void send(null); } });

  const view = {
    el: root,
    /** Follow the row: open on a new ask, close when it is answered. */
    sync(row) {
      if (busy) { next = row; return; }
      if (shown) {
        // The answer shows its moment, unless a new ask comes: that one shows at once.
        const asked = row?.secret_ask;
        if (!asked || asked.name === answered) { next = row; return; }
        clearTimeout(shown);
        shown = null;
        open = null;
      }
      let ask = row?.secret_ask || null;
      if (!ask) answered = null;
      else if (ask.name === answered) ask = null;
      if (open && ask && open.name === ask.name) return;
      open = ask;
      input.value = '';
      settle('');
      root.hidden = !ask;
      if (!ask) return;
      title.textContent = t('secret.title', '{agent} asks for {name}', { agent: tile.sessionName?.textContent || tile.session, name: ask.name });
      what.textContent = ask.for || t('secret.for_none', 'Saved as a file for this Agent to use. It never appears in chat.');
    },
  };
  return view;
}
