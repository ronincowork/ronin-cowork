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
 * owner clicks into the field, and only there does Escape cancel. Beside the value sits the
 * expiry (KAN-417, w478): one ERABI question of four answers — Nothing (the default, and the way
 * back from any other), a date (its picker), Never, or N days from today (a number, with 30/90/180
 * quick picks) — sent with the value as a YYYY-MM-DD, "never", or nothing.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { ask } from './ask.js';
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
  const entry = el('div', 'tile-secret-entry');
  // The expiry: what was typed for a date or a number of days stays here while the tray closes.
  const draft = { date: '', days: '' };
  const day = (at) => [at.getFullYear(), at.getMonth() + 1, at.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('-');
  const inDays = () => {
    if (!/^\d{1,5}$/.test(draft.days) || !Number(draft.days)) return '';
    const at = new Date();
    at.setDate(at.getDate() + Number(draft.days));
    return day(at);
  };
  const dateLine = () => {
    const picker = Object.assign(el('input', 'tile-secret-date'), { type: 'date', value: draft.date });
    picker.setAttribute('aria-label', t('secret.expiry_date', 'Expiry date'));
    picker.addEventListener('input', () => { draft.date = picker.value; });
    return picker;
  };
  const daysLine = () => {
    const line = el('div', 'tile-secret-days');
    const count = Object.assign(el('input', 'tile-secret-count'), { type: 'number', min: '1', step: '1', inputMode: 'numeric', value: draft.days });
    count.setAttribute('aria-label', t('secret.expiry_days', 'Days from today'));
    const lands = el('span', 'tile-secret-lands');
    const paint = () => { lands.textContent = inDays() ? t('secret.expiry_lands', 'expires {date}', { date: inDays() }) : ''; };
    count.addEventListener('input', () => { draft.days = count.value.trim(); paint(); });
    const picks = [30, 90, 180].map((n) => createAction({
      label: String(n), size: 'compact',
      action: () => { count.value = draft.days = String(n); paint(); count.focus(); },
    }));
    line.append(count, el('span', 'tile-secret-unit', t('secret.expiry_days_unit', 'days')), createActionBar({ actions: picks }).el, lands);
    paint();
    return line;
  };
  const NOTHING = t('secret.expiry_nothing', 'Nothing');
  const expiry = ask([{ fields: [{
    key: 'expiry', label: t('secret.expires', 'Expires'), blank: NOTHING,
    options: () => [
      { v: 'date', l: draft.date || t('secret.expiry_on', 'A date'), row: dateLine, required: true },
      { v: 'never', l: t('secret.expiry_never', 'Never'), sub: t('secret.expiry_never_sub', 'It does not expire.') },
      { v: 'days', l: inDays() || t('secret.expiry_in', 'In N days'), row: daysLine, required: true,
        invalid: () => (inDays() ? '' : t('secret.expiry_days_bad', 'A whole number of days, 1 or more.')) },
    ],
  }] }], {
    density: 'tight', className: 'tile-secret-expiry', trayHost: entry, // the tray opens across the field, under it
    // Nothing clears whatever was picked; another answer drops the one it replaced.
    onChange: ({ expiry: choice }) => { if (choice !== 'date') draft.date = ''; if (choice !== 'days') draft.days = ''; },
  });
  /** The expiry to send: a date, "never", or '' for nothing; null when a chosen answer is unfinished. */
  const chosenExpiry = () => {
    const choice = expiry.value().expiry;
    if (choice === 'never') return 'never';
    if (choice === 'date') return draft.date || null;
    if (choice === 'days') return inDays() || null;
    return '';
  };
  const resetExpiry = () => { draft.date = draft.days = ''; expiry.set('expiry', ''); expiry.close(); };
  const notice = el('p', 'tile-secret-notice');
  const SAVE = t('secret.save', 'Save');
  const CANCEL = t('secret.cancel', 'Cancel');
  const save = createAction({ label: SAVE, kind: 'primary', size: 'compact', action: () => root.requestSubmit() });
  const cancel = createAction({ label: CANCEL, size: 'compact', action: () => void send(null) });
  entry.append(input, expiry.el, createActionBar({ actions: [save, cancel] }).el);
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
    input.hidden = expiry.el.hidden = !!state;
    input.disabled = save.el.disabled = cancel.el.disabled = state === 'saving';
    if (state !== 'saving') { save.el.textContent = SAVE; cancel.el.textContent = CANCEL; }
    notice.textContent = text || '';
  };

  async function send(value, until = '') {
    if (!open || busy || shown) return;
    busy = true;
    next = undefined;
    const { name } = open;
    const json = value == null ? { session: tile.session, cancel: true } : { session: tile.session, value, expires: until };
    input.value = '';
    resetExpiry();
    settle('saving');
    if (value == null) cancel.el.textContent = t('secret.cancelling', 'Cancelling…');
    else save.el.textContent = t('secret.saving', 'Saving…');
    const result = await request(`/api/secrets/${encodeURIComponent(name)}`, { method: 'POST', json });
    busy = false;
    if (!result.ok) { settle('', result.message); if (next !== undefined) view.sync(next); input.focus(); return; }
    answered = name;
    if (value == null) settle('cancelled', t('secret.cancelled', 'Cancelled'));
    else if (until === 'never') settle('saved', t('secret.saved_never', 'Saved: {name}, never expires', { name }));
    else if (until) settle('saved', t('secret.saved_expires', 'Saved: {name}, expires {date}', { name, date: until }));
    else settle('saved', t('secret.saved', 'Saved: {name}', { name }));
    shown = setTimeout(() => { shown = null; open = null; view.sync(next ?? null); }, value == null ? 1000 : 2000);
  }

  root.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value) { notice.textContent = t('secret.empty', 'Paste the secret first, or Cancel.'); input.focus(); return; }
    const until = chosenExpiry();
    if (until == null) { notice.textContent = t('secret.expiry_unfinished', 'Finish the expiry, or choose Nothing.'); expiry.open('expiry'); return; }
    void send(input.value, until);
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
      resetExpiry();
      settle('');
      show(!!ask);
      if (!ask) return;
      title.textContent = t('secret.title', '{agent} asks for {name}', { agent: tile.sessionName?.textContent || tile.session, name: ask.name });
      what.textContent = ask.for || t('secret.for_none', 'Saved as a file for this Agent to use. It never appears in chat.');
    },
  };
  return view;
}
