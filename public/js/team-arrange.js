/* part of the ronin-cowork client — see js/README.md */
/**
 * THE DRAFT — how the team page is told to look, by a button or by an agent.
 *
 * One controller, two callers (owner, 2026-08-26). A draft names only what should
 * change; what it omits stays as it is. Its line form is what an agent types:
 *
 *   workspace1=view_mgr            a session's tile in that workspace
 *   workspace2=commons             the commons there (on the tab it was last on)
 *   workspace2=commons:docs        the commons, on that tab (chat · wipeboard · docs · config)
 *   workspace2=commons:docs:<path> the commons on ▧ Docs, with that file open
 *   workspace2=cowork              the cowork commons there (on the tab it was last on)
 *   workspace2=cowork:roots        the cowork commons, on that tab
 *                                  (health · account · profile · roots · help · keypad)
 *   workspace1=terminal            the workspace's seat back, as it was
 *   workspace1=empty               the seat, with nothing in it
 *   workspace3=…  workspace4=…      the lower cells of the 2×2 (count=4)
 *   count=2 | count=4              two workspaces around the roster, or four two-by-two
 *   order=workspace2,roster,workspace1   (a column word names a STACK: 1 over 3, 2 over 4)
 *   hidden=roster    shown=roster  hidden=none
 *
 * `me` stands for the asking session. Nothing here knows how a workspace shows a
 * thing — team-view.js hands in the verbs, this only decides which to call.
 */

import { request } from './request.js';
import { COWORK_TABS } from './cowork-commons.js';

const COLUMNS = ['workspace1', 'roster', 'workspace2'];
const WORKSPACES = ['workspace1', 'workspace2', 'workspace3', 'workspace4'];
const TABS = { chat: 'chat', wipeboard: 'wipeboard', docs: 'docs', config: 'team-configuration', 'team-configuration': 'team-configuration' };

/** Tokens (`key=value`) → { draft, errors }. Unknown words are errors, not guesses. */
export function parseDraft(tokens = [], me = '') {
  const draft = {};
  const errors = [];
  for (const raw of tokens) {
    const token = String(raw).trim();
    if (!token) continue;
    const at = token.indexOf('=');
    if (at < 0) { errors.push(`${token}: not key=value`); continue; }
    const key = token.slice(0, at);
    const value = token.slice(at + 1);
    if (WORKSPACES.includes(key)) {
      const [what, tab, ...rest] = value.split(':');
      if (what === 'commons') {
        if (tab && !TABS[tab]) { errors.push(`${key}: no commons tab "${tab}"`); continue; }
        draft[key] = { commons: true, tab: tab ? TABS[tab] : '', doc: rest.join(':') || '' };
      } else if (what === 'cowork') {
        if (tab && !COWORK_TABS[tab]) { errors.push(`${key}: no cowork tab "${tab}"`); continue; }
        draft[key] = { cowork: true, tab: tab ? COWORK_TABS[tab] : '' };
      } else if (what === 'terminal' || what === 'empty') draft[key] = { [what]: true };
      else if (what) draft[key] = { session: what === 'me' ? me : what };
      else errors.push(`${key}: say what goes there`);
      continue;
    }
    if (key === 'count') {
      if (value === '2' || value === '4') draft.count = Number(value);
      else errors.push('count: 2 or 4');
      continue;
    }
    if (key === 'roster') {
      if (value === 'hidden' || value === 'shown') draft[value] = [...(draft[value] || []), 'roster'];
      else errors.push('roster: hidden or shown');
      continue;
    }
    if (key === 'order') {
      const order = value.split(',').map((s) => s.trim()).filter(Boolean);
      const bad = order.filter((c) => !COLUMNS.includes(c));
      if (bad.length) { errors.push(`order: no column "${bad[0]}"`); continue; }
      draft.order = order;
      continue;
    }
    if (key === 'hidden' || key === 'shown') {
      const cols = value === 'none' ? [] : value.split(',').map((s) => s.trim()).filter(Boolean);
      const bad = cols.filter((c) => !COLUMNS.includes(c));
      if (bad.length) { errors.push(`${key}: no column "${bad[0]}"`); continue; }
      if (key === 'hidden' && value === 'none') draft.shown = [...(draft.shown || []), ...COLUMNS];
      else draft[key] = [...(draft[key] || []), ...cols];
      continue;
    }
    errors.push(`${key}: not a draft key`);
  }
  return { draft, errors };
}

/**
 * The controller. `verbs` are the page's own moves:
 *   { showColumn(name), hideColumn(name), moveColumn(name, index), columns() -> {order, hidden},
 *     putSession(name, workspace), putCommons(workspace, tab, doc), putTerminal(workspace), emptySeat(workspace) }
 * apply() runs a draft through them, in the order columns → workspaces, and returns what it did.
 */
export function createArranger(verbs) {
  const apply = (draft = {}) => {
    const did = [];
    if (Array.isArray(draft.order) && draft.order.length) {
      // Named columns take the front in the order given; the rest keep their order after.
      draft.order.forEach((name, i) => { verbs.moveColumn(name, i); did.push(`order ${name}→${i}`); });
    }
    for (const name of draft.shown || []) { verbs.showColumn(name); did.push(`show ${name}`); }
    for (const name of draft.hidden || []) { verbs.hideColumn(name); did.push(`hide ${name}`); }
    if (draft.count) { verbs.setCount(draft.count); did.push(`count ${draft.count}`); }
    for (const ws of WORKSPACES) {
      const want = draft[ws];
      if (!want) continue;
      if (want.commons) { verbs.putCommons(ws, want.tab, want.doc); did.push(`${ws} commons${want.tab ? ':' + want.tab : ''}`); }
      else if (want.cowork) { verbs.putCowork(ws, want.tab); did.push(`${ws} cowork${want.tab ? ':' + want.tab : ''}`); }
      else if (want.session) { if (verbs.putSession(want.session, ws)) did.push(`${ws} ${want.session}`); else did.push(`${ws}: no session ${want.session}`); }
      else if (want.terminal) { verbs.putTerminal(ws); did.push(`${ws} terminal`); }
      else if (want.empty) { verbs.emptySeat(ws); did.push(`${ws} empty`); }
    }
    return did;
  };
  return { apply };
}

/** This tab's view, reported to Ronin so an agent can read it (tejun-teampage). */
export function reportView(team, tab, view) {
  return request(`/api/teams/${encodeURIComponent(team)}/page/${encodeURIComponent(tab)}`, { method: 'PUT', json: { view } });
}
