/* part of the ronin-cowork client — see js/README.md */
/** The Team member list on the Commons roster: one line per Agent (人 first for the lead);
 *  a pressed row opens in place to the Agent's read — role, what it is working on, the
 *  items it holds, then the composition body the composition tile paints (one body), its
 *  @id — with the member action bar under it; pressed again it folds. No Launch on a row:
 *  dragging a row onto a workspace opens the Agent there (owner, 2026-10-20). The foot
 *  opens New Agent. */
import { WorkspaceKit } from './workspace-kit.js';
import { membersOfTeam, setTeamLead, setTeamMembership, teamByName } from './team-controller.js';
import { setSessionTitle } from './api.js';
import { request } from './request.js';
import { createItemPhalanx } from './work-items-surface.js';
import { createAgentCompositionReader } from './agent-composition.js';
import { createStep } from './form-steps.js';
import { SURFACE_DRAG } from './workbench.js';
import { WORKBENCH_TYPES } from './workbench-catalog.js';
import { t } from './lexicon.js';

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };

export const agentTitle = (session) => session.title || String(session.name || '').split(/[_-]+/).filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
const agentName = (session) => String(session.identity?.cli || session.agent || session.session_type || 'Agent')
  .split(/[_-]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

// Every pushed home row and every Team projection publish land in the panel renderers. The
// renderers compare this string — the durable roster and each member line — and tear the
// panel down only when it moves, so the form's loading line, its catalogs and a half-typed
// edit survive a push.
export const configSignature = (name) => {
  const roster = teamByName(name);
  const line = (s) => [s.name, !!s.team_lead, agentTitle(s), s.session_type || ''];
  return JSON.stringify([roster.durable ? roster : null, membersOfTeam(name).map(line)]);
};

// The items an Agent holds are its reading (/api/work-items?session=), asked when its row opens.
const itemsHeld = async (member) => {
  const result = await request(`/api/work-items?session=${encodeURIComponent(member.name)}`, { cache: 'no-store' });
  return result.ok && Array.isArray(result.data.items) ? result.data.items : [];
};

export const buildTeamMembers = (name, options = {}) => {
  const { createAction, createActionBar } = WorkspaceKit.primitives;
  const roster = el('section', 'league-team-roster');
  const members = membersOfTeam(name);
  const heading = el('div', 'league-team-roster-heading');
  heading.append(el('h3', 'league-team-roster-title', t('league.people', 'People')));
  roster.append(heading);
  const content = el('div', 'league-team-people-content'); roster.append(content);

  const memberRow = (member) => {
    const row = el('article', 'league-team-member');
    row.dataset.session = member.name;
    // Opening the Agent is a drag — the row onto a workspace — the Agent's own tile, as the
    // Team page's Agent card places it; never a new tab from here.
    row.draggable = true;
    row.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.terminal, detail: { key: member.name } }));
      event.dataTransfer.setData('text/plain', agentTitle(member)); event.dataTransfer.effectAllowed = 'copy';
    });
    const identity = el('div', 'league-team-member-identity');
    const mark = el('span', 'league-team-member-mark', member.team_lead ? '人' : ''); mark.setAttribute('aria-hidden', 'true');
    identity.append(mark, el('strong', 'league-team-member-title', agentTitle(member)));
    const reading = options.reading?.(member) || {};
    const status = el('div', 'league-team-member-reading');
    for (const [className, value] of [
      ['league-team-member-step', reading.step],
      ['league-team-member-state', reading.status],
      ['league-team-member-ctx', reading.ctx],
      ['league-team-member-model', reading.model],
    ]) if (value) status.append(el('span', className, value));
    const disclosure = el('span', 'league-team-member-disclosure'); disclosure.setAttribute('aria-hidden', 'true');
    const toggle = el('button', 'league-team-member-toggle'); toggle.type = 'button';
    toggle.append(identity, status, disclosure);
    // The opened row, top to bottom, in the launch forms' format (owner, 2026-10-20): one
    // identity line (role · @id); Work — what it is working on, the items it holds; then the
    // composition body the composition tile paints (Brief, Mandate, Behaviors); then the acts.
    const detail = el('div', 'league-team-member-detail');
    detail.id = `team-member-${options.idPrefix || name}-${member.name}-actions`;
    toggle.setAttribute('aria-controls', detail.id);
    // Work: the items held, once (the reading line said the same thing twice; lead, 2026-10-24).
    const work = createStep({ key: 'work', title: t('league.work', 'Work') });
    const items = createItemPhalanx({ holder: () => member.name, className: 'league-team-member-items' }); work.body.append(items.el);
    const word = el('p', 'league-team-member-status');
    const composition = createAgentCompositionReader(member.name, { setState: (_state, message) => { word.textContent = message || ''; } });
    const rename = createAction({ label: t('league.rename_agent', 'Rename'), action: async () => {
      const currentTitle = agentTitle(member);
      const wanted = window.prompt(t('league.rename_agent_prompt', 'Edit Agent title'), currentTitle);
      if (wanted == null || wanted.trim() === currentTitle) return;
      try { await setSessionTitle(member.name, wanted.trim()); options.onChanged?.(); }
      catch (error) { options.onFailed?.(t('head.rename_failed', 'Could not rename session: {reason}', { reason: error.message })); }
    } });
    const lead = createAction({ label: member.team_lead ? t('league.team_lead', 'Team Lead') : t('league.make_team_lead', 'Make Lead'), selected: member.team_lead, action: async () => { const result = await setTeamLead(member.name, name, !member.team_lead); if (!result.ok) return options.onFailed?.(result.message); options.onChanged?.(); } });
    const eject = createAction({ label: t('league.remove_member', 'Remove'), title: t('league.remove_named_member', 'Remove {name} from this team', { name: member.name }), action: async () => { const result = await setTeamMembership(member.name, name, false); if (!result.ok) return options.onFailed?.(result.message); options.onChanged?.(); } });
    const close = options.onClose ? createAction({ label: t('league.close_agent', 'Close'), title: t('league.close_named_agent', 'Close {name}', { name: member.name }), action: () => options.onClose(member) }) : null;
    detail.append(el('p', 'ac-line', `${agentName(member)} · @${member.name}`), work.el, composition.el, word, createActionBar({ className: 'league-team-member-actions', actions: [composition.action, rename, lead, eject, close] }).el);
    const open = (expanded) => {
      detail.hidden = !expanded;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', t(expanded ? 'league.collapse_agent' : 'league.expand_agent', expanded ? 'Collapse {name}' : 'Expand {name}', { name: agentTitle(member) }));
      disclosure.textContent = expanded ? '⌃' : '⌄';
      if (!expanded) return;
      void itemsHeld(member).then((list) => items.setItems(list));
      void composition.show();
    };
    toggle.addEventListener('click', () => open(detail.hidden));
    open(false);
    row.append(toggle, detail); return row;
  };

  if (!members.length) content.append(el('p', 'league-team-empty', t('league.no_members', 'No Agents assigned yet.')));
  else content.append(...members.map(memberRow));
  // Agents join a Team by dragging; the foot starts a new one — the New Agent form with this
  // Team chosen, opened the way the selector's New Agent card opens it.
  const foot = el('div', 'league-team-add');
  foot.append(createAction({ label: t('new_agent.title', 'New Agent'), action: () => options.onNew?.() }).el);
  roster.append(foot);
  return roster;
};

// The roster reads what the tile's chip says: the items held with their status, and the
// first held item's title beside it in the Agent's own words.
export const currentWorkStep = (letter) => {
  const items = letter?.items || [];
  if (!items.length) return { label: '', text: '' };
  return { label: letter.chip?.text || '', text: items[0].title || '' };
};
