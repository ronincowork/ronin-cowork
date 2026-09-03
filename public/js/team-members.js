/* part of the ronin-cowork client — see js/README.md */
/** The Team member list — identity rows, the lead/rename/remove actions, the add-select —
 *  shared by the Team commons configuration tab and the league team surfaces. */
import { WorkspaceKit } from './workspace-kit.js';
import { membersOfTeam, refreshTeams, sessionsAvailableToTeam, setTeamLead, setTeamMembership, teamByName } from './team-controller.js';
import { setSessionTitle } from './api.js';
import { t } from './lexicon.js';

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };

export const agentTitle = (session) => session.title || String(session.name || '').split(/[_-]+/).filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

// "flashing the team configuration on and off"). Every five-second row read and every
// refreshTeams() publish land in the panel renderers; redrawing unconditionally flashed
// the form's loading line, refetched three catalogs, and wiped a half-typed edit. The
// renderers compare this string — the durable roster, each member line, the add-select's
// candidates — and tear the panel down only when it moves.
export const configSignature = (name) => {
  const roster = teamByName(name);
  const line = (s) => [s.name, !!s.team_lead, agentTitle(s), s.session_role || ''];
  return JSON.stringify([roster.durable ? roster : null, membersOfTeam(name).map(line), sessionsAvailableToTeam(name).map(line)]);
};

export const buildTeamMembers = (name, options = {}) => {
  const { createAction, createActionBar } = WorkspaceKit.primitives;
  const holding = !!options.holding;
  const roster = el('section', 'league-team-roster');
  roster.append(el('h3', 'league-team-roster-title', holding ? t('league.agents', 'Agents') : t('league.members', 'Team members')));
  const list = el('div', 'league-team-member-list'), members = membersOfTeam(name);
  if (!members.length) list.append(el('p', 'league-team-empty', holding ? t('league.no_ronin', 'No Rōnin Agents') : t('league.no_members', 'No Agents assigned yet.')));
  for (const member of members) {
    const row = el('article', 'league-team-member');
    const identity = el('div', 'league-team-member-identity');
    const mark = el('span', 'league-team-member-mark', member.team_lead ? '人' : ''); mark.setAttribute('aria-hidden', 'true');
    const words = el('div', 'league-team-member-words');
    words.append(el('strong', null, agentTitle(member)), el('span', null, member.session_role || t('league.role_unset', 'Role not set')));
    identity.append(mark, words);
    if (holding) { row.append(identity); list.append(row); continue; }
    const rename = createAction({ label: t('league.rename_agent', 'Rename'), size: 'compact', action: async () => {
      const currentTitle = agentTitle(member);
      const wanted = window.prompt(t('league.rename_agent_prompt', 'Edit Agent title'), currentTitle);
      if (wanted == null || wanted.trim() === currentTitle) return;
      try { await setSessionTitle(member.name, wanted.trim()); await refreshTeams(); options.onChanged?.(); }
      catch (error) { options.onFailed?.(t('head.rename_failed', 'Could not rename session: {reason}', { reason: error.message })); }
    } });
    const lead = createAction({ label: member.team_lead ? t('league.team_lead', 'Team Lead') : t('league.make_team_lead', 'Make Lead'), size: 'compact', selected: member.team_lead, action: async () => { const result = await setTeamLead(member.name, name, !member.team_lead); if (!result.ok) return options.onFailed?.(result.message); options.onChanged?.(); } });
    const eject = createAction({ label: t('league.remove_member', 'Remove'), title: t('league.remove_named_member', 'Remove {name} from this team', { name: member.name }), size: 'compact', action: async () => { const result = await setTeamMembership(member.name, name, false); if (!result.ok) return options.onFailed?.(result.message); options.onChanged?.(); } });
    row.append(identity, createActionBar({ className: 'league-team-member-actions', actions: [rename, lead, eject] }).el); list.append(row);
  }
  roster.append(list);
  if (holding) return roster;
  const available = sessionsAvailableToTeam(name), add = el('div', 'league-team-add');
  const select = el('select', null); select.setAttribute('aria-label', t('league.choose_member', 'Choose an Agent to add'));
  select.append(new Option(available.length ? t('league.choose_member', 'Choose an Agent to add') : t('league.no_available_members', 'No other Agents available'), ''));
  for (const session of available) select.append(new Option(agentTitle(session) + (session.session_role ? ` — ${session.session_role}` : ''), session.name));
  const assign = createAction({ label: t('league.assign_member', 'Assign'), size: 'compact', disabled: true, action: async () => { if (!select.value) return; const result = await setTeamMembership(select.value, name, true); if (!result.ok) return options.onFailed?.(result.message); options.onChanged?.(); } });
  select.addEventListener('change', () => assign.setDisabled(!select.value));
  add.append(select, assign.el); roster.append(add);
  return roster;
};
