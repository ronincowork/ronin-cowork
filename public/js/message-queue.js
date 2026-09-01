/* Inbound session messages that have not yet delivered. */
import { t } from './lexicon.js';
import { toast } from './ui.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const ageOf = (createdAt) => {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 1_000));
  if (!Number.isFinite(seconds) || seconds < 5) return t('messages.age_now', 'just now');
  if (seconds < 60) return t('messages.age_seconds', '{count} seconds', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return t('messages.age_minute', '1 minute');
  if (minutes < 60) return t('messages.age_minutes', '{count} minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return t('messages.age_hour', '1 hour');
  if (hours < 48) return t('messages.age_hours', '{count} hours', { count: hours });
  return t('messages.age_days', '{count} days', { count: Math.floor(hours / 24) });
};

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
      const state = message.state === 'stuck' && message.attempts === 0 ? t('messages.waiting', 'waiting') : message.state;
      head.append(el('strong', '', t('messages.to', 'To {target}', { target: message.target })), el('span', 'mq-state', state));
      const meta = el('div', 'mq-meta', t('messages.meta', '{source} · {attempts} attempts · waiting {age}', { source: message.source, attempts: message.attempts, age: ageOf(message.created_at) }));
      const text = el('pre', 'mq-text', message.text);
      const reason = el('p', 'mq-reason', message.reason);
      const actions = el('div', 'mq-actions');
      const retry = el('button', 'cc-btn', t('messages.retry', 'Try Again'));
      const force = el('button', 'cc-btn mq-force', t('messages.force', 'Force'));
      const dismiss = el('button', 'cc-btn', t('messages.dismiss', 'Dismiss'));
      retry.type = force.type = dismiss.type = 'button';
      retry.addEventListener('click', () => void act(message, '/retry', retry, t('messages.trying', 'Trying…')));
      force.addEventListener('click', () => void act(message, '/force', force, t('messages.forcing', 'Forcing…')));
      dismiss.addEventListener('click', () => void act(message, '', dismiss, t('messages.dismissing', 'Dismissing…'), 'DELETE'));
      actions.append(retry, force, dismiss);
      card.append(head, meta, text, reason, actions);
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
