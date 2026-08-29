import { humanAge } from './shingo.js';
import { statusLabel, taskIcon } from './home.js';
import { t } from './lexicon.js';

const node = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };
const orders = new WeakMap(), wired = new WeakSet();
const AGENT_MIME = 'application/x-ronin-league-agent', SOURCE_MIME = 'application/x-ronin-league-source';

const rememberOrder = (host, changed) => { const order = [...host.querySelectorAll('.league-roster-team')].map((group) => group.dataset.team); orders.set(host, order); changed(order); };

export function renderLeagueView(host, teams, membersOf, rowOf, tokenOf, dragType, initialOrder = [], changed = () => {}, reassign = () => {}, launch = () => {}) {
  if (!orders.has(host)) orders.set(host, initialOrder);
  const remembered = orders.get(host) || [];
  teams = [...teams].sort((a, b) => {
    const ai = remembered.indexOf(a.name), bi = remembered.indexOf(b.name);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
  });
  host.replaceChildren();
  if (!wired.has(host)) {
    host.addEventListener('dragover', (event) => { if (![...event.dataTransfer.types].includes(dragType)) return; event.preventDefault(); event.stopPropagation(); });
    host.addEventListener('drop', (event) => { const token = event.dataTransfer.getData(dragType), dragged = [...host.children].find((group) => group.dataset.token === token); if (!dragged) return; event.preventDefault(); event.stopPropagation(); host.append(dragged); rememberOrder(host, changed); });
    wired.add(host);
  }
  for (const team of teams) {
    const members = membersOf(team.name), group = node('section', 'league-roster-team');
    group.dataset.team = team.name; group.dataset.token = tokenOf(team.name);
    const head = node('header', 'league-roster-head'), teamName = node('b', null, team.nullTeam ? t('league.ronin', 'Ronin: no team') : team.title || team.name), launchButton = node('button', null, t('league.launch_team', 'Launch'));
    launchButton.type = 'button'; launchButton.addEventListener('click', () => launch(team.name)); head.append(teamName, launchButton);
    if (team.objective) head.append(node('small', null, team.objective));
    group.append(head); teamName.draggable = true;
    teamName.addEventListener('dragstart', (event) => { event.dataTransfer.setData(dragType, tokenOf(team.name)); event.dataTransfer.effectAllowed = 'move'; });
    const assign = async (agent, source) => { const result = await reassign(agent, source, team.name); if (!result?.ok) group.append(node('p', 'league-roster-empty', result?.message || '')); };
    group.addEventListener('dragover', (event) => { if (![...event.dataTransfer.types].some((type) => type === dragType || type === AGENT_MIME)) return; event.preventDefault(); event.stopPropagation(); group.dataset.dropReady = 'true'; });
    group.addEventListener('dragleave', () => { delete group.dataset.dropReady; });
    group.addEventListener('drop', (event) => { const agent = event.dataTransfer.getData(AGENT_MIME), source = event.dataTransfer.getData(SOURCE_MIME); delete group.dataset.dropReady; event.preventDefault(); event.stopPropagation(); if (agent) { if (source !== team.name) void assign(agent, source); return; } const token = event.dataTransfer.getData(dragType), dragged = [...host.children].find((item) => item.dataset.token === token); if (!dragged || dragged === group) return; const box = group.getBoundingClientRect(), after = event.clientY > box.top + box.height / 2; host.insertBefore(dragged, after ? group.nextSibling : group); rememberOrder(host, changed); });
    for (const member of members) {
      const reading = rowOf(member.name) || {}, row = node('div', 'league-agent-row');
      row.draggable = true; row.addEventListener('dragstart', (event) => { event.stopPropagation(); event.dataTransfer.setData(AGENT_MIME, member.name); event.dataTransfer.setData(SOURCE_MIME, team.name); event.dataTransfer.effectAllowed = 'move'; });
      const role = node('span', 'league-agent-role', member.session_role || '');
      const icon = taskIcon(member); if (icon) role.prepend(node('i', null, icon));
      const shingo = reading.tegami?.chip?.text && reading.tegami?.ladder?.length
        ? reading.tegami.chip.text + (reading.tegami.quietMs >= 60000 ? ` · ${humanAge(reading.tegami.quietMs)}` : '') : '';
      row.append(node('b', null, member.name), role, node('span', 'league-agent-shingo', shingo),
        node('span', 'league-agent-status', statusLabel(reading.status) || reading.status || ''),
        node('span', 'league-agent-agent', member.agent || reading.agent || ''),
        node('span', 'league-agent-model', (reading.model || member.model || '').toLowerCase()),
        node('span', 'league-agent-ctx', reading.ctx == null ? '' : `⛽ ${reading.ctx}%`));
      group.append(row);
    }
    if (!members.length) group.append(node('p', 'league-roster-empty', t('league.no_agents', 'No live Agents')));
    host.append(group);
  }
}

/**
 * THE CAMPAIGN SELECTOR COLUMN — the Cowork space's own card list, in three groups.
 *
 * Lifted out of cowork-view.js when that module reached its 700-line ceiling. It is
 * rendering and nothing else: every decision it needs — what a card does, which token is
 * seated, how a team surface is made — arrives as a function, so this file knows about
 * workspaces, arrangement and seats exactly as much as it did before, which is nothing.
 */
export function renderCampaignSelector(host, opts) {
  const { groups, teams, unassigned, madeSurface, readableTeam, seated, put, dragType, t } = opts;
  host.replaceChildren();
  const group = (key, label) => {
    const section = node('details', 'tw-selector-group');
    section.open = !groups.closed.has(key);
    section.addEventListener('toggle', () => (section.open ? groups.closed.delete(key) : groups.closed.add(key)));
    section.append(node('summary', null, label), node('div', 'tw-selector-group-cards'));
    host.append(section);
    return section.lastElementChild;
  };
  const views = group('views', t('league.selector_views', 'Views'));
  const teamCards = group('coworks', t('campaign.coworks', 'Coworks'));
  const newCards = group('new', t('league.selector_new', 'New'));
  const add = (where, heading, token, summary = '', variant = null, draft = { surface: token }) => {
    const card = opts.createCard({ heading, summary, variant, selected: seated(token, draft), action: () => put(draft) });
    card.el.draggable = true;
    card.el.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData(dragType, token);
      event.dataTransfer.effectAllowed = 'move';
    });
    where.append(card.el);
  };
  add(views, t('campaign.cowork_view', 'Cowork View'), '@league-view');
  add(views, t('league.team_roster', 'Team roster'), '@team-roster');
  add(views, t('cowork.commons', 'Ronin Desk'), '@desk', '', null, { cowork: true, tab: 'health' });
  for (const item of teams) add(teamCards, item.title || readableTeam(item.name), madeSurface(item.name).token, item.objective || '');
  add(teamCards, t('league.ronin', 'Ronin: no team'), madeSurface(unassigned).token);
  add(newCards, t('new_team.title', 'New Team'), '@new-team', '', 'dotted');
  add(newCards, t('league.templates', 'Templates'), '@templates', '', 'dotted');
  add(newCards, t('league.new_agent', 'New Agent'), '@new', t('league.new_agent_summary', 'A new Agent, born into the workspace you are in.'), 'dotted');
}

/**
 * ONE COWORK'S CARD-SIZED SURFACE — its readings, Launch, and Delete.
 *
 * Lifted out of cowork-view.js with the selector, for the same reason. It caches per
 * Cowork because a surface that is seated must survive a repaint; `forget` drops one when
 * its roster is deleted so a stale element cannot be seated again.
 */
export function createLeagueTeamSurfaces(deps) {
  const { kit, t, unassigned, readableTeam, teamByName, membersOfTeam, deleteTeamRoster, register, onDeleted, openTeam } = deps;
  const made = new Map();
  const build = (name) => {
    if (made.has(name)) return made.get(name);
    const label = name === unassigned ? t('league.ronin', 'Ronin: no team') : readableTeam(name);
    const surface = kit.createSurface({ label, className: 'league-team-edit' });
    const team = teamByName(name);
    const token = '@team:' + name;
    const launch = node('button', null, t('league.launch_team', 'Launch'));
    launch.type = 'button';
    launch.addEventListener('click', () => openTeam(name));
    const remove = node('button', null, t('league.delete_team', 'Delete'));
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      const count = membersOfTeam(name).length;
      if (!window.confirm(t('league.delete_team_confirm', 'Delete {team}? {count} Agents will lose this Team membership.', { team: name, count }))) return;
      const result = await deleteTeamRoster(name);
      if (!result.ok) return surface.setState('failed', result.message);
      made.delete(name);
      onDeleted(token);
    });
    surface.el.prepend(kit.createSurfaceHeader({ label, actions: name === unassigned ? [launch] : [launch, remove] }).el);
    surface.content.append(kit.createMetadata({ rows: [
      [t('team.team_role', 'Team role'), team.team_role], [t('team.objective', 'Objective'), team.objective],
      [t('league.agents', 'Agents'), String(membersOfTeam(name).length)], [t('team.project_root', 'Project root'), team.project_root],
    ] }).el);
    register(token, surface.el);
    const out = { token, surface };
    made.set(name, out);
    return out;
  };
  return build;
}
