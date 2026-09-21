/* Letters waiting only because the target currently has a draft or dialog. */
import { t } from './lexicon.js';
import { status, toast } from './ui.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const ageOf = (at) => {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 1_000));
  if (!Number.isFinite(seconds) || seconds < 5) return t('messages.age_now', 'just now');
  if (seconds < 60) return t('messages.age_short_seconds', '{seconds}s', { seconds });
  const minutes = Math.floor(seconds / 60);
  return t('messages.age_short_minutes', '{minutes}m {seconds}s', { minutes, seconds: seconds % 60 });
};

const typeOf = (source) => ({
  tell: t('messages.type_tell', 'Agent tell'),
  wipeboard_notice: t('messages.type_wipeboard', 'Wipeboard notification'),
  owner: t('messages.type_owner', 'Owner message'),
  house: t('messages.type_house', 'House message'),
  jikan: t('messages.type_jikan', 'Cron job'),
})[source] || source;

export const dismissalIds = (messages) => messages.map((message) => message.id);

export function buildMessageQueue(host, onCount = () => {}) {
  const note = el('p', 'mq-note', t('messages.note', 'A message waits only while a draft or dialog is present. After two minutes Ronin attempts it once, then removes it.'));
  const dismissAll = el('button', 'cc-btn mq-dismiss-all', t('messages.dismiss_all', 'Dismiss All'));
  dismissAll.type = 'button';
  const tools = el('div', 'mq-tools');
  tools.append(dismissAll);
  const reconnecting = status('mq-reconnecting');
  const board = el('div', 'mq-board');
  const empty = el('p', 'mq-empty', t('messages.empty', 'No messages are waiting.'));
  host.append(note, tools, reconnecting.el, board);
  let messages = [];

  const dismiss = async (ids) => {
    if (!ids.length) return;
    const response = await fetch('/api/messages', {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }),
    });
    const body = await response.json();
    if (!response.ok || body.ok === false) throw new Error(body.error || response.statusText);
  };

  const render = async () => {
    try {
      const response = await fetch('/api/messages');
      if (!response.ok) throw new Error(response.statusText);
      messages = (await response.json()).messages || [];
    } catch {
      reconnecting.say(t('messages.reconnecting', 'Reconnecting…'), 'busy');
      return;
    }
    reconnecting.say('');
    board.replaceChildren();
    tools.hidden = !messages.length;
    onCount(messages.length);
    if (!messages.length) { board.append(empty); return; }
    dismissAll.textContent = t('messages.dismiss_all_count', 'Dismiss All ({count})', { count: messages.length });
    for (const message of messages) {
      const card = el('article', 'mq-card mq-stuck');
      const head = el('div', 'mq-head');
      head.append(el('strong', '', typeOf(message.source)), el('span', 'mq-state', t('messages.state_age', '{state} · {age}', {
        state: t('messages.waiting', 'Waiting'), age: ageOf(message.created_at),
      })));
      const route = el('dl', 'mq-route');
      route.append(
        el('dt', '', t('messages.from', 'From')), el('dd', '', message.from || typeOf(message.source)),
        el('dt', '', t('messages.to_label', 'To')), el('dd', '', message.target),
      );
      const button = el('button', 'cc-btn', t('messages.dismiss', 'Dismiss'));
      button.type = 'button';
      button.addEventListener('click', async () => {
        try { await dismiss([message.id]); await render(); }
        catch (error) { toast(t('messages.action_failed', 'Message action failed — {reason}', { reason: error.message }), false); }
      });
      const actions = el('div', 'mq-actions'); actions.append(button);
      card.append(head, route, el('pre', 'mq-text', message.text), actions);
      board.append(card);
    }
  };

  dismissAll.addEventListener('click', async () => {
    try { await dismiss(dismissalIds(messages)); await render(); }
    catch (error) { toast(t('messages.action_failed', 'Message action failed — {reason}', { reason: error.message }), false); }
  });
  let timer = null;
  const enter = () => { void render(); if (!timer) timer = setInterval(() => void render(), 2_000); };
  const leave = () => { clearInterval(timer); timer = null; };
  return { enter, leave, destroy: leave };
}
