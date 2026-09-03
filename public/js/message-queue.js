/* Inbound session messages that have not yet delivered. */
import { t } from './lexicon.js';
import { attention, toast } from './ui.js';

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

/** Watch independently of the queue tab; flash once when each retained problem appears. */
export function watchMessageQueueAttention() {
  const poll = async () => {
    try {
      const response = await fetch('/api/messages');
      const body = await response.json();
      const ids = new Set((Array.isArray(body.messages) ? body.messages : [])
        .filter((message) => message.state === 'stuck' || message.state === 'failed' || message.state === 'target_missing')
        .map((message) => message.id));
      if ([...ids].some((id) => !attentionSeen.has(id))) {
        attention(t('messages.attention', 'Check Team Commons → Agent Message Queue'));
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
  const note = el('p', 'mq-note', t('messages.note', 'Sometimes Agent-to-Agent messages get stuck and need your help. Try Again is gentle; Force gives it one determined shove. 😉'));
  const board = el('div', 'mq-board');
  const empty = el('p', 'mq-empty', t('messages.empty', 'No messages are waiting.'));
  host.append(note, board);

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
    const response = await fetch('/api/messages');
    const body = await response.json();
    board.replaceChildren();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    onCount(messages.length);
    if (!messages.length) { board.append(empty); return; }
    for (const message of messages) {
      const card = el('article', `mq-card mq-${message.state}`);
      const head = el('div', 'mq-head');
      const waiting = message.state === 'stuck' && message.attempts === 0;
      const missing = message.state === 'target_missing';
      const state = missing ? t('messages.target_missing', 'Target missing') : waiting ? t('messages.waiting', 'Waiting') : message.state === 'failed' ? t('messages.failed', 'Failed') : t('messages.pending', 'Pending');
      const since = message.state === 'failed' || missing ? message.updated_at : message.created_at;
      head.append(el('strong', '', typeOf(message.source)), el('span', 'mq-state', t('messages.state_age', '{state} · {age}', { state, age: ageOf(since) })));
      const route = el('dl', 'mq-route');
      route.append(
        el('dt', '', t('messages.from', 'From')), el('dd', '', message.from || typeOf(message.source)),
        el('dt', '', t('messages.to_label', 'To')), el('dd', '', message.target),
        el('dt', '', t('messages.attempts', 'Attempts')), el('dd', '', String(message.attempts)),
      );
      const text = el('pre', 'mq-text', message.text);
      const reason = el('p', 'mq-reason', reasonOf(message.reason));
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
    void render();
    if (!timer) timer = setInterval(() => void render(), 2_000);
  };
  const leave = () => { clearInterval(timer); timer = null; };
  return { enter, leave, destroy: leave };
}
