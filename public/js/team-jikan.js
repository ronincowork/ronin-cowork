/* part of the ronin-cowork client — see js/README.md */
/**
 * THE CRON JOBS TAB (JIKAN) — a team's scheduled requests, on the team commons.
 *
 * A job is one request, delivered to one session of this team — by name, or to whoever
 * leads it — at a moment or on a rhythm, by Ronin's own clock. The list is the server's
 * (`/api/teams/:team/jikan`, src/jikan.ts); this only draws it and sends the owner's
 * hand: add, pause, resume, run now, remove. Nothing here births anything. Same lifecycle
 * as the wipeboard slice: `setTeam` from the view's paint, a slow poll while entered.
 */
import { t } from './lexicon.js';
import { request } from './request.js';

const el = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

const when = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export function createTeamJikan() {
  const root = el('div', 'tj');
  const note = el('p', 'tw-note');
  const form = el('form', 'tw-config-form tj-form');
  const lists = el('div', 'tj-lists');
  root.append(note, form, lists);
  let team = '';
  let members = [];
  let jobs = [];
  let entered = false;
  let timer = null;
  let inFlight = false;
  const url = (tail = '') => `/api/teams/${encodeURIComponent(team)}/jikan${tail}`;

  /* ---- the add form: what is the request, who, when ---- */
  const field = (label, control, hint) => {
    const wrap = el('label', 'tw-config-field');
    wrap.append(el('span', 'tw-config-label', label), control);
    if (hint) wrap.append(el('span', 'tw-config-hint', hint));
    return wrap;
  };
  const requestInput = el('input', 'wk-field-control');
  requestInput.placeholder = t('team_jikan.request_placeholder', '+brief: — the words the agent will receive');
  requestInput.maxLength = 2000;
  const toSelect = el('select', 'wk-field-control');
  const whenInput = el('input', 'wk-field-control');
  whenInput.placeholder = t('team_jikan.when_placeholder', 'weekdays 08:00');
  whenInput.maxLength = 120;
  const whenPreview = el('span', 'tw-config-hint tj-preview');
  const add = el('button', 'wk-action', t('team_jikan.add', 'Schedule it'));
  add.type = 'submit';
  add.dataset.kind = 'primary';
  const status = el('span', 'tw-config-status');
  const actions = el('div', 'tw-config-actions');
  actions.append(add, status);
  form.append(
    el('p', 'tw-config-head', t('team_jikan.new', 'New job')),
    field(t('team_jikan.request', 'What is the request?'), requestInput),
    field(t('team_jikan.to', 'To'), toSelect),
    field(t('team_jikan.when', 'When'), whenInput, t('team_jikan.when_help', 'One time: once 2026-09-04 08:00. Repeating: daily 08:00 · weekdays 08:00 · weekly mon 08:00 · monthly 1 09:00 · hourly · every 30m · or a five-field cron line.')),
    whenPreview,
    actions,
  );

  const paintTo = () => {
    const current = toSelect.value;
    toSelect.replaceChildren();
    const lead = el('option', null, t('team_jikan.to_lead', 'the team lead, whoever that is at the time'));
    lead.value = 'lead';
    toSelect.append(lead);
    for (const name of members) { const o = el('option', null, name); o.value = name; toSelect.append(o); }
    toSelect.value = [...toSelect.options].some((o) => o.value === current) ? current : 'lead';
  };

  let previewTimer = null;
  whenInput.addEventListener('input', () => {
    clearTimeout(previewTimer);
    const words = whenInput.value.trim();
    if (!words) { whenPreview.textContent = ''; return; }
    previewTimer = setTimeout(async () => {
      const r = await request(`/api/jikan/when?words=${encodeURIComponent(words)}`);
      if (whenInput.value.trim() !== words) return;
      whenPreview.textContent = r.ok
        ? t('team_jikan.when_preview', '{words} → next {next}', { words, next: (r.data.next || []).map(when).join(' · ') || t('team_jikan.never', 'never — that time has passed') })
        : r.message;
    }, 250);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!team) return;
    status.textContent = t('team_jikan.saving', 'scheduling…');
    add.disabled = true;
    const r = await request(url(), { method: 'POST', json: { request: requestInput.value, to: toSelect.value, when: whenInput.value, by: 'owner' } });
    add.disabled = false;
    if (!r.ok) { status.textContent = r.message; return; }
    status.textContent = t('team_jikan.scheduled', 'scheduled — next {next}', { next: when(r.data.job?.due) });
    requestInput.value = ''; whenInput.value = ''; whenPreview.textContent = '';
    await refresh();
  });

  /* ---- the lists: scheduled, and done ---- */
  const action = (label, kind, fn) => {
    const b = el('button', 'wk-action', label);
    b.type = 'button';
    b.dataset.size = 'compact';
    if (kind) b.dataset.kind = kind;
    b.addEventListener('click', async () => { b.disabled = true; await fn(); b.disabled = false; });
    return b;
  };
  const verb = async (id, method, tail, json) => {
    const r = await request(url(`/${encodeURIComponent(id)}${tail}`), json ? { method, json } : { method });
    if (!r.ok) note.textContent = r.message;
    await refresh();
    return r;
  };
  /** `last` is `<iso> <outcome>`: the moment, then the word. */
  const lastWord = (job) => {
    if (!job.last) return t('team_jikan.not_yet', 'not yet');
    const [at, ...rest] = job.last.split(' ');
    const outcome = rest.join(' ');
    const word = outcome === 'delivered' ? t('team_jikan.delivered', 'delivered') : outcome === 'queued' ? t('team_jikan.queued', 'queued — waiting to enter') : outcome;
    return `${when(at)} · ${word}`;
  };
  const row = (job, done) => {
    const tr = el('tr', 'tj-row');
    tr.dataset.state = job.state;
    const what = el('td', 'tj-request'); what.append(el('b', null, job.request));
    what.append(el('span', 'tj-by', t('team_jikan.by', 'set by {by}', { by: job.by })));
    const to = el('td', null, job.to === 'lead' ? t('team_jikan.lead', '人 lead') : job.to);
    const timing = el('td', null, job.when);
    const next = el('td', null, done ? '' : (job.state === 'paused' ? t('team_jikan.paused', 'paused') : when(job.due)));
    const last = el('td', null, lastWord(job));
    const acts = el('td', 'tj-actions');
    if (!done) {
      acts.append(job.state === 'paused'
        ? action(t('team_jikan.resume', 'Resume'), null, () => verb(job.id, 'PUT', '', { state: 'active' }))
        : action(t('team_jikan.pause', 'Pause'), null, () => verb(job.id, 'PUT', '', { state: 'paused' })));
      acts.append(action(t('team_jikan.run_now', 'Run at next tick'), null, () => verb(job.id, 'PUT', '', { state: 'now' })));
    }
    acts.append(action(t('team_jikan.remove', 'Remove'), 'danger', () => verb(job.id, 'DELETE', '')));
    tr.append(what, to, timing, next, last, acts);
    return tr;
  };
  const table = (heading, rows, done) => {
    const wrap = el('section', 'tj-section');
    wrap.append(el('p', 'tw-config-head', heading));
    if (!rows.length) { wrap.append(el('p', 'tw-note', done ? t('team_jikan.none_done', 'Nothing has run yet.') : t('team_jikan.none', 'Nothing scheduled. Add one above, or an agent can with tejun-jikan.'))); return wrap; }
    const tbl = el('table', 'tj-table');
    const head = el('tr');
    for (const h of [t('team_jikan.col_request', 'Request'), t('team_jikan.col_to', 'To'), t('team_jikan.col_when', 'When'), done ? '' : t('team_jikan.col_next', 'Next'), t('team_jikan.col_last', 'Last'), '']) head.append(el('th', null, h));
    tbl.append(head);
    for (const job of rows) tbl.append(row(job, done));
    wrap.append(tbl);
    return wrap;
  };
  const paint = () => {
    lists.replaceChildren(
      table(t('team_jikan.scheduled_head', 'Scheduled'), jobs.filter((j) => j.state !== 'done'), false),
      table(t('team_jikan.done_head', 'Done'), jobs.filter((j) => j.state === 'done'), true),
    );
  };

  async function refresh() {
    if (!team || inFlight) return;
    inFlight = true;
    try {
      const r = await request(url(), { cache: 'no-store' });
      if (!r.ok) { note.textContent = t('team_jikan.read_failed', 'Could not read the jobs — {message}', { message: r.message }); return; }
      jobs = Array.isArray(r.data?.jobs) ? r.data.jobs : [];
      note.textContent = t('team_jikan.help', 'A request delivered to one agent of this team, by name or to its lead, at a moment or on a rhythm. Ronin checks every minute and delivers through the message door — the dial is honoured, and a busy agent gets it queued. Nothing here starts an agent or a team.');
      paint();
    } finally {
      inFlight = false;
    }
  }

  return {
    el: root,
    setTeam: (name, memberNames = []) => {
      const changed = name !== team;
      team = name || '';
      members = [...memberNames];
      paintTo();
      if (changed) { jobs = []; paint(); if (entered) void refresh(); }
    },
    mount: () => {},
    enter: () => { entered = true; void refresh(); timer = window.setInterval(() => { void refresh(); }, 15000); },
    leave: () => { entered = false; if (timer) { clearInterval(timer); timer = null; } },
    destroy: () => { entered = false; if (timer) { clearInterval(timer); timer = null; } },
  };
}
