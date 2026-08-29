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
