/* Inbound session messages that have not yet delivered. */
import { t } from './lexicon.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function buildMessageQueue(host) {
  const board = el('div', 'mq-board');
  const empty = el('p', 'mq-empty', t('messages.empty', 'No messages are waiting.'));
  host.append(board);

  const act = async (id, action, method = 'POST') => {
    const response = await fetch(`/api/messages/${encodeURIComponent(id)}${action}`, { method });
    if (!response.ok) throw new Error(await response.text());
    await render();
  };

  const render = async () => {
    const response = await fetch('/api/messages');
    const body = await response.json();
    board.replaceChildren();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) { board.append(empty); return; }
    for (const message of messages) {
      const card = el('article', `mq-card mq-${message.state}`);
      const head = el('div', 'mq-head');
      head.append(el('strong', '', t('messages.to', 'To {target}', { target: message.target })), el('span', 'mq-state', message.state));
      const meta = el('div', 'mq-meta', t('messages.meta', '{source} · {attempts} attempts', { source: message.source, attempts: message.attempts }));
      const text = el('pre', 'mq-text', message.text);
      const reason = el('p', 'mq-reason', message.reason);
      const actions = el('div', 'mq-actions');
      const retry = el('button', 'cc-btn', t('messages.retry', 'Try Again'));
      const force = el('button', 'cc-btn mq-force', t('messages.force', 'Force'));
      const dismiss = el('button', 'cc-btn', t('messages.dismiss', 'Dismiss'));
      retry.type = force.type = dismiss.type = 'button';
      retry.addEventListener('click', () => void act(message.id, '/retry'));
      force.addEventListener('click', () => void act(message.id, '/force'));
      dismiss.addEventListener('click', () => void act(message.id, '', 'DELETE'));
      actions.append(retry, force, dismiss);
      card.append(head, meta, text, reason, actions);
      board.append(card);
    }
  };
  const timer = setInterval(() => void render(), 2_000);
  void render();
  return { enter: render, destroy: () => clearInterval(timer) };
}
