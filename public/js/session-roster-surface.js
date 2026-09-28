/* The roster: every Team and every Agent on the machine as one plain list, a Team per
 * heading. Drag an Agent's row onto another Team to move it there; drag it onto a
 * workspace to open it. Restored from the list the Teams surface was before the Phalanx
 * port (b2d47e6d); its rows and headings keep the house roster classes in style.css. */
import { membersOfTeam, moveTeamMembership, subscribe, teamsFromState, UNASSIGNED } from './team-controller.js';
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { orderCoworkTeams } from './cowork-workbench-contract.js';
import { RONIN_HELPERS } from './roster-groups.js';
import { agentTitle } from './team-members.js';
import { SESSION_DRAG } from './team-drag.js';
import { stanceLabel } from './home.js';
import { clampTip } from './shingo.js';
import { subscribe as subscribeStore } from './store.js';

const MOVE_DRAG = 'application/x-ronin-roster-move';
const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const roleOf = (session) => String(session.identity?.cli || session.agent || session.session_type || '')
  .split(/[_-]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');

export function createSessionRosterSurface({ open } = {}) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('roster.title', 'Roster'), className: 'session-roster-surface' });
  const list = node('div', 'home-list session-roster-list');
  surface.content.append(list);
  let readings = new Map();

  const rowFor = (session, team) => {
    const reading = readings.get(session.name) || {};
    const row = node('button', 'home-row');
    row.type = 'button';
    row.dataset.session = session.name;
    row.draggable = true;
    row.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(MOVE_DRAG, JSON.stringify({ name: session.name, from: team }));
      event.dataTransfer.setData(SESSION_DRAG, session.name);
      event.dataTransfer.setData('text/plain', session.name);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      for (const heading of list.querySelectorAll('.home-grp.drop-ready')) heading.classList.remove('drop-ready');
    });
    row.addEventListener('click', () => open?.(session.name));
    const lead = node('span', `home-job ${session.team_lead ? 'lead' : 'off'}`, session.team_lead ? '人' : '');
    if (session.team_lead) lead.title = t('league.team_lead', 'Team Lead');
    const name = node('b');
    const live = node('i', 'home-live');
    live.dataset.stance = reading.stance || 'unknown';
    live.title = stanceLabel(reading.stance) || '';
    live.setAttribute('aria-hidden', 'true');
    name.append(live, document.createTextNode(agentTitle(session)));
    name.title = session.name;
    row.append(lead, name);
    const chip = reading.tegami?.ladder?.length ? reading.tegami.chip : null;
    if (chip) {
      const step = node('span', `home-shingo${chip.gate ? ' gate' : ''}`, chip.text);
      step.title = reading.tegami.objective ? clampTip(reading.tegami.objective) : '';
      row.append(step);
    }
    const role = roleOf(session);
    if (role) row.append(node('span', 'home-role', role));
    if (reading.ctx != null) row.append(node('span', 'home-ctx', `⛽ ${reading.ctx}%`));
    const model = String(reading.model || '').toLowerCase();
    if (model) { const stack = node('span', 'home-stack', model); stack.title = model; row.append(stack); }
    return row;
  };

  const groupFor = (team) => {
    const members = membersOfTeam(team.name);
    const block = node('div', 'home-group');
    block.dataset.team = team.name;
    const heading = node('div', 'home-grp');
    const label = String(team.title ?? '').trim() || team.name;
    heading.append(node('b', null, label), node('span', null, String(members.length)));
    heading.title = t('roster.drop_here', 'Drop a session here to add it to {team}', { team: label });
    block.append(heading, ...members.map((member) => rowFor(member, team.name)));
    block.addEventListener('dragover', (event) => {
      if (!event.dataTransfer.types.includes(MOVE_DRAG)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      heading.classList.add('drop-ready');
    });
    block.addEventListener('dragleave', (event) => { if (!block.contains(event.relatedTarget)) heading.classList.remove('drop-ready'); });
    block.addEventListener('drop', async (event) => {
      const raw = event.dataTransfer.getData(MOVE_DRAG);
      if (!raw) return;
      event.preventDefault();
      heading.classList.remove('drop-ready');
      const { name, from } = JSON.parse(raw);
      if (from === team.name) return;
      const result = await moveTeamMembership(name, from === UNASSIGNED ? '' : from, team.name === UNASSIGNED ? '' : team.name);
      surface.setState(result.ok ? null : 'failed', result.ok ? '' : t('roster.not_saved', 'not saved — {message}', { message: result.message }));
    });
    return block;
  };

  const render = () => {
    const teams = orderCoworkTeams(teamsFromState(), {
      helperName: RONIN_HELPERS,
      noTeam: { name: UNASSIGNED, title: t('league.ronin', 'Ronin: no team'), objective: '' },
    });
    list.replaceChildren(...teams.map(groupFor));
  };
  // A row dropped anywhere on the roster stays with the roster: only a Team heading's block
  // takes it, and the workspace under the roster never swaps the list for a terminal.
  for (const type of ['dragover', 'drop']) surface.el.addEventListener(type, (event) => {
    if (event.dataTransfer?.types.includes(MOVE_DRAG)) event.stopPropagation();
  });
  const stopTeams = subscribe(render);
  const stopReadings = subscribeStore('home', (rows) => { readings = new Map((rows || []).map((row) => [row.name, row])); render(); });
  return {
    el: surface.el,
    render,
    destroy: () => { stopTeams?.(); stopReadings?.(); surface.el.remove(); },
  };
}
