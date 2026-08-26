/* part of the ronin-cowork client — see js/README.md */
/**
 * THE JOB PICK, off a tile head — what a session is doing, and whether it is the 人.
 *
 * Split out of tile.js at the 700-line ceiling (js/README.md rule 5). The menu is
 * widgets.js's; what a pick MEANS is here: a role goes to the session's letter through
 * the typed writer, and the 人 — a separate, hand-set fact (R35) — toggles the
 * designation on every team the session is on (owner, 2026-08-25: "this should be
 * through the tile buttons — this is already a session_role selector").
 */
import { request } from './request.js';
import { toast } from './ui.js';
import { roleData, refreshHome } from './home.js';
import { S, tiles } from './state.js';
import { openJobMenu } from './widgets.js';

export function pickJobFor(tile, anchor) {
  if (!tile.session) return;
  const session = tile.session;
  const cur = S.sessions.find((x) => x.name === session);
  const isLead = !!(cur && cur.leads?.length);
  const extras = cur && cur.tags?.length ? [{
    label: isLead ? '人 team lead — step down' : '人 make team lead',
    title: isLead ? `Leads ${cur.leads.join(', ')} — clear the designation` : `Designate the 人 of ${cur.tags.join(', ')}`,
    on: isLead,
    pick: '@lead',
  }] : [];
  const settled = () => {
    tiles.forEach((t) => {
      t.syncHeader();
      t.refreshOptions();
    });
    refreshHome();
  };
  openJobMenu(anchor, roleData || [], (cur && cur.session_role) || '', async (job) => {
    const live = S.sessions.find((x) => x.name === session);
    if (job === '@lead') {
      const r = await request('/api/sessions/' + encodeURIComponent(session) + '/team_lead', {
        method: 'POST',
        json: { teams: isLead ? [] : cur.tags },
      });
      if (!r.ok) return toast(`could not set the team lead — ${r.message}`, false);
      if (live) live.leads = r.data.team_lead ?? [];
      return settled();
    }
    const r = await request('/api/sessions/' + encodeURIComponent(session) + '/session_role', {
      method: 'POST',
      json: { session_role: job },
    });
    if (!r.ok) return toast(`could not set the task — ${r.message}`, false);
    if (live) live.session_role = r.data.session_role ?? job;
    settled();
  }, extras);
}
