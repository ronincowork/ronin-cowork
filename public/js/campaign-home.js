/* part of the ronin-cowork client — see js/README.md */
/**
 * CAMPAIGN HOME — the root arrival, and three doors out of it.
 *
 *   ⛩ Campaign · 人々 Coworks · 人 Agents
 *
 * Torii, hitobito, hito: the body of work, its people, one of them. Each door carries
 * ONE loaded default and going through it takes you straight there — the Campaign's
 * Cowork space, that Cowork's page, that Agent at work. The page holds no list, no
 * count and no reading; those live behind the doors, which is the point of a door.
 *
 * THE CHIP IS THE DIAL. Every door shows what it is loaded with, and the thing that
 * SHOWS the value is the thing that CHANGES it: click the chip and that door's tray
 * opens under the row while the other two go inert. Same gesture on all three, and the
 * page gains no furniture for it — the value had to be drawn anyway.
 *
 * WHAT A DOOR IS, on approach only. Each card carries one line saying what the thing
 * IS (never how to click it). It keeps its space at rest and only its opacity moves, so
 * the row never reflows and nothing is ever drawn on top of anything — a reveal, not a
 * tooltip. `focus-within` gives a keyboard the same reveal.
 *
 * CAMPAIGN GOVERNS THE OTHER TWO. A Cowork and an Agent each belong to exactly one
 * Campaign (CAMPAIGN_SCOPING.md), so loading a Campaign re-homes both defaults: one
 * from another Campaign is not a legal default here and falls to the first that is.
 * The selection itself is browser state, never SETTEI — two tabs may sit on different
 * Campaigns without fighting — and it is read through `normalizeSelection`, which heals
 * a stored id that has since been archived or deleted.
 */
import { t } from './lexicon.js';
import { S } from './state.js';
import { campaignOf, campaigns, campaignsFailed, campaignsMessage, loadCampaigns, normalizeSelection, primaryCampaign, selectedIds } from './campaigns.js';
import { refreshTeams, teamsFromState } from './team-controller.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

/**
 * The three doors, read at paint and never built at import: a module-level table holding
 * words is evaluated before the lexicon is up, which would freeze the stock English into
 * every profile (KOKUGO § 5).
 */
function DOORS() {
  return [
    { key: 'campaign', glyph: '⛩', name: t('campaign', 'Campaign'), is: t('campaign_home.campaign_is', 'A named body of work') },
    { key: 'coworks', glyph: '人々', name: t('campaign.coworks', 'Coworks'), is: t('campaign_home.coworks_is', 'Coworking space for Agents') },
    { key: 'agents', glyph: '人', name: t('league.agents', 'Agents'), is: t('campaign_home.agents_is', 'One Agent, one job') },
  ];
}

export function createCampaignHome() {
  const root = el('main', 'ch-view');
  const frame = el('div', 'ch-frame');
  const doors = el('div', 'ch-doors');
  const tray = el('div', 'ch-tray');
  tray.hidden = true;
  frame.append(doors, tray);
  root.append(frame);

  let ctx = null;
  let entered = false;
  let open = ''; // '' | 'campaign' | 'coworks' | 'agents'

  /* ---------- what this tab is loaded with ---------- */
  const selection = () => normalizeSelection(ctx?.state?.campaignSelection);
  const mine = () => ctx?.viewState('home') || {};
  /** Durable Cowork records inside the current Campaign selection. */
  const coworksHere = () => teamsFromState().filter((row) => row.durable && inSel(row));
  /** Live Agents inside it — a session with no Cowork is still an Agent and still listed. */
  const agentsHere = () => (Array.isArray(S.sessions) ? S.sessions : []).filter(inSel);
  const inSel = (record) => {
    const ids = selectedIds(selection());
    return !ids.length || ids.includes(campaignOf(record));
  };

  /** The loaded Cowork/Agent, healed: one that left the Campaign is not a default here. */
  const cowork = () => {
    const rows = coworksHere();
    const want = mine().cowork;
    return rows.find((row) => row.name === want) || rows[0] || null;
  };
  const agent = () => {
    const rows = agentsHere();
    const want = mine().agent;
    return rows.find((row) => row.name === want) || rows[0] || null;
  };
  const coworkLabel = (row) => row?.title || row?.name || '';

  const valueOf = (key) => {
    if (key === 'campaign') {
      const ids = selectedIds(selection());
      if (ids.length > 1) return t('campaign_home.selected_n', '{n} selected', { n: ids.length });
      return primaryCampaign(selection())?.title || t('campaign_home.no_campaign', 'No Campaign');
    }
    if (key === 'coworks') return coworkLabel(cowork()) || t('campaign_home.no_cowork', 'No Cowork');
    return agent()?.name || t('campaign_home.no_agent', 'No Agent');
  };

  /* ---------- going through a door ---------- */
  const go = (key) => {
    if (!ctx) return;
    if (key === 'campaign') return void ctx.navigate('campaign');
    if (key === 'coworks') {
      const row = cowork();
      return void (row && ctx.navigate('team', { param: row.name }));
    }
    // AN AGENT IS NOT A PAGE — it is a tile in a workspace. So its door opens the Cowork
    // it works in with that Agent already up, which is the Agent's page in the only sense
    // Ronin has one. A rōnin (no Cowork) opens the Cowork space rather than nowhere.
    const row = agent();
    if (!row) return;
    const team = (row.tags || []).find((name) => coworksHere().some((c) => c.name === name)) || '';
    if (!team) return void ctx.navigate('cowork');
    ctx.patchViewState('team', { seats: { workspace1: row.name } });
    ctx.navigate('team', { param: team });
  };

  /** Loading a Campaign re-homes the other two — see the header note. */
  const loadCampaign = (id) => {
    ctx?.patchState({ campaignSelection: { mode: 'selected', campaign_ids: [id], primary_campaign_id: id } });
    ctx?.patchViewState('home', { cowork: '', agent: '' });
  };

  /* ---------- the tray ---------- */
  const rowsFor = (key) => {
    if (key === 'campaign') {
      const on = selectedIds(selection());
      return campaigns().filter((row) => row.state !== 'archived')
        .map((row) => ({ id: row.id, label: row.title, on: on.includes(row.id) }));
    }
    if (key === 'coworks') {
      const now = cowork()?.name;
      return coworksHere().map((row) => ({ id: row.name, label: coworkLabel(row), on: row.name === now }));
    }
    const now = agent()?.name;
    return agentsHere().map((row) => ({ id: row.name, label: row.name, on: row.name === now }));
  };

  const choose = (key, id) => {
    if (key === 'campaign') loadCampaign(id);
    else ctx?.patchViewState('home', key === 'coworks' ? { cowork: id } : { agent: id });
    open = '';
    paint();
  };

  // Manage is the one door out of a tray: the tray SELECTS, and everything that changes
  // a record — new, edit, archive — is behind it. Each goes to the surface that owns that
  // record today rather than to a placeholder. Coworks and Agents both land on the Cowork
  // space, which is where New Team and New Agent live as SURFACES since @new_team's
  // 2026-08-29 cut — `new-team` is no longer a destination and navigating to it would
  // fall silently back to this page.
  const manage = (key) => {
    open = '';
    paint();
    ctx?.navigate(key === 'campaign' ? 'campaign' : 'cowork');
  };

  function paintTray() {
    tray.hidden = !open;
    if (!open) return;
    tray.dataset.for = open;
    tray.replaceChildren();
    const rows = rowsFor(open);
    for (const row of rows) {
      const pill = el('button', 'ch-pill', row.label);
      pill.type = 'button';
      pill.dataset.on = String(row.on);
      pill.addEventListener('click', () => choose(open, row.id));
      tray.append(pill);
    }
    if (!rows.length) tray.append(el('p', 'ch-empty', t('campaign_home.tray_empty', 'Nothing here yet.')));
    tray.append(el('span', 'ch-sep'));
    const button = el('button', 'ch-manage');
    button.type = 'button';
    button.append(el('i', null, '✳'), el('span', null, t('campaign_home.manage', 'Manage')));
    button.addEventListener('click', () => manage(open));
    tray.append(button);
  }

  function paintDoors() {
    doors.replaceChildren();
    for (const door of DOORS()) {
      const card = el('div', 'ch-door');
      card.dataset.door = door.key;
      if (open === door.key) card.dataset.open = 'true';
      else if (open) card.dataset.inert = 'true';

      const enter = el('button', 'ch-go');
      enter.type = 'button';
      enter.append(el('span', 'ch-glyph', door.glyph), el('h2', null, door.name), el('p', 'ch-is', door.is));
      enter.addEventListener('click', () => go(door.key));

      const chip = el('button', 'ch-chip');
      chip.type = 'button';
      chip.setAttribute('aria-label', t('campaign_home.change', 'Change'));
      chip.setAttribute('aria-expanded', String(open === door.key));
      chip.append(el('b', null, valueOf(door.key)), el('i', null, '▼'));
      chip.addEventListener('click', () => { open = open === door.key ? '' : door.key; paint(); });

      card.append(enter, chip);
      doors.append(card);
    }
  }

  function paint() {
    if (!entered) return;
    paintDoors();
    paintTray();
  }

  return {
    el: root,
    glyph: '⛩',
    title: () => t('campaign_home.title', 'Ronin'),
    enter: async (context) => {
      ctx = context;
      entered = true;
      open = '';
      paint();
      // Three reads, none of which the page waits on together: the Campaign list (which
      // synthesizes when no store answers yet), and the rosters/sessions behind them.
      await loadCampaigns();
      if (!entered) return;
      paint();
      await refreshTeams();
      if (!entered) return;
      if (campaignsFailed()) root.dataset.failed = campaignsMessage();
      else delete root.dataset.failed;
      paint();
    },
    leave: () => { entered = false; open = ''; },
    destroy: () => { entered = false; ctx = null; },
  };
}
