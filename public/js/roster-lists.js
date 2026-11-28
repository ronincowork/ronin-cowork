/* part of the ronin-cowork client — see js/README.md */
/**
 * THE ROSTER LISTS (plan ronin_cowork/phone-lists, KAN-818; w1146): the one reading behind the
 * phone's front door and the All Hands workbench's roster. Its questions — Kind (each row: Agent,
 * Lead, Item), Sort (By type: one group per Team, Epic or Workspace; By active: one group each for
 * Flagged, Active, Recently active, Everyone else) and, only By type, Type (the grouping: Team,
 * Epic, Workspace) — answered from the store alone. Each consumer draws the groups its own way.
 */
import { get as held } from './store.js';
import { membersOfTeam, teamByName, teamsFromState, UNASSIGNED, unassignedSessions } from './team-controller.js';
import { listedTeam } from './roster-groups.js';
import { agentSituation } from './home.js';
import { S } from './state.js';
import { t } from './lexicon.js';
import { splitItemTitle } from './item-title.js';
import { humanAge } from './work-record.js';

export const readable = (name) => String(name || '').split(/[_-]+/).filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
export function teamLabel(team) {
  if (team.name === UNASSIGNED) return t('league.ronin', 'Ronin: no team');
  return String(team.title ?? '').trim() || team.name;
}
export function agentLabel(session) {
  return session.title || readable(session.name);
}
export const sessionOf = (name) => (S.sessions || []).find((one) => one.name === name) || { name };

/** The questions, as Erabi fields (ask.js): Kind, then Sort, then Type, which means something
 * only when sorting by type (owner, 28 Nov); `rosterShown` says which are drawn. */
export function rosterQuestions() {
  return [
    { key: 'kind', label: t('phone.kind', 'Kind'), options: [{ v: 'agent', l: t('phone.kind_agent', 'Agent') }, { v: 'lead', l: t('phone.kind_lead', 'Lead') }, { v: 'item', l: t('phone.kind_item', 'Item') }] },
    { key: 'sort', label: t('phone.sort', 'Sort'), options: [{ v: 'type', l: t('phone.sort_type', 'By type') }, { v: 'active', l: t('phone.sort_active', 'By active') }] },
    { key: 'type', label: t('phone.type', 'Type'), options: [{ v: 'team', l: t('phone.type_team', 'Team') }, { v: 'epic', l: t('phone.type_epic', 'Epic') }, { v: 'workspace', l: t('phone.type_workspace', 'Workspace') }] },
  ];
}
/** The questions drawn for a choice: Type only while sorting by type. */
export const rosterShown = (choice) => (choice.sort === 'active' ? ['kind', 'sort'] : ['kind', 'sort', 'type']);
export const ROSTER_CHOICE = Object.freeze({ type: 'team', kind: 'agent', sort: 'type' });

const NO_GROUP = ''; // the group id of "no Epic" / "no Workspace"
const isOpenItem = (item) => item && item.status !== 'Done';
export const holderOf = (item) => {
  const [kind, ...rest] = String(item?.holder || '').split(':');
  const name = rest.join(':');
  return (kind === 'agent' || kind === 'team') && name ? { kind, name } : null;
};
/** The Teams an Agent is on (Unassigned when none), by the roster the page reads. */
const teamsOfAgent = (name, teams) => {
  const on = teams.filter((team) => team.name !== UNASSIGNED && membersOfTeam(team.name).some((member) => member.name === name)).map((team) => team.name);
  return on.length ? on : [UNASSIGNED];
};
/** The Teams that work an item: a Team holder is that Team; an Agent holder is its Teams. */
export const teamsOfItem = (item, teams) => {
  const holder = holderOf(item);
  if (!holder) return [UNASSIGNED];
  return holder.kind === 'team' ? [holder.name] : teamsOfAgent(holder.name, teams);
};
function workspaceOfTeam(name) {
  return String(teamByName(name)?.workspace || '');
}

/**
 * Every group for one Type and Kind: [{ id, label, team?, rows }], a row
 * { key, kind: 'agent' | 'item', name | item }. An Agent may sit in several groups.
 */
function readGroups(type, kind) {
  const teams = teamsFromState().filter((team) => listedTeam(team) && (!team.holding || unassignedSessions().length));
  const epics = (held('epics') || []).filter(isOpenItem);
  const under = (held('epicItems') || []).filter(isOpenItem);
  const items = [...epics, ...under];
  const agents = (S.sessions || []).map((session) => session.name);
  const leads = new Set(teams.flatMap((team) => membersOfTeam(team.name).filter((member) => member.team_lead).map((member) => member.name)));
  const people = kind === 'lead' ? agents.filter((name) => leads.has(name)) : agents;
  const groups = new Map();
  const group = (id, label, extra = {}) => {
    if (!groups.has(id)) groups.set(id, { id, label, rows: [], ...extra });
    return groups.get(id);
  };
  const addAgent = (target, name) => { if (!target.rows.some((row) => row.name === name)) target.rows.push({ key: `a:${name}`, kind: 'agent', name }); };
  const addItem = (target, item) => { if (!target.rows.some((row) => row.item?.id === item.id)) target.rows.push({ key: `i:${item.id}`, kind: 'item', item }); };

  if (type === 'team') {
    for (const team of teams) group(team.name, teamLabel(team), { team: team.name });
    if (kind === 'item') {
      for (const item of items) for (const name of teamsOfItem(item, teams)) addItem(group(name, teamLabel({ name }), { team: name }), item);
    } else {
      for (const team of teams) for (const member of membersOfTeam(team.name)) {
        if (kind === 'lead' && !member.team_lead) continue;
        addAgent(groups.get(team.name), member.name);
      }
    }
  } else if (type === 'epic') {
    const epicLabel = (epic) => splitItemTitle(epic.title || epic.id).shortTitle;
    for (const epic of epics) group(epic.id, epicLabel(epic));
    const noEpic = () => group(NO_GROUP, t('phone.no_epic', 'No Epic'));
    if (kind === 'item') {
      for (const epic of epics) addItem(groups.get(epic.id), epic);
      for (const item of under) addItem(item.epic && groups.has(item.epic) ? groups.get(item.epic) : noEpic(), item);
    } else {
      // An Agent is under an Epic when it holds the Epic or any item under it.
      for (const name of people) {
        const holds = items.filter((item) => { const holder = holderOf(item); return holder?.kind === 'agent' && holder.name === name; });
        const epicIds = new Set(holds.map((item) => (item.level === 1 ? item.id : item.epic)).filter((id) => id && groups.has(id)));
        if (!epicIds.size) addAgent(noEpic(), name);
        for (const id of epicIds) addAgent(groups.get(id), name);
      }
    }
  } else {
    const noWorkspace = t('phone.no_workspace', 'No Workspace');
    const at = (name) => group(name || NO_GROUP, name || noWorkspace);
    if (kind === 'item') {
      // An item's Workspace is its Epic's holder's; an item under no Epic, its own holder's.
      const epicById = new Map(epics.map((epic) => [epic.id, epic]));
      for (const item of items) {
        const owner = item.level === 1 ? item : epicById.get(item.epic) || item;
        for (const team of teamsOfItem(owner, teams)) addItem(at(workspaceOfTeam(team)), item);
      }
    } else {
      // An Agent's Workspace is its Team's.
      for (const name of people) for (const team of teamsOfAgent(name, teams)) addAgent(at(workspaceOfTeam(team)), name);
    }
  }
  const out = [...groups.values()];
  // A Team stands even with nobody on it (its ＋ is how one is launched); other groups only with rows.
  return type === 'team' ? out : out.filter((one) => one.rows.length);
}

/**
 * A ROW'S SITUATION, DRAWN THE ONE WAY (KAN-665, KAN-776; KAN-977): the Team selector's Agent
 * card, the phone's rows and All Hands' rows wear `rosterRowClass(situation)`; a row ends with
 * `rosterMark()` at its right, a card uses its heading. workspace-kit.css (.roster-row) draws
 * the mark once for all three: ⚑ when flagged, the Chat's dot while working (a hollow ring just
 * finished), nothing otherwise; the name (`roster-name`) muted when stopped.
 */
export const rosterRowClass = (situation) => `roster-row${situation ? ` ${situation}` : ''}`;
/** `words`: what an Agent with no dot or ⚑ says in the mark's place (lastWorked), muted. */
export function rosterMark(words = '') {
  const mark = document.createElement('span');
  mark.className = 'roster-mark';
  if (words) mark.textContent = words;
  else mark.setAttribute('aria-hidden', 'true');
  return mark;
}
/**
 * LAST ACTIVE (owner, 28 Nov; KAN-982): an Agent with no mark (not flagged, working or just
 * finished) says how long ago its last turn ended, the card's `at` that agentSituation reads:
 * 'just now', else humanAge's '3h ago'. '' while it has a mark or no turn yet. The age clock
 * (onAgeTick) that already redraws the rows keeps it current.
 */
export function lastWorked(card, situation, now = Date.now()) {
  if (['flagged', 'working', 'ready'].includes(situation)) return '';
  const at = Date.parse(card?.at || '');
  if (!Number.isFinite(at)) return '';
  const ms = Math.max(0, now - at);
  return ms < 60000 ? t('roster.just_now', 'just now') : t('roster.ago', '{age} ago', { age: humanAge(ms) });
}

/** The cards Home reads (`home`), by Agent name: what a row's situation is read from. */
export const cardsByName = () => new Map((held('home') || []).map((card) => [card.name, card]));

/** The situation of a row: an Agent's off its card (KAN-665), as the desktop pill reads it; an
 * item's is its holder's (a Team holder stands as its lead), flagged when the item is. */
export function situationOf(row, cardOf) {
  if (row.kind === 'agent') return agentSituation(cardOf.get(row.name));
  if (row.item.flagged) return 'flagged';
  const holder = holderOf(row.item);
  const name = holder?.kind === 'team' ? membersOfTeam(holder.name).find((member) => member.team_lead)?.name : holder?.name;
  return name ? agentSituation(cardOf.get(name)) : '';
}

/**
 * The groups for one choice ({ type, kind, sort }), each with its `cardId` (what is remembered
 * open). By active (owner, 24 Nov): the same rows grouped by situation — Flagged, then Active
 * (working now), then Recently active (finished under ten minutes ago), then everyone else; each
 * row once, by name.
 */
export function rosterGroups(choice, cardOf = cardsByName()) {
  // By active asks no Type: the rows are read by Workspace, the grouping that holds every Agent.
  const type = choice.sort === 'active' ? 'workspace' : choice.type;
  const groups = readGroups(type, choice.kind).map((group) => ({ ...group, cardId: `${type}:${group.id}` }));
  if (choice.sort !== 'active') return groups;
  const seen = new Map();
  for (const group of groups) for (const row of group.rows) if (!seen.has(row.key)) seen.set(row.key, row);
  const label = (row) => (row.kind === 'agent' ? agentLabel(sessionOf(row.name)) : row.item.title || row.item.id);
  const sorted = [...seen.values()].sort((a, b) => label(a).localeCompare(label(b)));
  const bands = [['flagged', t('phone.band_flagged', 'Flagged')], ['working', t('phone.band_active', 'Active')], ['ready', t('phone.band_recent', 'Recently active')], ['rest', t('phone.band_rest', 'Everyone else')]];
  const bandOf = (row) => { const situation = situationOf(row, cardOf); return ['flagged', 'working', 'ready'].includes(situation) ? situation : 'rest'; };
  return bands.map(([band, heading]) => ({ id: band, cardId: `active:${band}`, label: heading, rows: sorted.filter((row) => bandOf(row) === band) }))
    .filter((group) => group.rows.length);
}
