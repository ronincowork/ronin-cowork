/* part of the ronin-cowork client — see js/README.md */
/**
 * THE MOBILE DOCUMENT'S ENTRY MODULE. `mobile.html` holds the bar and an empty main; this
 * module fills them and routes the five acts a phone does: see a Team's Agents, see the
 * documents they work on, change Agent, change Team, launch a new Agent. Nothing here
 * decides "phone": the server sent this document because the request came from one
 * (src/index.ts), so the first frame the browser paints is already the mobile bar.
 *
 * Three screens, one at a time: Teams → a Team (Agents | Docs) → one Agent's tile. On the
 * tile the head is hidden and the bar's one メ sheet holds the head's own controls,
 * RELOCATED not cloned, so every handler and live widget keeps the owner it always had.
 */
import { fetchSessions } from './api.js';
import { request } from './request.js';
import { guard, showFailure } from './errors.js';
import { connectEvents, sessionsHandlers } from './events.js';
import { membersOfTeam, refreshTeams, subscribe, teamByName, teamsFromState, UNASSIGNED, unassignedSessions } from './team-controller.js';
import { loadMacros, loadProjects, projectData, refreshHome } from './home.js';
import { buildDocs } from './docs.js';
import { createTerminalTileHost } from './terminal-tile-host.js';
import { makeDrop } from './tiledrop.js';
import { S } from './state.js';
import { t } from './lexicon.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createFeedbackSurface } from './feedback.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};
const readable = (name) => String(name || '').split(/[_-]+/).filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
function teamLabel(team) {
  if (team.name === UNASSIGNED) return t('league.ronin', 'Ronin: no team');
  return String(team.title ?? '').trim() || team.name;
}
function agentLabel(session) {
  return session.title || readable(session.name);
}

/**
 * #/ · #/t/<team> · #/d/<team> · #/s/<team>/<session> · #/feedback — anything else is the
 * front door. The desktop's own `#/team/<name>` lands on the same Team, so one link opens
 * it on either device; a `#/m/…` bookmark from the shell's earlier life still resolves.
 */
const routeFromHash = () => {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (parts[0] === 'm') parts.shift();
  if (parts[0] === 'feedback') return { screen: 'feedback' };
  if ((parts[0] === 't' || parts[0] === 'team') && parts[1]) return { screen: 'agents', team: parts[1] };
  if (parts[0] === 'd' && parts[1]) return { screen: 'docs', team: parts[1] };
  if (parts[0] === 's' && parts[1] && parts[2]) return { screen: 'terminal', team: parts[1], session: parts[2] };
  return { screen: 'teams' };
};
const teamHash = (team) => '#/t/' + encodeURIComponent(team);
const docsHash = (team) => '#/d/' + encodeURIComponent(team);
const sessionHash = (team, session) => '#/s/' + encodeURIComponent(team) + '/' + encodeURIComponent(session);

export async function buildPhone() {
  const root = document.getElementById('phone');
  if (!root) throw new Error('the mobile document has no #phone');
  const bar = root.querySelector('.ph-bar');
  const main = root.querySelector('.ph-main');
  // The mark is in the document's own markup; tapping it is the way to the Teams list.
  const brand = bar.querySelector('.brand');
  const feedbackAction = WorkspaceKit.primitives.createAction({ label: t('feedback.button', 'Feedback'), size: 'compact', className: 'fb-bar-action' });
  feedbackAction.el.addEventListener('click', () => { location.hash = '#/feedback'; });
  const barContent = (...items) => [...items, feedbackAction.el];
  const feedback = createFeedbackSurface(() => { location.hash = '#/'; });

  const backLink = (href) => {
    const back = el('a', 'ph-back', '‹');
    back.href = href;
    back.title = t('phone.back', 'Back');
    return back;
  };
  const teamsBar = () => bar.replaceChildren(...barContent(brand, el('span', 'ph-title', t('phone.coworks', 'Teams'))));
  const teamBar = (team) => bar.replaceChildren(...barContent(
    backLink('#/'),
    el('span', 'ph-title', teamLabel({ ...teamByName(team), name: team })),
  ));
  // The document painted a bar for this address before any script ran (mobile.html);
  // the script's first act is to paint the same bar with its live pieces, so a stalled
  // server never shows a bare strip and nothing changes shape when the readings land.
  let route = routeFromHash();
  if (route.screen === 'teams') teamsBar();
  else if (route.screen === 'feedback') bar.replaceChildren(...barContent(backLink('#/'), el('span', 'ph-title', t('feedback.title', 'Feedback'))));
  else if (route.screen === 'terminal') bar.replaceChildren(...barContent(backLink(teamHash(route.team)), el('span', 'ph-title', readable(route.session))));
  else bar.replaceChildren(...barContent(backLink('#/'), el('span', 'ph-title', '')));

  let agentsPainted = ''; // what the Agents screen last drew — identical readings skip the repaint
  let host = null; // the one terminal host, alive only on the terminal screen
  let stageTile = null; // the mounted tile inside it — for the slow work-record clock
  let sheet = null; // its メ sheet — dies with the host
  let docsView = null; // the Docs screen's editor — asked before it is left, in case of unsaved typing

  /* ---------- screen 1 · the Teams ---------- */
  const paintTeams = () => {
    teamsBar();
    const list = el('div', 'ph-list');
    const teams = teamsFromState().filter((team) => !team.holding || unassignedSessions().length);
    for (const team of teams) {
      const card = el('a', 'ph-card');
      card.href = teamHash(team.name);
      const line = el('div', 'ph-card-line');
      line.append(el('span', 'ph-card-name', teamLabel(team)));
      card.append(line);
      list.append(card);
    }
    if (!teams.length) list.append(el('div', 'ph-empty', t('phone.no_coworks', 'No Teams yet.')));
    main.replaceChildren(list);
  };

  /* ---------- screen 2 · one Team: Agents | Docs ---------- */
  const segment = (team, which) => {
    const seg = el('nav', 'ph-seg');
    for (const [id, label, href] of [
      ['agents', t('phone.agents', 'Agents'), teamHash(team)],
      ['docs', t('phone.docs', 'Docs'), docsHash(team)],
    ]) {
      const item = el('a', 'ph-seg-item', label);
      item.href = href;
      if (id === which) item.setAttribute('aria-current', 'page');
      seg.append(item);
    }
    return seg;
  };

  const launchCard = (team) => {
    const card = el('div', 'ph-launch');
    const open = el('button', 'ph-launch-open', '＋ ' + t('phone.launch_card', 'Launch New Agent'));
    open.type = 'button';
    const form = el('div', 'ph-launch-form');
    form.hidden = true;
    const name = el('input');
    name.type = 'text';
    name.autocapitalize = 'off';
    name.autocomplete = 'off';
    name.spellcheck = false;
    name.maxLength = 40;
    name.placeholder = t('add_agent.name_placeholder', 'name');
    // Character-for-character, the server's own transform (sanitizeName, src/spawn.ts),
    // so the caret never jumps — the same rule Add Agent applies.
    name.addEventListener('input', () => {
      const clean = name.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      if (clean !== name.value) {
        const at = name.selectionStart;
        name.value = clean;
        name.setSelectionRange(at, at);
      }
    });
    const words = el('textarea');
    words.rows = 3;
    words.autocapitalize = 'off';
    words.spellcheck = false;
    words.placeholder = t('add_agent.instruction_placeholder', 'what this Agent should do');
    const note = el('p', 'ph-launch-note', t('phone.launch_defaults', "Everything else launches with this Team's defaults."));
    const state = el('p', 'ph-launch-state');
    state.hidden = true;
    const go = el('button', 'ph-launch-go', t('forms.launch', 'Launch'));
    go.dataset.launch = 'true';
    const launchMark = el('img', 'wk-launch-mark');
    launchMark.src = 'brand/nin-mark.svg';
    launchMark.alt = '';
    go.prepend(launchMark);
    go.type = 'button';
    let busy = false;
    go.addEventListener('click', async () => {
      if (busy || !name.value.trim()) return;
      busy = true;
      go.disabled = true;
      state.hidden = false;
      state.dataset.kind = 'info';
      state.textContent = t('add_agent.starting', 'Starting…');
      const roster = teamByName(team);
      const result = await request('/api/launch', {
        method: 'POST',
        json: {
          session_type: 'cowork_agent',
          behaviours: [],
          team: team === UNASSIGNED ? '' : team,
          instructions: words.value.trim(),
          name: name.value.trim(),
          project_root: (roster?.durable && roster.project_root) || projectData?.[0]?.name || '',
          provider: '', // blank = the install default, exactly as Add Agent sends it
          model: '',
        },
      });
      busy = false;
      go.disabled = false;
      if (!result.ok) {
        state.dataset.kind = 'failed';
        state.textContent = result.message;
        return;
      }
      const born = result.data?.name || name.value.trim();
      await fetchSessions();
      // The Agent opens where it was born: its own tile, in this document.
      location.hash = sessionHash(team, born);
    });
    open.addEventListener('click', () => {
      form.hidden = !form.hidden;
      if (!form.hidden) name.focus();
    });
    form.append(name, words, note, go, state);
    card.append(open, form);
    return card;
  };

  const paintAgents = () => {
    const team = route.team;
    // Never repaint over an open launch form — a feed event would wipe a name mid-typing.
    if (main.querySelector('.ph-launch-form:not([hidden])')) return;
    // And never repaint what has not moved: rebuilding identical cards detaches the node
    // under a finger mid-tap — a tap that does nothing.
    const signature = [team, teamLabel({ ...teamByName(team), name: team })].concat(membersOfTeam(team).map((member) => [member.name, member.title, member.team_lead].join('|'))).join('\n');
    if (signature === agentsPainted) return;
    agentsPainted = signature;
    teamBar(team);
    const list = el('div', 'ph-list');
    for (const member of membersOfTeam(team)) {
      const card = el('a', 'ph-card');
      card.href = sessionHash(team, member.name);
      const line = el('div', 'ph-card-line');
      line.append(el('span', 'ph-card-name', (member.team_lead ? '人 ' : '') + agentLabel(member)));
      card.append(line);
      list.append(card);
    }
    if (!list.children.length) list.append(el('div', 'ph-empty', t('phone.no_agents', 'No Agents on this Team yet.')));
    list.append(launchCard(team));
    main.replaceChildren(segment(team, 'agents'), list);
  };

  /**
   * The Team's documents — the same shelf the desktop commons shows (Tracked · Plans ·
   * Docs), built by docs.js for this Team's members and repos. A tapped document opens in
   * the same pane, full width; ← in the pane returns to the list, ‹ in the bar leaves.
   */
  const paintDocs = () => {
    const team = route.team;
    teamBar(team);
    const pane = el('div', 'home-docs ph-docs');
    const docs = buildDocs(null, pane, () => pane.isConnected,
      (name) => membersOfTeam(team).some((member) => member.name === name),
      () => teamByName(team)?.repos || []);
    docsView = docs;
    main.replaceChildren(segment(team, 'docs'), pane);
    void refreshHome().then(() => { if (pane.isConnected) docs.enter(); });
  };
  const leaveDocs = () => {
    if (!docsView) return true;
    const left = docsView.leave(); // false while unsaved typing stands and the owner keeps it
    if (left) docsView = null;
    return left;
  };

  /* ---------- screen 3 · the Agent ---------- */
  const openTerminal = () => {
    const { team, session } = route;
    closeTerminal();
    host = createTerminalTileHost({ mode: 'reduced' });
    const term = el('div', 'ph-term');
    term.append(host.el);
    main.replaceChildren(term);
    const tile = host.mount(session);
    stageTile = tile;

    sheet = makeDrop('メ', t('phone.me_title', 'This Agent — work record, docs, macros, note, control, kill'), 'me');
    const node = (key) => tile[key]?.el ?? tile[key];
    sheet.addRow(node('workRecordBtn'), t('me.ladder', 'Work record'));
    sheet.addRow(node('docsBtn'), t('me.docs', 'Docs'));
    sheet.addRow(node('tmacBtn'), t('me.macros', 'Macros'));
    // No Services, no choice: the Output row only exists where an unlocked view does.
    if (!tile.servicesOff()) sheet.addRow(node('outputEl'), t('me.output', 'Output'), 'stay');
    sheet.addRow(node('noteBtn'), t('me.note', 'Note'));
    sheet.addRow(node('dial'), t('me.control', 'Control'), 'stay');
    sheet.addRow(node('killBtn'), t('me.kill', 'Kill session'));

    // The 📄 and ⚡ menus hang off the hidden tile head; here they hang off the bar.
    bar.replaceChildren(...barContent(
      backLink(teamHash(team)),
      el('span', 'ph-title', agentLabel(S.sessions.find((row) => row.name === session) || { name: session })),
      sheet.btn,
      sheet.menu,
      tile.docsBtn.menu,
      tile.tmacBtn.menu,
    ));
  };
  const closeTerminal = () => {
    sheet?.close();
    sheet = null;
    host?.destroy();
    host?.el.remove();
    host = null;
    stageTile = null;
  };

  const paintFeedback = () => {
    bar.replaceChildren(...barContent(backLink('#/'), el('span', 'ph-title', t('feedback.title', 'Feedback'))));
    main.replaceChildren(feedback.el);
    feedback.show?.();
  };

  /* ---------- the router ---------- */
  const render = () => {
    const next = routeFromHash();
    const staysOnDocs = next.screen === 'docs' && next.team === route.team;
    if (route.screen === 'docs' && !staysOnDocs && !leaveDocs()) {
      location.hash = docsHash(route.team); // the owner kept unsaved typing; stay
      return;
    }
    if (route.screen === 'terminal' && !(next.screen === 'terminal' && next.session === route.session)) closeTerminal();
    // A screen change always paints fresh; the skip-signature only spans one stay.
    if (next.screen !== route.screen || next.team !== route.team) agentsPainted = '';
    route = next;
    if (route.screen === 'teams') paintTeams();
    else if (route.screen === 'agents') paintAgents();
    else if (route.screen === 'docs') { if (docsView) teamBar(route.team); else paintDocs(); } // a title that arrives late still lands
    else if (route.screen === 'feedback') paintFeedback();
    else if (!host) openTerminal();
  };
  window.addEventListener('hashchange', () => guard('phone route', render));

  /* ---------- the feeds ---------- */
  // Membership and the lists are live off the same feed the workbench uses. A killed
  // or vanished session on stage sends you back to its team — a dead tile is not a page.
  sessionsHandlers.add(() => {
    if (route.screen === 'terminal') {
      const row = S.sessions.find((r) => r.name === route.session);
      if (!row) { location.hash = teamHash(route.team); return; }
      // The tile opened on the name alone; the Agent's own title lands with the list.
      const title = bar.querySelector('.ph-title');
      if (title && title.textContent !== agentLabel(row)) title.textContent = agentLabel(row);
      return;
    }
    render();
  });
  subscribe(() => { if (route.screen !== 'terminal') render(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void fetchSessions();
    void refreshTeams();
  });
  // The tile refreshes its own work record on connect; keep it breathing here, since the
  // desktop's 30s clock (layout.js) never runs in this document.
  window.setInterval(() => { if (route.screen === 'terminal' && stageTile) stageTile.refreshTegami(); }, 30000);

  // Ask the operator which optional surfaces are plugged in BEFORE a tile is born, the
  // way main.js does: `stream:false` means the 🔓 views are off and every tile is 🔒.
  {
    const v = await request('/api/version');
    if (v.ok && v.data.stream === false) {
      S.streamOff = true;
      S.locked = true;
      S.output = 'locked';
    }
    if (v.ok && Array.isArray(v.data.services)) S.services = v.data.services;
  }
  // A tile address mounts its tile now: the terminal attaches by name and needs no list.
  if (route.screen === 'terminal') guard('phone paint', render);
  await fetchSessions();
  guard('session event stream', connectEvents);
  await refreshTeams();
  guard('load projects', loadProjects); // the launch card's project_root fallback
  guard('load macros', loadMacros); // the メ sheet's Macros row reads the same catalog the desktop ⚡ does
  guard('phone paint', render);
}

// The document's one script. A failure here must be on screen, not silent (errors.js).
buildPhone().catch((e) => showFailure('mobile boot', e));
