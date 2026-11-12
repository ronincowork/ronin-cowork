/* part of the ronin-cowork client — see js/README.md */
/**
 * THE SECRET ASK — an Agent's `secret ask <name>` as a paste field docked at its tile's foot
 * (w385), where the composer sits (KAN-416, owner 2026-11-12: the field over the whole tile hid
 * the Agent's instructions). The conversation or terminal above stays readable: Chat keeps it in
 * its column under the log, and Terminal fits its rows above the field's measured height. The
 * ask rides the Agent's home row (`secret_ask`); the field opens while it is there and closes
 * when it goes. The value goes from this field to the server and to its file, and nothing
 * sends it back: the field is cleared the moment it is sent. The pressed button says "Saving…" at
 * once, then "Saved" (or "Cancelled") shows a moment before the field closes; a refusal stays
 * open and says why. An answered ask never reopens from a row that still carries it; a row
 * without it clears that, so a later ask of the same name opens. Nothing takes the focus: the
 * owner clicks into the field, and only there does Escape cancel. Beside the value sits an
 * optional expiry date (KAN-417): Save sends both, and an empty date means no expiry.
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
  const expires = Object.assign(el('input', 'tile-secret-expires'), { type: 'date' });
  expires.setAttribute('aria-label', t('secret.expires', 'Expires (optional)'));
  expires.title = t('secret.expires', 'Expires (optional)');
  const notice = el('p', 'tile-secret-notice');
  const SAVE = t('secret.save', 'Save');
  const CANCEL = t('secret.cancel', 'Cancel');
  const save = createAction({ label: SAVE, kind: 'primary', size: 'compact', action: () => root.requestSubmit() });
  const cancel = createAction({ label: CANCEL, size: 'compact', action: () => void send(null) });
  const entry = el('div', 'tile-secret-entry');
  entry.append(input, expires, createActionBar({ actions: [save, cancel] }).el);
  card.append(title, what, entry, notice);
  root.append(card);

  // The view above ends where the field begins. The reserve only grows while one ask is open, so
  // the shorter Saved moment does not refit the terminal twice.
  let reserved = 0;
  const reserve = () => {
    const height = root.hidden ? 0 : Math.ceil(root.getBoundingClientRect().height);
    reserved = root.hidden ? 0 : Math.max(reserved, height);
    tile.body.style.setProperty('--secret-clearance', `${reserved}px`);
  };
  new ResizeObserver(reserve).observe(root);
  const show = (on) => {
    root.hidden = !on;
    if (on) tile.body.dataset.secretAsk = 'open';
    else delete tile.body.dataset.secretAsk;
    reserved = 0;
    reserve();
  };

  let open = null; // the ask on screen: { name, for }
  let busy = false;
  let shown = null; // the confirmation's timer: the field stays until it is up
  let next; // the row that came while saving or confirming: the server drops the ask before it answers
  let answered = null; // the name just answered: a row still carrying it is older than the answer

  const settle = (state, text) => {
    card.dataset.state = state || '';
    input.hidden = expires.hidden = !!state;
    input.disabled = expires.disabled = save.el.disabled = cancel.el.disabled = state === 'saving';
    if (state !== 'saving') { save.el.textContent = SAVE; cancel.el.textContent = CANCEL; }
    notice.textContent = text || '';
  };

  async function send(value, day = '') {
    if (!open || busy || shown) return;
    busy = true;
    next = undefined;
    const { name } = open;
    const json = value == null ? { session: tile.session, cancel: true } : { session: tile.session, value, expires: day };
    input.value = '';
    expires.value = '';
    settle('saving');
    if (value == null) cancel.el.textContent = t('secret.cancelling', 'Cancelling…');
    else save.el.textContent = t('secret.saving', 'Saving…');
    const result = await request(`/api/secrets/${encodeURIComponent(name)}`, { method: 'POST', json });
    busy = false;
    if (!result.ok) { settle('', result.message); if (next !== undefined) view.sync(next); input.focus(); return; }
    answered = name;
    if (value == null) settle('cancelled', t('secret.cancelled', 'Cancelled'));
    else if (day) settle('saved', t('secret.saved_expires', 'Saved: {name}, expires {date}', { name, date: day }));
    else settle('saved', t('secret.saved', 'Saved: {name}', { name }));
    shown = setTimeout(() => { shown = null; open = null; view.sync(next ?? null); }, value == null ? 1000 : 2000);
  }

  root.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value) { notice.textContent = t('secret.empty', 'Paste the secret first, or Cancel.'); input.focus(); return; }
    void send(input.value, expires.value);
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
      expires.value = '';
      settle('');
      show(!!ask);
      if (!ask) return;
      title.textContent = t('secret.title', '{agent} asks for {name}', { agent: tile.sessionName?.textContent || tile.session, name: ask.name });
      what.textContent = ask.for || t('secret.for_none', 'Saved as a file for this Agent to use. It never appears in chat.');
    },
  };
  return view;
}
