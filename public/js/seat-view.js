/* part of the ronin-cowork client — see js/README.md
 *
 * A DAIMYO'S TILE (KAN-755): a seat has no terminal (src/seats.ts). Where a terminal would be,
 * its tile shows its status line and work record on top (the task at hand and the open items
 * it holds), then its Tells thread both ways, and the tile's own composer under it writes to
 * its inbox (POST /api/messages, as to any Agent). Everything here is the seat's pushed card:
 * `seat_status`, `tegami` and `thread`; the whole record is the tile menu's, as for any Agent. */
import { t } from './lexicon.js';

const line = (className, text) => Object.assign(document.createElement('p'), { className, textContent: text });

export function makeSeatView() {
  const el = document.createElement('div');
  el.className = 'tile-seat';
  const head = document.createElement('div');
  head.className = 'tile-seat-head';
  const log = document.createElement('div');
  log.className = 'tile-seat-thread';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-label', t('seat.thread', 'Tells'));
  el.append(head, log);
  let shown = '';

  function paint(row) {
    const record = row?.tegami || null;
    const open = (record?.items || []).filter((item) => item.status !== 'Done');
    head.replaceChildren(
      line('tile-seat-status', row?.seat_status
        ? t('seat.status', 'Status line: {status}', { status: row.seat_status })
        : t('seat.status_none', 'No status line.')),
      line('tile-seat-task', record?.objective
        ? t('seat.task', 'Task at hand: {objective}', { objective: record.objective })
        : t('work_record.task_unstated', 'No task stated in this work record.')),
      ...(open.length
        ? open.map((item) => line('tile-seat-item', [item.id, item.title, item.status].filter(Boolean).join(' · ')))
        : [line('tile-seat-item', t('work_record.no_items', 'No work items held.'))]),
    );
    const thread = Array.isArray(row?.thread) ? row.thread : [];
    const text = JSON.stringify(thread);
    if (text === shown) return;
    shown = text;
    const atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
    log.replaceChildren(...(thread.length ? thread.map(entry) : [line('tile-seat-empty',
      t('seat.empty', 'No Tells yet. What you send here goes to its inbox; it reads it when it next looks.'))]));
    if (atEnd || !log.dataset.seen) log.scrollTop = log.scrollHeight;
    log.dataset.seen = '1';
  }

  function entry(one) {
    const node = document.createElement('div');
    node.className = 'tile-seat-entry';
    if (one.to) node.dataset.own = 'true';
    node.append(
      line('tile-seat-who', one.to
        ? t('seat.to', 'To @{name}', { name: one.to })
        : t('seat.from', 'From {name} [{channel}]', { name: one.from, channel: one.channel })),
      line('tile-seat-words', one.text),
    );
    return node;
  }

  return { el, paint, reset: () => { shown = ''; delete log.dataset.seen; log.replaceChildren(); head.replaceChildren(); } };
}
