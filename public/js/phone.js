/* part of the ronin-cowork client — see js/README.md */
/**
 * THE PHONE SHELL — the coworkspace's front door on an iPhone-class screen.
 *
 * A phone never boots the workbench. The workbench is a drag-and-drop instrument
 * built for a wide pointer surface; squeezed through one breakpoint it became a
 * scroll-snapped stack of 80vh panels with the discovery column sandwiched between
 * two terminals, under a header carrying twelve desktop controls (the owner:
 * "clouded"). This shell replaces all of it with the three steps the owner asked
 * for (MOBILE plan, 2026-09-01):
 *
 *   1 · pick the Cowork      one column of team cards
 *   2 · pick the Agent       the team's members, with their live readings
 *   3 · drive it             full-bleed tile, composer + keys row docked at the bottom
 *
 * Hash-routed (#/m · #/m/t/<team> · #/m/s/<team>/<session>) so Safari's back button
 * and a PWA re-open both work. Everything underneath is REUSED, never rebuilt: the
 * Tile and its composer, the team controller's projections, the /events feed, the
 * lexicon. Desktop and iPad never load this path — main.js branches on IS_PHONE
 * before the workbench is created, and nothing here touches the desktop page.
 */
import { fetchSessions } from './api.js';
import { request } from './request.js';
import { guard } from './errors.js';
import { connectEvents, sessionsHandlers } from './events.js';
import { membersOfTeam, refreshTeams, subscribe, teamByName, teamsFromState, UNASSIGNED, unassignedSessions } from './team-controller.js';
import { loadProjects, projectData, statusLabel } from './home.js';
import { createTerminalTileHost } from './terminal-tile-host.js';
import { makeDrop } from './tiledrop.js';
import { S } from './state.js';
import { t } from './lexicon.js';

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
  return team.title || readable(team.name);
}
function agentLabel(session) {
  return session.title || readable(session.name);
}

/** #/m · #/m/t/<team> · #/m/s/<team>/<session> — anything else is the front door. */
const routeFromHash = () => {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (parts[0] !== 'm') return { screen: 'teams' };
  if (parts[1] === 't' && parts[2]) return { screen: 'agents', team: parts[2] };
  if (parts[1] === 's' && parts[2] && parts[3]) return { screen: 'terminal', team: parts[2], session: parts[3] };
  return { screen: 'teams' };
};
const teamHash = (team) => '#/m/t/' + encodeURIComponent(team);
const sessionHash = (team, session) => '#/m/s/' + encodeURIComponent(team) + '/' + encodeURIComponent(session);

export async function buildPhone() {
  document.body.dataset.phone = '1';
  const root = el('div', null);
  root.id = 'phone';
  const bar = el('header', 'ph-bar');
  const main = el('main', 'ph-main');
  root.append(bar, main);
  document.body.append(root);

  // The house mark rides the shell's own bar on the front door (owner, 2026-09-01:
  // "we should see the top header, the RoninCowork and the Torii"). RELOCATED from the
  // hidden desktop bar, not cloned — captured once, because a later paint detaches it
  // and getElementById would then find nothing. Tapping it is the way home (href="./").
  const brand = document.getElementById('brandbtn');

  let route = routeFromHash();
  let rows = new Map(); // session name -> /api/home row (status, ctx, model, tegami)
  let agentsPainted = ''; // what the Agents screen last drew — identical readings skip the repaint
  let host = null; // the one terminal host, alive only on the terminal screen
  let stageTile = null; // the mounted tile inside it — for the slow reading clock
  let sheet = null; // its メ sheet — dies with the host

  /* ---------- readings ---------- */
  const readRows = async () => {
    if (document.visibilityState !== 'visible') return;
    const r = await request('/api/home', { cache: 'no-store' });
    if (!r.ok || !Array.isArray(r.data)) return;
    rows = new Map(r.data.map((row) => [row.name, row]));
    if (route.screen === 'agents') paintAgents();
  };

  /* ---------- screen 1 · the Coworks ---------- */
  const paintTeams = () => {
    bar.replaceChildren(...(brand ? [brand] : []), el('span', 'ph-title', t('phone.coworks', 'Cowork: Teams')));
    const list = el('div', 'ph-list');
    const teams = teamsFromState().filter((team) => !team.holding || unassignedSessions().length);
    for (const team of teams) {
      const members = membersOfTeam(team.name);
      const card = el('a', 'ph-card');
      card.href = teamHash(team.name);
      const line = el('div', 'ph-card-line');
      line.append(el('span', 'ph-card-name', teamLabel(team)));
      line.append(el('span', 'ph-card-note', members.length === 1
        ? t('phone.agents_one', '1 Agent')
        : t('phone.agents_many', '{n} Agents', { n: members.length })));
      card.append(line);
      if (team.objective) card.append(el('div', 'ph-card-sub', team.objective));
      list.append(card);
    }
    if (!teams.length) list.append(el('div', 'ph-empty', t('phone.no_coworks', 'No Coworks yet.')));
    main.replaceChildren(list);
  };

  /* ---------- the launch card: a name, the words, and the Cowork's defaults ----------
     The owner's rule (2026-09-01): birthing from a phone needs a name and instructions,
     nothing else — no toolkit, no mandates, no routines. Everything unstated launches on
     the Team's own defaults, resolved server-side exactly as Add Agent's quick launch
     does (add-agent.js: "a caller that states one is guessing at the server's job"). */
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
    const note = el('p', 'ph-launch-note', t('phone.launch_defaults', "Everything else launches on this Cowork's defaults."));
    const state = el('p', 'ph-launch-state');
    state.hidden = true;
    const go = el('button', 'ph-launch-go', t('add_agent.start', 'Start'));
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
      // The Agent opens where it was born: this Cowork's stage.
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

  /* ---------- screen 2 · the Agents ---------- */
  const paintAgents = () => {
    const team = route.team;
    // Never repaint over an open launch form — the readings clock would wipe a name
    // mid-typing. The readings resume the moment the form closes or the route moves.
    if (main.querySelector('.ph-launch-form:not([hidden])')) return;
    // And never repaint what has not moved: the 5s clock rebuilding identical cards
    // detaches the node under a finger mid-tap — a tap that does nothing (caught by
    // the render gate racing the same window).
    const signature = team + '\0' + membersOfTeam(team).map((member) => {
      const row = rows.get(member.name) || {};
      return [member.name, member.title, member.team_lead, member.session_role, row.status, row.ctx, row.model, row.tegami?.chip?.text].join('|');
    }).join('\n');
    if (signature === agentsPainted) return;
    agentsPainted = signature;
    bar.replaceChildren(
      backLink('#/m'),
      el('span', 'ph-title', teamLabel({ ...teamByName(team), name: team })),
    );
    const list = el('div', 'ph-list');
    for (const member of membersOfTeam(team)) {
      const row = rows.get(member.name) || {};
      const card = el('a', 'ph-card');
      card.href = sessionHash(team, member.name);
      const line = el('div', 'ph-card-line');
      line.append(el('span', 'ph-card-name', (member.team_lead ? '人 ' : '') + agentLabel(member)));
      const state = [statusLabel(row.status), row.ctx != null ? `⛽ ${row.ctx}%` : ''].filter(Boolean).join(' · ');
      if (state) line.append(el('span', 'ph-card-note', state));
      card.append(line);
      const step = row.tegami?.chip?.text || '';
      const sub = [step, member.session_role, (row.model || '').toLowerCase()].filter(Boolean).join(' · ');
      if (sub) card.append(el('div', 'ph-card-sub', sub));
      list.append(card);
    }
    if (!list.children.length) list.append(el('div', 'ph-empty', t('phone.no_agents', 'No Agents on this Cowork yet.')));
    list.append(launchCard(team));
    main.replaceChildren(list);
  };

  /* ---------- screen 3 · the Agent ---------- */
  /**
   * The tile's own head is hidden (the host's reduced mode); this bar replaces it.
   * The sheet holds the head's OWN controls, RELOCATED not cloned — every handler
   * and live widget (gauge needle, dial pointer) keeps the owner it always had.
   * The whole host is built per open and destroyed on the way out: a phone shows
   * one Agent at a time, and one reattach per open is the price of never leaking
   * a transport.
   */
  const openTerminal = () => {
    const { team, session } = route;
    closeTerminal();
    host = createTerminalTileHost({ mode: 'reduced' });
    const term = el('div', 'ph-term');
    term.append(host.el);
    main.replaceChildren(term);
    const tile = host.mount(session);
    stageTile = tile;

    sheet = makeDrop('メ', t('phone.me_title', 'This Agent — status, work record, note, control, kill'), 'me');
    const node = (key) => tile[key]?.el ?? tile[key];
    // The status row is a reading, not a control; setFooter writes the word beside it.
    tile.dropStatus = sheet.addRow(node('gauge'), t('me.status', 'Status'), 'inert');
    tile.dropStatus.classList.add('tdrop-status');
    tile.setFooter(tile.ctxPct ?? null, tile.ctxModel || '');
    sheet.addRow(node('workRecordBtn'), t('me.ladder', 'Work record'));
    // No Services, no choice: the Output row only exists where an unlocked view does.
    if (!S.streamOff) sheet.addRow(node('outputEl'), t('me.output', 'Output'), 'stay');
    sheet.addRow(node('docsBtn'), t('me.docs', 'Docs'));
    sheet.addRow(node('noteBtn'), t('me.note', 'Note'));
    sheet.addRow(node('dial'), t('me.control', 'Control'), 'stay');
    sheet.addRow(node('killBtn'), t('me.kill', 'Kill session'));

    bar.replaceChildren(
      backLink(teamHash(team)),
      el('span', 'ph-title', agentLabel(S.sessions.find((row) => row.name === session) || { name: session })),
      sheet.btn,
      sheet.menu,
      tile.docsBtn.menu,
    );
  };
  const closeTerminal = () => {
    sheet?.close();
    sheet = null;
    host?.destroy();
    host?.el.remove();
    host = null;
    stageTile = null;
  };

  const backLink = (href) => {
    const back = el('a', 'ph-back', '‹');
    back.href = href;
    back.title = t('phone.back', 'Back');
    return back;
  };

  /* ---------- the router ---------- */
  const render = () => {
    const next = routeFromHash();
    if (route.screen === 'terminal' && !(next.screen === 'terminal' && next.session === route.session)) closeTerminal();
    // A screen change always paints fresh; the skip-signature only spans one stay.
    if (next.screen !== route.screen || next.team !== route.team) agentsPainted = '';
    route = next;
    if (route.screen === 'teams') paintTeams();
    else if (route.screen === 'agents') { paintAgents(); void readRows(); }
    else if (!host) openTerminal();
  };
  window.addEventListener('hashchange', () => guard('phone route', render));
  if (!location.hash.startsWith('#/m')) history.replaceState(null, '', '#/m');

  /* ---------- the feeds ---------- */
  // Membership and the lists are live off the same feed the workbench uses. A killed
  // or vanished session on stage sends you back to its team — a dead tile is not a page.
  sessionsHandlers.add(() => {
    if (route.screen === 'terminal' && !S.sessions.some((row) => row.name === route.session)) {
      location.hash = teamHash(route.team);
      return;
    }
    if (route.screen !== 'terminal') render();
  });
  subscribe(() => { if (route.screen !== 'terminal') render(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void fetchSessions();
    void refreshTeams();
  });
  window.setInterval(() => {
    if (route.screen === 'agents') void readRows();
    // The tile refreshes its own gauge and letter on connect; keep them breathing here,
    // since the desktop's 30s clock (layout.js) never runs on the phone.
    if (route.screen === 'terminal' && stageTile) { stageTile.refreshCtx(); stageTile.refreshTegami(); }
  }, 30000);
  window.setInterval(() => { if (route.screen === 'agents') void readRows(); }, 5000);

  await fetchSessions();
  guard('session event stream', connectEvents);
  await refreshTeams();
  guard('load projects', loadProjects); // the launch card's project_root fallback
  guard('phone paint', render);
  void readRows();
}
