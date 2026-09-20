/* part of the ronin-cowork client — see js/README.md */
/** The Team member list — identity rows, optional open/close acts, membership acts and
 *  the add-select — shared by the Commons roster and the league team surfaces. */
import { WorkspaceKit } from './workspace-kit.js';
import { membersOfTeam, refreshTeams, sessionsAvailableToTeam, setTeamLead, setTeamMembership, teamByName } from './team-controller.js';
import { setSessionTitle } from './api.js';
import { t } from './lexicon.js';

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };

export const agentTitle = (session) => session.title || String(session.name || '').split(/[_-]+/).filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
const agentName = (session) => String(session.identity?.cli || session.agent || session.session_type || 'Agent')
  .split(/[_-]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

// "flashing the team configuration on and off"). Every five-second row read and every
// refreshTeams() publish land in the panel renderers; redrawing unconditionally flashed
// the form's loading line, refetched three catalogs, and wiped a half-typed edit. The
// renderers compare this string — the durable roster, each member line, the add-select's
// candidates — and tear the panel down only when it moves.
export const configSignature = (name) => {
  const roster = teamByName(name);
  const line = (s) => [s.name, !!s.team_lead, agentTitle(s), s.session_type || ''];
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
    words.append(
      el('strong', null, t('league.agent_title_fact', 'Title · {title}', { title: agentTitle(member) })),
      el('span', null, t('league.agent_name_fact', 'Agent · {name}', { name: agentName(member) })),
      el('span', 'league-team-member-id', t('league.agent_id_fact', 'ID · @{id}', { id: member.name })),
    );
    identity.append(mark, words);
    if (holding) { row.append(identity); list.append(row); continue; }
    const launch = options.onOpen ? createAction({ label: t('league.launch_agent', 'Launch'), size: 'compact', action: () => options.onOpen(member) }) : null;
    const rename = createAction({ label: t('league.rename_agent', 'Rename'), size: 'compact', action: async () => {
      const currentTitle = agentTitle(member);
      const wanted = window.prompt(t('league.rename_agent_prompt', 'Edit Agent title'), currentTitle);
      if (wanted == null || wanted.trim() === currentTitle) return;
      try { await setSessionTitle(member.name, wanted.trim()); await refreshTeams(); options.onChanged?.(); }
      catch (error) { options.onFailed?.(t('head.rename_failed', 'Could not rename session: {reason}', { reason: error.message })); }
    } });
    const lead = createAction({ label: member.team_lead ? t('league.team_lead', 'Team Lead') : t('league.make_team_lead', 'Make Lead'), size: 'compact', selected: member.team_lead, action: async () => { const result = await setTeamLead(member.name, name, !member.team_lead); if (!result.ok) return options.onFailed?.(result.message); options.onChanged?.(); } });
    const eject = createAction({ label: t('league.remove_member', 'Remove'), title: t('league.remove_named_member', 'Remove {name} from this team', { name: member.name }), size: 'compact', action: async () => { const result = await setTeamMembership(member.name, name, false); if (!result.ok) return options.onFailed?.(result.message); options.onChanged?.(); } });
    const close = options.onClose ? createAction({ label: t('league.close_agent', 'Close'), title: t('league.close_named_agent', 'Close {name}', { name: member.name }), size: 'compact', action: () => options.onClose(member) }) : null;
    const reading = options.reading?.(member);
    if (!reading) {
      row.append(identity, createActionBar({ className: 'league-team-member-actions', actions: [launch, rename, lead, eject, close] }).el);
      list.append(row);
      continue;
    }
    row.classList.add('league-team-member-live');
    const toggle = el('button', 'league-team-member-toggle'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', t('league.expand_agent', 'Expand {name}', { name: agentTitle(member) }));
    const status = el('div', 'league-team-member-reading');
    for (const [className, value] of [
      ['league-team-member-step', reading.step],
      ['league-team-member-state', reading.status],
      ['league-team-member-ctx', reading.ctx],
      ['league-team-member-model', reading.model],
    ]) if (value) status.append(el('span', className, value));
    const disclosure = el('span', 'league-team-member-disclosure', '⌄'); disclosure.setAttribute('aria-hidden', 'true');
    toggle.append(identity, status, disclosure);
    const detail = el('div', 'league-team-member-detail'); detail.hidden = true;
    detail.id = `team-member-${options.idPrefix || name}-${member.name}-actions`;
    toggle.setAttribute('aria-controls', detail.id);
    if (reading.description) detail.append(el('p', 'league-team-member-description', reading.description));
    detail.append(createActionBar({ className: 'league-team-member-actions', actions: [launch, rename, lead, eject, close] }).el);
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', t(expanded ? 'league.collapse_agent' : 'league.expand_agent', expanded ? 'Collapse {name}' : 'Expand {name}', { name: agentTitle(member) }));
      disclosure.textContent = expanded ? '⌃' : '⌄';
      detail.hidden = !expanded;
    });
    const main = el('div', 'league-team-member-main'); main.append(toggle);
    row.append(main, detail); list.append(row);
  }
  roster.append(list);
  if (holding) return roster;
  const available = sessionsAvailableToTeam(name), add = el('div', 'league-team-add');
  const select = el('select', null); select.setAttribute('aria-label', t('league.choose_member', 'Choose an Agent to add'));
  select.append(new Option(available.length ? t('league.choose_member', 'Choose an Agent to add') : t('league.no_available_members', 'No other Agents available'), ''));
  for (const session of available) select.append(new Option(agentTitle(session), session.name));
  const assign = createAction({ label: t('league.assign_member', 'Assign'), size: 'compact', disabled: true, action: async () => { if (!select.value) return; const result = await setTeamMembership(select.value, name, true); if (!result.ok) return options.onFailed?.(result.message); options.onChanged?.(); } });
  select.addEventListener('change', () => assign.setDisabled(!select.value));
  add.append(select, assign.el); roster.append(add);
  return roster;
};
