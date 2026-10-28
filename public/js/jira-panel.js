/* part of the ronin-cowork client — see js/README.md */
/**
 * THE JIRA PANEL — the Campaign's Jira space, over the bridge's own routes
 * (`/api/jira/:campaign`, owned by the `jira` Services part). Not connected, it is the
 * Connect walkthrough with its four fields; connected, it is the connection, Check,
 * the three switches, Sync now, the state, and for dev the pairs. How it runs heads both, and the
 * Desk's work items by level follow. A 404 means the part is not on. The token goes out
 * on Connect and is never read back. Every section folds and keeps its fold.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { ask } from './ask.js';
import { createStep, el } from './form-steps.js';

const RENEW_DAYS = 14;
const DAY = 86_400_000;

export function createJiraPanel(selected) {
  const { createSurface, createAction, createActionBar, createField, createMetadata, createNotice } = WorkspaceKit.primitives;
  const check = createAction({ label: t('jira.check', 'Check'), size: 'compact', action: () => void act('check') });
  const sync = createAction({ label: t('jira.sync_now', 'Sync now'), size: 'compact', kind: 'primary', action: () => void act('sync') });
  const surface = createSurface({ label: t('jira.title', 'Jira'), className: 'setup-surface jira-surface', actions: [check, sync] });
  surface.header?.el.classList.add('launch-form-head');
  const notice = createNotice();
  const form = el('div', 'fs-steps jira-form');
  surface.content.append(notice.el, form);
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : t('jira.never', 'never'));

  /** The steps the user does in admin.atlassian.com and Jira (JIRA_CONNECT §2, steps 2–6). */
  const WALKTHROUGH = () => [
    t('jira.step_account', 'admin.atlassian.com › your organization › Directory › Service accounts › Create a service account. Any name, 6–30 characters. On Select app roles, give Jira the role User and leave every other app at None.'),
    t('jira.step_token', 'Open the account › Create credentials › API token. Any name; expiry up to 365 days. The Review page shows the expiry date: enter it below.'),
    t('jira.step_scopes', 'Scopes: read:jira-work, write:jira-work and read:jira-user. Create, copy, and paste the token below straight away. Scopes cannot be changed later; a missing one means a new token.'),
    t('jira.step_access', 'On a Free site, nothing to do. On a paid site, in the space: Space settings › Access, add the account as Member.'),
    t('jira.step_linking', 'In Jira: Settings › Work items › Work item linking › Activate, if it is off.'),
  ];
  let snap = null;
  let items = [];
  let filter = '';
  // Each section's fold, kept across repaints.
  const open = { how: true, before: true, connect: true, connection: true, renew: false, sync: true, items: false, pairs: false };
  /** A numbered section that folds; `meta` is the line it shows folded. */
  const section = (n, key, title, meta = '') => {
    const step = createStep({ n, key, title, onToggle: () => { open[key] = !open[key]; step.setCollapsed(!open[key], meta); } });
    step.setCollapsed(!open[key], meta);
    return step;
  };
  const read = (text) => el('p', 'jira-read', text);
  let renewShown = false;
  // The switches before Connect: they start on and go out with it.
  const draft = { polling: true, assigned: true, ronin: true };

  const campaign = () => selected()?.id || '';
  const api = (tail = '') => `/api/jira/${encodeURIComponent(campaign())}${tail}`;
  const say = (problems, done) => notice.set(problems?.length ? 'failed' : 'success', problems?.length ? problems.join('\n') : done);

  const input = (type, placeholder = '') => {
    const node = el('input');
    node.type = type; node.placeholder = placeholder; node.autocomplete = 'off'; node.spellcheck = false;
    return node;
  };

  async function load() {
    if (!campaign()) return;
    const [result, listed] = await Promise.all([
      request(api(), { cache: 'no-store' }),
      request(`/api/work-items?campaign=${encodeURIComponent(campaign())}`, { cache: 'no-store' }),
    ]);
    snap = result.ok ? result.data : result.status === 404 ? { off: true } : { error: result.message };
    items = listed.ok ? listed.data.items : [];
    paint();
  }

  async function act(what, item = '') {
    check.setDisabled(true); sync.setDisabled(true);
    notice.set('info', what === 'check' ? t('jira.checking', 'Checking…') : t('jira.syncing', 'Syncing…'));
    const result = what === 'check'
      ? await request(api('/check'), { method: 'POST' })
      : await request(api(item ? `/sync/${encodeURIComponent(item)}` : '/sync'), { method: 'POST' });
    if (!result.ok && !result.data?.problems) notice.set('failed', result.message);
    else if (what === 'check') say(result.data.problems, t('jira.all_good', 'Every check passes.'));
    else notice.set('success', item ? t('jira.synced_one', '{item} synced.', { item }) : t('jira.synced', 'Synced.'));
    await load();
  }

  async function put(body, done) {
    notice.set('info', t('jira.saving', 'Saving…'));
    const result = await request(api(), { method: 'PUT', json: body });
    if (!result.ok) notice.set('failed', result.message);
    else say(result.data.problems, done);
    await load();
  }

  /* ---- Not connected: the walkthrough, then the four fields ---- */
  function connectSteps() {
    const steps = section(2, 'before', t('jira.before', 'In Atlassian'));
    const list = el('ol', 'jira-walkthrough');
    for (const line of WALKTHROUGH()) list.append(el('li', 'jira-read', line));
    steps.body.append(read(t('jira.before_help', 'Keep this panel open while you make the account: the token goes straight into the field below.')), list);

    const fields = section(3, 'connect', t('jira.connect', 'Connect'));
    const site = input('url', 'https://your-site.atlassian.net');
    const space = input('text', 'KAN');
    const token = input('password');
    const expiry = input('date');
    const go = createAction({ label: t('jira.connect', 'Connect'), size: 'compact', kind: 'primary', disabled: true, action: () => {
      void put({ site: site.value.trim(), space: space.value.trim(), token: token.value.trim(), expiry: expiry.value, ...draft }, t('jira.connected', 'Connected, and the first sync has run.'));
    } });
    const ready = () => go.setDisabled(![site, space, token, expiry].every((node) => node.value.trim()));
    for (const node of [site, space, token, expiry]) node.addEventListener('input', ready);
    fields.body.append(
      createField({ label: t('jira.site', 'Site URL'), control: site }).el,
      createField({ label: t('jira.space', 'Space key'), control: space, description: t('jira.space_help', 'The prefix on every work item: KAN in KAN-1. Also in Space settings › Details.') }).el,
      createField({ label: t('jira.token', 'API token'), control: token, description: t('jira.token_help', 'Kept by Ronin with Services; never shown again.') }).el,
      createField({ label: t('jira.expiry', 'Token expiry'), control: expiry, description: t('jira.expiry_help', 'No call returns it: the date from the Review page.') }).el,
      read(t('jira.connect_warning', 'Connect puts every work item in this Desk on the space, assigned to the account. Then, in Jira, assign one work item to the account and press Sync now.')),
      createActionBar({ actions: [go] }).el,
    );
    return [steps.el, fields.el];
  }

  /* ---- Connected ---- */
  function connectionStep() {
    const step = section(2, 'connection', t('jira.connection', 'Connection'), `${snap.site} · ${snap.space?.key || ''}`);
    const days = snap.tokenExpiry ? Math.ceil((new Date(snap.tokenExpiry) - Date.now()) / DAY) : null;
    step.body.append(createMetadata({ rows: [
      [t('jira.site', 'Site URL'), snap.site],
      [t('jira.space', 'Space key'), snap.space?.key],
      [t('jira.account', 'Account'), snap.account],
      [t('jira.expiry', 'Token expiry'), snap.tokenExpiry || '—'],
    ] }).el);
    const expiring = days !== null && days <= RENEW_DAYS;
    if (expiring) {
      step.body.append(createNotice({ kind: 'warning', message: t('jira.renew', 'The token expires in {n} days. Make a new one (steps 3–4), paste it here, then revoke the old one.', { n: Math.max(days, 0) }) }).el);
    }
    // Renewal: a new token and its date, and nothing else changes. Folded until it is due.
    // Due, it opens once; after that the owner's fold stands.
    if (expiring && !renewShown) { open.renew = true; renewShown = true; }
    const renewal = createStep({ key: 'renew', title: t('jira.replace_token', 'Replace token'), onToggle: () => { open.renew = !open.renew; renewal.setCollapsed(!open.renew, ''); } });
    const token = input('password');
    const expiry = input('date');
    const renew = createAction({ label: t('jira.replace_token', 'Replace token'), size: 'compact', disabled: true, action: () => void put({ token: token.value.trim(), expiry: expiry.value }, t('jira.token_replaced', 'Token replaced.')) });
    const ready = () => renew.setDisabled(!token.value.trim() || !expiry.value);
    token.addEventListener('input', ready); expiry.addEventListener('input', ready);
    renewal.body.append(
      createField({ label: t('jira.new_token', 'New API token'), control: token }).el,
      createField({ label: t('jira.expiry', 'Token expiry'), control: expiry }).el,
      createActionBar({ actions: [renew] }).el,
    );
    renewal.setCollapsed(!open.renew, '');
    const disconnect = createAction({ label: t('jira.disconnect', 'Disconnect'), size: 'compact', action: async () => {
      if (!confirm(t('jira.disconnect_confirm', 'Disconnect this Desk from Jira? Every pair drops; nothing is deleted on either side.'))) return;
      const result = await request(api(), { method: 'DELETE' });
      notice.set(result.ok ? 'success' : 'failed', result.ok ? t('jira.disconnected', 'Disconnected.') : result.message);
      await load();
    } });
    step.body.append(renewal.el, createActionBar({ actions: [disconnect] }).el);
    return step.el;
  }

  function syncStep() {
    const step = section(3, 'sync', t('jira.sync', 'Sync'), `${t('jira.last_check', 'Last check')} · ${when(snap.lastCheck)}`);
    const failed = snap.failed || [];
    step.body.append(
      createMetadata({ rows: [
        [t('jira.last_check', 'Last check'), when(snap.lastCheck)],
        [t('jira.pair_count', 'Pairs'), String(snap.pairCount ?? 0)],
        [t('jira.failed', 'Failed writes'), failed.length ? t('jira.failed_n', '{n}: Sync now tries them again.', { n: failed.length }) : '0'],
      ] }).el);
    for (const write of failed) step.body.append(el('p', 'fs-step-help', `${write.item} · ${write.line?.op} · ${write.error}`));
    if (snap.lastError) step.body.append(createNotice({ kind: 'failed', message: snap.lastError }).el);
    return step.el;
  }

  /** For dev: one row per pair. Holders link to their Agent; Re-sync reads one pair in again. */
  function pairsStep() {
    const step = section(5, 'pairs', t('jira.pairs', 'Pairs'), t('jira.pairs_n', '{n} pairs', { n: snap.pairCount ?? 0 }));
    const search = input('search', t('jira.filter', 'Filter: key, id, title, status, holder'));
    search.value = filter;
    const wrap = el('div', 'tj-table-wrap');
    const table = el('table', 'tj-table jira-pairs');
    wrap.append(table);
    const paintRows = () => {
      const head = el('tr');
      for (const word of [t('jira.col_key', 'Jira'), t('jira.col_id', 'Ronin'), t('jira.col_title', 'Title'), t('jira.col_kind', 'Level · kind'), t('jira.col_started', 'Started in'), t('jira.col_status', 'Ronin status'), t('jira.col_jira_status', 'Jira status'), t('jira.col_holders', 'Holders'), t('jira.col_flagged', 'Flagged'), t('jira.col_last_in', 'Last in'), t('jira.col_last_out', 'Last out'), t('jira.col_failed', 'Failed'), '']) head.append(el('th', null, word));
      table.replaceChildren(head);
      const needle = filter.toLowerCase();
      for (const pair of snap.pairs || []) {
        const text = [pair.key, pair.id, pair.title, pair.status, pair.jiraStatus, ...pair.holders].join(' ').toLowerCase();
        if (needle && !text.includes(needle)) continue;
        const row = el('tr');
        const key = el('a', null, pair.key);
        key.href = `${snap.site}/browse/${pair.key}`; key.target = '_blank'; key.rel = 'noopener';
        const holders = el('td');
        pair.holders.forEach((holder, i) => {
          if (i) holders.append(', ');
          const [kind, name] = holder.split(':');
          if (kind !== 'agent') { holders.append(holder); return; }
          const agent = el('a', null, name);
          agent.href = `#/agent/${encodeURIComponent(name)}`;
          holders.append(agent);
        });
        const resync = createAction({ label: t('jira.resync', 'Re-sync'), size: 'compact', action: () => void act('sync', pair.id) });
        const failed = (snap.failed || []).filter((write) => write.item === pair.id).map((write) => write.line?.op).join(', ');
        const cell = (content) => { const td = el('td'); td.append(content); return td; };
        row.append(cell(key), el('td', null, pair.id), el('td', null, pair.title), el('td', null, `${pair.level} · ${pair.kind || '—'}`),
          el('td', null, pair.started === 'jira' ? 'Jira' : 'Ronin'), el('td', null, pair.status), el('td', null, pair.jiraStatus || '—'), holders,
          el('td', null, pair.flagged ? t('jira.flagged', 'Flagged') : ''), el('td', null, when(pair.lastIn)), el('td', null, when(pair.lastOut)), el('td', null, failed), cell(resync.el));
        table.append(row);
      }
    };
    search.addEventListener('input', () => { filter = search.value; paintRows(); });
    paintRows();
    step.body.append(createField({ label: t('jira.filter_label', 'Filter'), control: search }).el, wrap);
    return step.el;
  }

  /** What moves, and whether it is moving now. */
  function howStep() {
    const connected = snap.connected === true;
    const word = (on) => (on ? t('campaign_view.on', 'On') : t('campaign_view.off', 'Off'));
    const step = section(1, 'how', t('jira.how', 'How it runs'));
    const line = (name, state, text) => { const p = read(''); p.append(el('b', null, `${name} · ${state}`), ` — ${text}`); return p; };
    // How it runs is the three switches, always, each with its caption under it; the master
    // lives in Installations and stays a line. Before Connect they are a draft that rides the
    // Connect PUT; connected, a toggle PUTs.
    const SWITCHES = [
      ['polling', t('jira.polling', 'Polling'), t('jira.polling_text', 'Down, Jira → Ronin: Jira is read every minute while Ronin is open in a browser, hourly otherwise; off, only Sync now reads it.')],
      ['assigned', t('jira.assigned', 'Assigned items'), t('jira.assigned_text', 'Up, Ronin → Jira: changes to items that came from Jira go out to Jira; off, they stay in Ronin.')],
      ['ronin', t('jira.ronin', 'Ronin’s items'), t('jira.ronin_text', 'Up, Ronin → Jira: items made in Ronin are created on Jira, at Connect and after, and their changes go out; off, they stay in Ronin.')],
    ];
    const both = [t('campaign_view.on', 'On'), t('campaign_view.off', 'Off')];
    step.body.append(line(t('jira.how_master', 'Services › Jira'), word(!snap.off), t('jira.how_master_text', 'the master switch, in Installations; off, nothing moves.')));
    for (const [key, label, text] of SWITCHES) {
      const one = ask([{ fields: [{ key, label, switch: both }] }], {
        value: { [key]: connected ? snap[key] : draft[key] }, density: 'tight',
        onChange: (value) => {
          if (connected) void put({ [key]: value[key] === true }, t('jira.saved', 'Saved.'));
          else draft[key] = value[key] === true;
        },
      });
      step.body.append(one.el, read(text));
    }
    step.body.append(line(t('jira.how_sync', 'Sync now'), `${t('jira.last_check', 'Last check')} ${when(snap.lastCheck)}`, t('jira.how_sync_text', 'always reads: one read, the deleted-item check, and failed writes retried.')));
    return step.el;
  }

  /** The Desk's items as a tree: epics with their children, then the items with no parent.
   *  Not connected, it is what Connect will put on the space; connected, what is paired. */
  function itemsStep(n) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const children = (id) => items.filter((item) => item.parent === id);
    const roots = items.filter((item) => !byId.has(item.parent)).sort((a, b) => b.level - a.level);
    const paired = items.filter((item) => item.external?.jira).length;
    const step = section(n, 'items', t('jira.items', 'Work items by level'), t('jira.items_n', '{n} items · {p} paired', { n: items.length, p: paired }));
    const wrap = el('div', 'tj-table-wrap');
    const table = el('table', 'tj-table jira-tree');
    const head = el('tr');
    for (const word of [t('jira.col_id', 'Ronin'), t('jira.col_title', 'Title'), t('jira.col_kind_only', 'Kind'), t('jira.col_status', 'Ronin status'), t('jira.col_key', 'Jira')]) head.append(el('th', null, word));
    table.append(head);
    const row = (item, depth) => {
      const tr = el('tr');
      const title = el('td', null, item.title);
      title.dataset.depth = String(depth);
      const pair = item.external?.jira;
      const jira = el('td');
      if (pair && snap.site) {
        const key = el('a', null, pair.key);
        key.href = `${snap.site}/browse/${pair.key}`; key.target = '_blank'; key.rel = 'noopener';
        jira.append(key);
      } else jira.textContent = pair ? pair.key : t('jira.goes_up', 'goes up at sync');
      tr.append(el('td', null, item.id), title, el('td', null, item.kind || '—'), el('td', null, item.status), jira);
      table.append(tr);
      for (const child of children(item.id)) row(child, depth + 1);
    };
    for (const root of roots) row(root, 0);
    wrap.append(table);
    step.body.append(read(snap.connected
      ? t('jira.items_connected', 'Paired items show their Jira key; the rest go up at the next sync.')
      : t('jira.items_preview', 'What Connect will put on the space, assigned to the account.')), wrap);
    return step.el;
  }

  function paint() {
    form.replaceChildren();
    const connected = snap?.connected === true;
    check.el.hidden = !connected; sync.el.hidden = !connected;
    check.setDisabled(false); sync.setDisabled(false);
    if (!snap) return;
    if (snap.off) {
      form.append(howStep(), read(t('jira.off', 'Services › Jira is off for this Desk. Turn it on in Installations › Ronin Services, then come back here.')));
      return;
    }
    if (snap.error) { notice.set('failed', snap.error); return; }
    if (!connected) form.append(howStep(), ...connectSteps(), itemsStep(4));
    else form.append(howStep(), connectionStep(), syncStep(), itemsStep(4), pairsStep());
  }

  return { el: surface.el, enter: () => { notice.set('', ''); void load(); } };
}
