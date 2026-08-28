import { humanAge } from './shingo.js';
import { statusLabel, taskIcon } from './home.js';
import { t } from './lexicon.js';

const node = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

export function renderLeagueView(host, teams, membersOf, rowOf, tokenOf, dragType) {
  host.replaceChildren();
  for (const team of teams) {
    const members = membersOf(team.name), group = node('section', 'league-roster-team');
    const head = node('header', 'league-roster-head');
    head.append(node('b', null, team.name), node('span', null, t('league.agents_count', '{n} Agents', { n: members.length })));
    if (team.objective) head.append(node('small', null, team.objective));
    group.append(head); group.draggable = true;
    group.addEventListener('dragstart', (event) => { event.dataTransfer.setData(dragType, tokenOf(team.name)); event.dataTransfer.effectAllowed = 'move'; });
    for (const member of members) {
      const reading = rowOf(member.name) || {}, row = node('div', 'league-agent-row');
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
