/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TEAM WORKBENCH'S WAITING ON YOU AND EPICS (owner, 2026-11-04; KAN-232). Two selector cards
 * on the Team workbench, each a surface on a tilespace.
 *
 * WAITING ON YOU (`createTeamWaiting`): the Team's items that wait on the person, in three groups,
 * each oldest first, each line with how long it has waited. The items In Review split by the
 * signals (WORK_ITEMS_DESIGN.md 6a): With the lead, handed in and not on dev since; Ready to
 * accept, on dev since the last hand-in or handed in from a checkout. On both, Accept moves one
 * to Done, Send back asks for a comment, puts it on the item and moves it to In
 * Progress, back to the Agent that handed it in (to the Team if it has ended). Stuck: the
 * flagged items, each with its flag's reason; Reply puts a comment on the item, which its
 * holders hear. Every change is the work-item routes' transition, send-back and comment.
 *
 * EPICS (`createTeamEpics`): the Team's Epics. One opens straight onto its record
 * (`createEpicRecord`); several are a phalanx of Epic stones (`createEpicStones`), a pressed one
 * opening its record in the other tilespace, as the Epics workbench does.
 *
 * "The Team's items" are what the Team holds and what its members hold, the set `team member
 * status` reads. The teams push carries both readings on the Team's row (`waiting`, `epics`;
 * teams-api.ts, teamWork in work-items-read.ts); the Epics themselves are the store's pushed
 * `epics`. Nothing here asks the server on a push: the only requests are the writes.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { subscribe as hearTeams, teamByName } from './team-controller.js';
import { createEpicRecord, createEpicStones, createEpicsRead, holderButton } from './epics-surface.js';
import { humanAge } from './work-record.js';

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
};

const pill = (label, action, pressed = null) => {
  const button = el('button', 'cv-pill team-waiting-act', label);
  button.type = 'button';
  if (pressed !== null) button.setAttribute('aria-pressed', String(pressed));
  button.addEventListener('click', action);
  return button;
};

/** The Team's row on the teams push: its `waiting` ({ review, stuck }) and its `epics` (ids). */
export const teamWaiting = (row) => ({
  lead: Array.isArray(row?.waiting?.lead) ? row.waiting.lead : [],
  review: Array.isArray(row?.waiting?.review) ? row.waiting.review : [],
  stuck: Array.isArray(row?.waiting?.stuck) ? row.waiting.stuck : [],
});
export const teamEpicIds = (row) => new Set(Array.isArray(row?.epics) ? row.epics : []);

/** Waiting on you: With the lead, Ready to accept, then Stuck, each line an item card with its
 * actions (WORK_ITEMS_DESIGN.md 6a: you accept what you can try, what is on dev). */
export function createTeamWaiting({ team }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('team_waiting.title', 'Waiting on you'), className: 'setup-surface team-waiting' });
  let composing = null; // { id, kind: 'send_back' | 'reply' }: the one comment box open
  const drafts = new Map(); // `${kind}:${id}` -> the words typed, kept across a push's redraw
  const answers = new Map(); // id -> { text, failed }: what the last write said
  let drawn = null;

  const write = async (id, steps) => {
    let said = '';
    for (const step of steps) {
      const result = await request(`/api/work-items/${encodeURIComponent(id)}/${step.path}`, { method: 'POST', json: step.json });
      if (!result.ok) { answers.set(id, { text: result.message, failed: true }); paint(true); return false; }
      said = result.data?.acknowledgement || said;
    }
    answers.set(id, { text: said, failed: false });
    paint(true);
    return true;
  };

  function composer(item, kind) {
    const key = `${kind}:${item.id}`;
    const box = el('div', 'epic-card-body team-waiting-compose');
    const words = el('textarea', 'team-waiting-words');
    words.rows = 3;
    words.value = drafts.get(key) || '';
    words.dataset.compose = key;
    words.setAttribute('aria-label', t('team_waiting.comment', 'Comment'));
    words.addEventListener('input', () => drafts.set(key, words.value));
    const label = kind === 'send_back' ? t('team_waiting.send_back', 'Send back') : t('team_waiting.reply', 'Reply');
    const send = pill(label, async () => {
      const text = words.value.trim();
      send.disabled = true;
      // Send back is one act: In Progress with the comment, back to the Agent that handed it in.
      const steps = kind === 'send_back' ? [{ path: 'send-back', json: { text } }] : text ? [{ path: 'comment', json: { text } }] : [];
      if (await write(item.id, steps)) { drafts.delete(key); composing = null; paint(true); }
      send.disabled = false;
    });
    send.classList.add('is-send');
    box.append(words, send);
    return box;
  }

  function card(item, group) {
    const node = el('article', `epic-card team-waiting-card${group === 'stuck' ? ' is-flagged' : ''}`);
    node.dataset.item = item.id;
    node.append(el('b', 'team-waiting-title', item.title || item.id));
    const meta = el('div', 'epic-card-meta');
    const waited = el('span', 'team-waiting-age', humanAge(Math.max(0, Date.now() - Date.parse(item.since || '') || 0)));
    if (item.since) waited.title = new Date(item.since).toLocaleString();
    meta.append(holderButton(item), el('span', 'epic-card-key', item.jira || item.id), waited);
    node.append(meta);
    if (group === 'stuck' && item.reason) node.append(el('p', 'epic-objective team-waiting-reason', item.reason));
    const acts = el('div', 'epic-statuses');
    acts.setAttribute('role', 'group');
    const open = (kind) => composing?.id === item.id && composing.kind === kind;
    const toggle = (kind) => () => { composing = open(kind) ? null : { id: item.id, kind }; paint(true); };
    if (group === 'review' || group === 'lead') {
      acts.append(
        pill(t('team_waiting.accept', 'Accept'), (event) => { event.currentTarget.disabled = true; void write(item.id, [{ path: 'transition', json: { status: 'Done' } }]); }),
        pill(t('team_waiting.send_back', 'Send back'), toggle('send_back'), open('send_back')),
      );
    } else acts.append(pill(t('team_waiting.reply', 'Reply'), toggle('reply'), open('reply')));
    node.append(acts);
    const answer = answers.get(item.id);
    if (answer) {
      const line = el('p', 'epic-answer', answer.text);
      line.setAttribute('role', 'status');
      if (answer.failed) line.dataset.state = 'failed';
      node.append(line);
    }
    if (open('send_back') || open('reply')) node.append(composer(item, composing.kind));
    return node;
  }

  function group(kind, heading, items) {
    const section = el('section', 'epic-group team-waiting-group');
    section.dataset.group = kind;
    section.append(el('h3', 'epic-group-heading', `${heading} · ${items.length}`));
    const cards = el('div', 'epic-cards team-waiting-cards');
    cards.append(...items.map((item) => card(item, kind)));
    section.append(cards);
    return section;
  }

  function paint(force = false) {
    const { lead, review, stuck } = teamWaiting(teamByName(team()));
    const signature = JSON.stringify([team(), lead, review, stuck]);
    if (!force && signature === drawn) return;
    drawn = signature;
    // A push redraws the lines; the comment box being typed in keeps its words, its caret and focus.
    const typing = out.content.querySelector?.('textarea:focus');
    const caret = typing ? { key: typing.dataset.compose, start: typing.selectionStart, end: typing.selectionEnd } : null;
    const groups = el('div', 'epic-groups team-waiting-groups');
    if (lead.length) groups.append(group('lead', t('team_waiting.with_lead', 'With the lead'), lead));
    if (review.length) groups.append(group('review', t('team_waiting.ready', 'Ready to accept'), review));
    if (stuck.length) groups.append(group('stuck', t('team_waiting.stuck', 'Stuck'), stuck));
    if (!lead.length && !review.length && !stuck.length) groups.append(el('p', 'epic-empty', t('team_waiting.none', 'Nothing is waiting on you.')));
    const scroll = out.content.scrollTop;
    out.content.replaceChildren(groups);
    out.content.scrollTop = scroll;
    const again = caret && [...out.content.querySelectorAll('textarea')].find((box) => box.dataset.compose === caret.key);
    if (again) { again.focus(); again.setSelectionRange(caret.start, caret.end); }
  }

  let stop = null;
  return {
    el: out.el,
    show: () => { stop ??= hearTeams(() => paint()); paint(true); },
    destroy: () => { stop?.(); stop = null; },
  };
}

/** The Team's Epics: one opens onto its record, several are Epic stones. `seat` names the
 * tilespace a pressed stone opens its record in. */
export function createTeamEpics({ team, workbench, seat }) {
  const { createSurface, setSurfaceState } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('epics.title', 'Epics'), className: 'setup-surface team-epics', flush: true }); // the stones or record inside keep their own inset
  const every = createEpicsRead(() => '');
  const mine = () => teamEpicIds(teamByName(team()));
  const read = {
    list: () => every.list().filter((epic) => mine().has(epic.id)),
    items: (id) => every.items(id),
    subscribe: (listener) => {
      const stopEpics = every.subscribe(listener);
      const stopTeams = hearTeams(listener);
      return () => { stopEpics(); stopTeams(); };
    },
  };
  let stones = null;
  const records = new Map(); // epic id -> its record, made the first time it is the only one
  let at = null; // what is drawn: 'stones', an epic id, or 'none'
  const hide = () => { for (const child of out.content.children) child.hidden = true; };

  function paint() {
    const epics = read.list();
    const next = epics.length === 1 ? epics[0].id : epics.length ? 'stones' : 'none';
    out.header.title.textContent = epics.length === 1 ? (epics[0].title || epics[0].id) : t('epics.title', 'Epics');
    setSurfaceState(out.el, next === 'none' ? 'empty' : null, next === 'none' ? t('team_epics.none', 'No Epics for this Team yet.') : '');
    if (next === at) return;
    at = next;
    hide();
    if (next === 'stones') {
      if (!stones) { stones = createEpicStones({ epicsRead: read, workbench, seat, header: false }); out.content.append(stones.el); }
      stones.el.hidden = false;
      stones.show();
    } else if (next !== 'none') {
      if (!records.has(next)) { const record = createEpicRecord(next, { epicsRead: read, header: false }); records.set(next, record); out.content.append(record.el); }
      const record = records.get(next);
      record.el.hidden = false;
      record.show();
    }
  }

  let stop = null;
  return {
    el: out.el,
    show: () => { stop ??= read.subscribe(paint); paint(); },
    destroy: () => {
      stop?.(); stop = null;
      stones?.destroy(); stones = null;
      for (const record of records.values()) record.destroy();
      records.clear();
    },
  };
}
