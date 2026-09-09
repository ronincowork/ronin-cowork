/* Inbound session messages that have not yet delivered. */
import { t } from './lexicon.js';
import { attention, status, toast } from './ui.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const ageOf = (at) => {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 1_000));
  if (!Number.isFinite(seconds) || seconds < 5) return t('messages.age_now', 'just now');
  if (seconds < 60) return t('messages.age_short_seconds', '{seconds}s', { seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('messages.age_short_minutes', '{minutes}m {seconds}s', { minutes, seconds: seconds % 60 });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('messages.age_short_hours', '{hours}h {minutes}m', { hours, minutes: minutes % 60 });
  return t('messages.age_short_days', '{days}d {hours}h', { days: Math.floor(hours / 24), hours: hours % 24 });
};

function typeOf(source) {
  return ({
    tell: t('messages.type_tell', 'Agent tell'),
    wipeboard_notice: t('messages.type_wipeboard', 'Wipeboard notification'),
    owner: t('messages.type_owner', 'Owner message'),
    house: t('messages.type_house', 'House message'),
    jikan: t('messages.type_jikan', 'Cron job'),
  })[source] || source;
}

function reasonOf(reason) {
  return reason === 'prompt contents changed while submitting'
    ? t('messages.reason_prompt_changed', 'The prompt changed before delivery could be confirmed. Automatic retries stopped to avoid sending a duplicate.')
    : reason;
}

const attentionSeen = new Set();

/** The only thing worth a flash: a message whose two-minute auto-force has FINISHED and did
 *  not land, so there is a card to see. A force still in flight, a new arrival, a Waiting
 *  card, a missing target — none of these interrupt the owner. */
export const attentionIds = (messages) => messages
  .filter((message) => message.auto_force_failed_at)
  .map((message) => message.id);

export const reconcileMessageSelection = (selected, messages) => new Set(
  messages.map((message) => message.id).filter((id) => selected.has(id)),
);

export const dismissalIds = (messages, selected, scope) => scope === 'all'
  ? messages.map((message) => message.id)
  : messages.map((message) => message.id).filter((id) => selected.has(id));

/** The selected cards Force can act on: everything but a missing target, which cannot be forced. */
export const forceableIds = (messages, selected) => messages
  .filter((message) => selected.has(message.id) && message.state !== 'target_missing')
  .map((message) => message.id);

export const AUTO_FORCE_SECONDS = 120;

/** Watch independently of the queue tab; flash once when each retained problem appears. */
export function watchMessageQueueAttention() {
  const poll = async () => {
    try {
      const response = await fetch('/api/messages');
      const body = await response.json();
      const ids = new Set(attentionIds(Array.isArray(body.messages) ? body.messages : []));
      if ([...ids].some((id) => !attentionSeen.has(id))) {
        attention(t('messages.attention', 'A message was forced after 2 min and still did not land — Team Commons → Messages'));
      }
      for (const id of [...attentionSeen]) if (!ids.has(id)) attentionSeen.delete(id);
      for (const id of ids) attentionSeen.add(id);
    } catch { /* the queue card itself will show a reachable API failure when opened */ }
  };
  void poll();
  const timer = setInterval(() => void poll(), 2_000);
  return () => clearInterval(timer);
}

export function buildMessageQueue(host, onCount = () => {}) {
  const note = el('p', 'mq-note', t('messages.note', 'This is every retained message on this Ronin machine. Try Again is gentle; Force gives it one determined shove. 😉'));
  // Two groups. Left: choose and force. Right: dismiss. Nothing in between.
  const tools = el('div', 'mq-tools');
  const left = el('div', 'mq-tools-group');
  const right = el('div', 'mq-tools-group mq-tools-right');
  const selectAll = el('button', 'cc-btn', t('messages.select_all', 'Select All'));
  const forceSelected = el('button', 'cc-btn mq-force', t('messages.force_selected', 'Force Selected'));
  const autoForce = el('button', 'cc-btn mq-autoforce', t('messages.auto_force_off', 'Auto-force after 2 min: off'));
  const dismissSelected = el('button', 'cc-btn', t('messages.dismiss_selected', 'Dismiss Selected'));
  const dismissAll = el('button', 'cc-btn mq-dismiss-all', t('messages.dismiss_all', 'Dismiss All'));
  selectAll.type = forceSelected.type = autoForce.type = dismissSelected.type = dismissAll.type = 'button';
  autoForce.setAttribute('aria-pressed', 'false');
  left.append(selectAll, forceSelected, autoForce);
  right.append(dismissSelected, dismissAll);
  tools.append(left, right);
  let autoForceSeconds = AUTO_FORCE_SECONDS;
  const paintAutoForce = () => {
    const on = autoForceSeconds > 0;
    autoForce.textContent = on
      ? t('messages.auto_force_on', 'Auto-force after {minutes} min: on', { minutes: Math.max(1, Math.round(autoForceSeconds / 60)) })
      : t('messages.auto_force_off', 'Auto-force after 2 min: off');
    autoForce.setAttribute('aria-pressed', String(on));
    autoForce.setAttribute('data-on', String(on));
  };
  const loadAutoForce = async () => {
    try {
      const response = await fetch('/api/machine-settings');
      const body = await response.json();
      autoForceSeconds = Number(body?.set?.messages?.auto_force_after_s ?? AUTO_FORCE_SECONDS) || 0;
    } catch { autoForceSeconds = AUTO_FORCE_SECONDS; }
    paintAutoForce();
  };
  autoForce.addEventListener('click', async () => {
    const next = autoForceSeconds > 0 ? 0 : AUTO_FORCE_SECONDS;
    autoForce.disabled = true;
    try {
      const response = await fetch('/api/machine-settings', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ family: 'messages', value: { auto_force_after_s: next } }),
      });
      const body = await response.json();
      if (!response.ok || body.ok === false) throw new Error(body.error || response.statusText);
      autoForceSeconds = Number(body.auto_force_after_s ?? next) || 0;
      paintAutoForce();
      toast(autoForceSeconds > 0
        ? t('messages.auto_force_set', 'Stuck messages are forced after {minutes} minutes.', { minutes: Math.round(autoForceSeconds / 60) })
        : t('messages.auto_force_cleared', 'Stuck messages wait for you.'));
    } catch (e) {
      toast(t('messages.action_failed', 'Message action failed — {reason}', { reason: e.message }), false);
    } finally { autoForce.disabled = false; }
  });
  const board = el('div', 'mq-board');
  const empty = el('p', 'mq-empty', t('messages.empty', 'No messages are waiting.'));
  const reconnecting = status('mq-reconnecting');
  host.append(note, tools, reconnecting.el, board);
  let messages = [];
  let selected = new Set();

  const bulkDismiss = async (scope, pressed) => {
    const ids = dismissalIds(messages, selected, scope);
    if (!ids.length) return;
    const label = pressed.textContent;
    pressed.disabled = true;
    pressed.textContent = t('messages.dismissing', 'Dismissing…');
    try {
      const response = await fetch('/api/messages', {
        method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }),
      });
      const body = await response.json();
      if (!response.ok || body.ok === false) throw new Error(body.error || response.statusText);
      for (const id of ids) selected.delete(id);
      toast(t('messages.dismissed_count', '{count} message(s) dismissed.', { count: body.dismissed?.length ?? ids.length }));
      await render();
    } catch (e) {
      toast(t('messages.action_failed', 'Message action failed — {reason}', { reason: e.message }), false);
    } finally {
      pressed.disabled = false;
      pressed.textContent = label;
    }
  };

  const bulkForce = async (pressed) => {
    const ids = forceableIds(messages, selected);
    if (!ids.length) return;
    const label = pressed.textContent;
    pressed.disabled = true;
    pressed.textContent = t('messages.forcing', 'Forcing…');
    try {
      const response = await fetch('/api/messages/force', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }),
      });
      const body = await response.json();
      if (!response.ok || body.ok === false) throw new Error(body.error || response.statusText);
      const outcomes = Array.isArray(body.outcomes) ? body.outcomes : [];
      const delivered = outcomes.filter((o) => o.delivered).length;
      const retained = outcomes.length - delivered;
      for (const o of outcomes) if (o.delivered) selected.delete(o.id);
      toast(t('messages.forced_count', '{delivered} delivered · {retained} still retained.', { delivered, retained }), retained === 0);
      await render();
    } catch (e) {
      toast(t('messages.action_failed', 'Message action failed — {reason}', { reason: e.message }), false);
    } finally {
      pressed.disabled = false;
      pressed.textContent = label;
    }
  };

  // Select All is a toggle: once every displayed card is chosen it reads Clear Selection.
  selectAll.addEventListener('click', () => {
    const all = messages.length > 0 && messages.every((message) => selected.has(message.id));
    selected = all ? new Set() : new Set(messages.map((message) => message.id));
    void render();
  });
  forceSelected.addEventListener('click', () => void bulkForce(forceSelected));
  dismissSelected.addEventListener('click', () => void bulkDismiss('selected', dismissSelected));
  dismissAll.addEventListener('click', () => void bulkDismiss('all', dismissAll));

  const act = async (message, action, pressed, pending, method = 'POST') => {
    const card = pressed.closest('.mq-card');
    const buttons = [...card.querySelectorAll('button')];
    const label = pressed.textContent;
    for (const button of buttons) button.disabled = true;
    pressed.textContent = pending;
    pressed.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(message.id)}${action}`, { method });
      const body = await response.json();
      if (!response.ok || body.ok === false) throw new Error(body.error || response.statusText);
      if (method === 'DELETE') toast(t('messages.dismissed', 'Message dismissed.'));
      else if (body.delivered) toast(t('messages.delivered', 'Delivered and cleared.'));
      else toast(t('messages.retained', 'Still waiting — {reason}', { reason: body.message?.reason || message.reason }), false);
      await render();
    } catch (e) {
      toast(t('messages.action_failed', 'Message action failed — {reason}', { reason: e.message }), false);
      for (const button of buttons) button.disabled = false;
      pressed.textContent = label;
      pressed.removeAttribute('aria-busy');
    }
  };

  const render = async () => {
    let body;
    try {
      const response = await fetch('/api/messages');
      if (!response.ok) throw new Error(response.statusText);
      body = await response.json();
    } catch {
      reconnecting.say(t('messages.reconnecting', 'Reconnecting…'), 'busy');
      return;
    }
    reconnecting.say('');
    board.replaceChildren();
    messages = Array.isArray(body.messages) ? body.messages : [];
    selected = reconcileMessageSelection(selected, messages);
    tools.hidden = !messages.length;
    const paintCounts = () => {
      const all = messages.length > 0 && messages.every((message) => selected.has(message.id));
      selectAll.textContent = all
        ? t('messages.clear_selection', 'Clear Selection ({count})', { count: messages.length })
        : t('messages.select_all_count', 'Select All ({count})', { count: messages.length });
      const forceable = forceableIds(messages, selected).length;
      forceSelected.textContent = t('messages.force_selected_count', 'Force Selected ({count})', { count: forceable });
      forceSelected.disabled = forceable === 0;
      dismissSelected.textContent = t('messages.dismiss_selected_count', 'Dismiss Selected ({count})', { count: selected.size });
      dismissSelected.disabled = selected.size === 0;
      dismissAll.textContent = t('messages.dismiss_all_count', 'Dismiss All ({count})', { count: messages.length });
      for (const card of board.querySelectorAll('.mq-card')) card.classList.toggle('mq-selected', selected.has(card.dataset.id));
    };
    paintCounts();
    onCount(messages.length);
    if (!messages.length) { board.append(empty); return; }
    for (const message of messages) {
      const card = el('article', `mq-card mq-${message.state}${selected.has(message.id) ? ' mq-selected' : ''}`);
      card.dataset.id = message.id;
      const head = el('div', 'mq-head');
      const choice = el('label', 'mq-choice');
      const checkbox = el('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selected.has(message.id);
      checkbox.setAttribute('aria-label', t('messages.select_message', 'Select message to {target}', { target: message.target }));
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(message.id); else selected.delete(message.id);
        paintCounts();
      });
      choice.append(checkbox);
      const waiting = message.state === 'stuck' && message.attempts === 0;
      const missing = message.state === 'target_missing';
      const state = missing ? t('messages.target_missing', 'Target missing') : waiting ? t('messages.waiting', 'Waiting') : message.state === 'failed' ? t('messages.failed', 'Failed') : t('messages.pending', 'Pending');
      const since = message.state === 'failed' || missing ? message.updated_at : message.created_at;
      head.append(choice, el('strong', '', typeOf(message.source)), el('span', 'mq-state', t('messages.state_age', '{state} · {age}', { state, age: ageOf(since) })));
      const route = el('dl', 'mq-route');
      route.append(
        el('dt', '', t('messages.from', 'From')), el('dd', '', message.from || typeOf(message.source)),
        el('dt', '', t('messages.to_label', 'To')), el('dd', '', message.target),
        el('dt', '', t('messages.attempts', 'Attempts')), el('dd', '', String(message.attempts)),
      );
      const text = el('pre', 'mq-text', message.text);
      const reason = el('p', 'mq-reason', message.auto_forced_at
        ? t('messages.auto_forced_reason', 'Auto-forced {age} ago — {reason}', { age: ageOf(message.auto_forced_at), reason: reasonOf(message.reason) })
        : reasonOf(message.reason));
      const actions = el('div', 'mq-actions');
      const retry = el('button', 'cc-btn', t('messages.retry', 'Try Again'));
      const force = el('button', 'cc-btn mq-force', t('messages.force', 'Force'));
      const dismiss = el('button', 'cc-btn', t('messages.dismiss', 'Dismiss'));
      retry.type = force.type = dismiss.type = 'button';
      retry.addEventListener('click', () => void act(message, '/retry', retry, t('messages.trying', 'Trying…')));
      force.addEventListener('click', () => void act(message, '/force', force, t('messages.forcing', 'Forcing…')));
      dismiss.addEventListener('click', () => void act(message, '', dismiss, t('messages.dismissing', 'Dismissing…'), 'DELETE'));
      if (missing) actions.append(dismiss);
      else actions.append(retry, force, dismiss);
      card.append(head, route, text, reason, actions);
      board.append(card);
    }
  };
  let timer = null;
  const enter = () => {
    void loadAutoForce();
    void render();
    if (!timer) timer = setInterval(() => void render(), 2_000);
  };
  const leave = () => { clearInterval(timer); timer = null; };
  return { enter, leave, destroy: leave };
}
