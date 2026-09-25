/* part of the ronin-cowork client — see js/README.md */
/** The Team member list — identity rows, optional open/close acts, membership acts and
 *  the add-select — shared by the Commons roster and the league team surfaces. */
import { WorkspaceKit } from './workspace-kit.js';
import { ask } from './ask.js';
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
  const members = membersOfTeam(name);
  let density = 'compact', selected = options.selected || '';
  const heading = el('div', 'league-team-roster-heading');
  heading.append(el('h3', 'league-team-roster-title', holding ? t('league.agents', 'Agents') : t('league.people', 'People')));
  const tools = el('div', 'league-team-people-tools');
  const densityButton = createAction({ label: '', size: 'compact', className: 'tw-agent-density league-team-density' });
  const densityLines = el('span', 'tw-agent-density-lines'); densityLines.append(el('i'), el('i')); densityButton.el.replaceChildren(densityLines);
  tools.append(densityButton.el); tools.hidden = holding; heading.append(tools); roster.append(heading);
  const content = el('div', 'league-team-people-content'); roster.append(content);

  const select = (member) => {
    selected = member.name;
    for (const row of content.querySelectorAll('.league-team-member')) row.dataset.selected = String(row.dataset.session === selected);
    options.onSelect?.(member);
  };
  const memberRow = (member) => {
    const row = el('article', 'league-team-member');
    row.dataset.session = member.name; row.dataset.selected = String(member.name === selected);
    const identity = el('div', 'league-team-member-identity');
    const mark = el('span', 'league-team-member-mark', member.team_lead ? '人' : ''); mark.setAttribute('aria-hidden', 'true');
    const words = el('div', 'league-team-member-words');
    words.append(
      el('strong', null, t('league.agent_title_fact', 'Title · {title}', { title: agentTitle(member) })),
      el('span', null, t('league.agent_name_fact', 'Agent · {name}', { name: agentName(member) })),
      el('span', 'league-team-member-id', t('league.agent_id_fact', 'ID · @{id}', { id: member.name })),
    );
    identity.append(mark, words);
    if (holding) { row.append(identity); return row; }
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
      row.addEventListener('click', () => select(member));
      return row;
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
      select(member);
    });
    const main = el('div', 'league-team-member-main'); main.append(toggle);
    row.append(main, detail); return row;
  };

  const noLead = () => {
    const box = el('section', 'league-team-lead-empty');
    box.append(el('strong', null, t('league.no_lead_title', 'Team lead not assigned')), el('p', null, t('league.no_lead_help', 'Assign an Agent already on this Team, or add a new Agent for the role.')));
    const choices = members.filter((member) => !member.team_lead);
    let leadChoice = '';
    const assign = createAction({ label: t('league.assign_lead', 'Assign lead'), size: 'compact', disabled: true, action: async () => {
      const result = await setTeamLead(leadChoice, name, true); if (!result.ok) return options.onFailed?.(result.message); options.onChanged?.();
    } });
    const pick = ask([{ fields: [{
      key: 'lead', label: t('league.choose_lead', 'Choose an Agent as team lead'),
      blank: choices.length ? t('league.choose_lead', 'Choose an Agent as team lead') : t('league.no_lead_candidates', 'No current Agents to assign'),
      options: choices.map((member) => ({ v: member.name, l: agentTitle(member) })),
    }] }], { density: 'tight', onChange: (value) => { leadChoice = value.lead; assign.setDisabled(!leadChoice); } });
    const add = options.onAddLead ? createAction({ label: t('league.add_lead_agent', 'Add new Agent'), size: 'compact', action: options.onAddLead }) : null;
    const acts = el('div', 'league-team-lead-empty-actions'); acts.append(pick.el, assign.el); if (add) acts.append(add.el); box.append(acts); return box;
  };
  const paint = () => {
    content.replaceChildren(); roster.dataset.density = density;
    densityButton.el.dataset.lines = density === 'compact' ? 'two' : 'one';
    densityButton.el.title = density === 'compact' ? t('league.expand_people', 'Expand Agent details') : t('league.compact_people', 'Compact Agent details');
    densityButton.el.setAttribute('aria-label', densityButton.el.title); densityButton.el.setAttribute('aria-pressed', String(density === 'expanded'));
    if (!members.length) {
      if (!holding) content.append(noLead());
      content.append(el('p', 'league-team-empty', holding ? t('league.no_ronin', 'No Rōnin Agents') : t('league.no_members', 'No Agents assigned yet.')));
    }
    else content.append(...members.map(memberRow));
    for (const detail of content.querySelectorAll('.league-team-member-detail')) detail.hidden = density !== 'expanded';
    for (const toggle of content.querySelectorAll('.league-team-member-toggle')) {
      const expanded = density === 'expanded', member = members.find((row) => row.name === toggle.closest('.league-team-member')?.dataset.session);
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', t(expanded ? 'league.collapse_agent' : 'league.expand_agent', expanded ? 'Collapse {name}' : 'Expand {name}', { name: agentTitle(member || {}) }));
      const disclosure = toggle.querySelector('.league-team-member-disclosure'); if (disclosure) disclosure.textContent = expanded ? '⌃' : '⌄';
    }
  };
  densityButton.el.addEventListener('click', () => { density = density === 'compact' ? 'expanded' : 'compact'; paint(); });
  paint();
  if (holding) return roster;
  const available = sessionsAvailableToTeam(name), add = el('div', 'league-team-add');
  const memberSelect = el('select', null); memberSelect.setAttribute('aria-label', t('league.choose_member', 'Choose an Agent to add'));
  memberSelect.append(new Option(available.length ? t('league.choose_member', 'Choose an Agent to add') : t('league.no_available_members', 'No other Agents available'), ''));
  for (const session of available) memberSelect.append(new Option(agentTitle(session), session.name));
  const assign = createAction({ label: t('league.assign_member', 'Assign'), size: 'compact', disabled: true, action: async () => { if (!memberSelect.value) return; const result = await setTeamMembership(memberSelect.value, name, true); if (!result.ok) return options.onFailed?.(result.message); options.onChanged?.(); } });
  memberSelect.addEventListener('change', () => assign.setDisabled(!memberSelect.value));
  add.append(memberSelect, assign.el); roster.append(add);
  return roster;
};
