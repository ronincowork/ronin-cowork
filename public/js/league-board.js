/* part of the ronin-cowork client — see js/README.md
 *
 * THE LEAGUE BOARD — every Team on this box, drawn from the shared projection.
 *
 * COMPOSED, NOT INVENTED. The card, the standard states and the board geometry are the
 * frozen Workspace Kit's (js/workspace-kit.js). This file supplies League's data and
 * behaviour and owns no visual system of its own.
 *
 * THE BUBBLES ARE SIBLINGS OF THE CARD, NEVER CHILDREN. A card with an action is a
 * <button>, roster bubbles carry their own controls in a later leg, and a button cannot
 * nest inside a button. The contract asks for the same thing for its own reason —
 * "visually and behaviorally separate objects" — so structure and contract agree here.
 *
 * DEFERRED BY INSTRUCTION, not forgotten: membership drag/drop and every membership
 * write. Bubbles are read-only in this slice.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { UNASSIGNED, leadsTeam, membersOfTeam, rostersLoaded, teamByName, teamsFromState } from './team-controller.js';
import { S, serviceMissing } from './state.js';

// Reached inside function bodies, never at module top level: a top-level destructure of
// an imported binding is the load-order fragility js/README.md rule 4 exists to prevent.
const kit = () => WorkspaceKit;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
};

/** Coarse age, and only ever from `created` — no service needed for it. */
function age(created) {
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - (Number(created) || 0));
  if (secs < 90) return 'now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

/**
 * ONE BUBBLE. Three tiers of reading, and every tier may be blank:
 * the session_role mark and name are free off the session list; the lead designation is
 * shown only where it exists; SHINGO would be a michi field and is NOT FETCHED at all
 * when that service is off the roster, so the fallback here is role and age alone.
 */
function bubble(session, team) {
  const row = el('div', 'league-member');
  row.dataset.session = session.name;
  const mark = (session.session_role || '').trim();
  // A blank session_role draws as absent. No stand-in glyph, ever.
  row.append(el('span', 'league-member-mark', mark ? mark.slice(0, 2) : ''));
  const name = el('b', null, session.name);
  if (leadsTeam(session, team)) name.append(el('span', 'league-lead', 'lead'));
  row.append(name);
  const readings = [mark, age(session.created)].filter(Boolean);
  if (serviceMissing('michi')) row.dataset.shingo = 'off';
  row.append(el('small', null, readings.join(' · ')));
  return row;
}

/** The roster beneath a card — a sibling of it, never a child. */
function roster(team) {
  const box = el('div', 'league-members');
  const members = membersOfTeam(team.name);
  if (!members.length) {
    box.append(el('p', 'league-empty', team.holding ? 'Every live session is on a Team' : 'No live members'));
    return box;
  }
  for (const s of members) box.append(bubble(s, team.name));
  return box;
}

/** One unit: the navigable Team card, plus its separate roster beneath it. */
function unit(team, context) {
  const wrap = el('section', 'league-team');
  wrap.dataset.team = team.name;
  const members = membersOfTeam(team.name);

  // THE HOLDING AREA IS NOT A DESTINATION (owner, 2026-08-23), so it takes no action and
  // the primitive renders it as an <article> rather than a <button>. The ruling is
  // structural here, not a suppressed click handler.
  const navigable = !team.holding;
  const eyebrow = team.holding ? 'Holding area' : members.length ? 'Active Team' : 'Resting Team';
  const metadata = kit().primitives.createMetadata({ rows: [
    ['State', eyebrow],
    ['Sessions', `${members.length}`],
    ['Team role', (team.team_role || '').trim()],
    ['Roster', !team.durable && !team.holding ? 'Not recorded' : ''],
  ] });
  // team_role renders as its own text and is never fetched: the house ships no
  // definitions for it by design (ronin_catalogs/team_roles/README.md), so a lookup
  // would cost a request to learn nothing. Blank draws as absent.
  const card = kit().primitives.createCard({
    className: 'league-team-card',
    heading: team.holding ? 'Unassigned' : team.name,
    summary: team.holding
      ? 'Live sessions that carry no Team membership.'
      : (team.objective || '').trim(),
    action: navigable ? () => {
      const { navigateWorkspace, workspaceTarget } = kit().contract;
      navigateWorkspace(context, workspaceTarget('team', team.name));
    } : undefined,
  });
  card.metadata.replaceWith(metadata.el);
  wrap.append(card.el, roster(team));
  return wrap;
}

/**
 * Build the board into a Surface, so loading / empty / stale / failed come from the
 * Kit's own state vocabulary rather than a second one invented here.
 */
export function createBoard({ context, rostersVisible }) {
  const { createAction, createActionBar, createCard, createSurface, setSurfaceState } = kit().primitives;
  const surface = createSurface({ label: 'League' });
  surface.el.classList.add('league-surface');
  const board = kit().layouts.createLeagueBoard();
  const cards = board.querySelector('[data-surface="cards"]');
  surface.content.append(board);

  const render = (visible) => {
    cards.replaceChildren();
    board.dataset.rosters = visible ? 'shown' : 'hidden';

    // ONE control for every card together. There are no per-Team disclosure buttons —
    // the reviewed fixture removes its own at load, and the contract forbids them.
    const bar = createActionBar({ className: 'league-toolbar', label: 'League controls' });
    const toggle = createAction({ className: 'league-rosters', label: visible ? 'Hide rosters' : 'Show rosters' }).el;
    toggle.dataset.leagueRosters = '';
    bar.append(toggle);
    cards.append(bar.el);

    const teams = teamsFromState();
    // Zero Teams and no live sessions is a real, correct state on a fresh box: the
    // creation card alone, which is the right face for it rather than an error.
    const real = teams.filter((t) => !t.holding).map((team) => teamByName(team.name));
    const holding = teams.find((t) => t.holding);
    for (const t of real) cards.append(unit(t, context));
    if (holding && membersOfTeam(UNASSIGNED).length) cards.append(unit(holding, context));

    const dotted = createCard({
      className: 'league-new',
      variant: 'dotted',
      heading: 'New Team',
      summary: 'Define the Team, then build its session roster.',
      action: () => {
        const { navigateWorkspace, workspaceTarget } = kit().contract;
        navigateWorkspace(context, workspaceTarget('new-team'));
      },
    });
    cards.append(dotted.el);

    if (!rostersLoaded()) setSurfaceState(surface.el, 'stale', 'Durable rosters unavailable — showing live Teams only.');
    else if (!real.length && !(S.sessions || []).length) setSurfaceState(surface.el, null);
    else setSurfaceState(surface.el, null);
  };

  render(rostersVisible);
  return { el: surface.el, render, surface };
}
