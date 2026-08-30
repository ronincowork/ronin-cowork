/* part of the ronin-cowork client — see js/README.md */
/**
 * RONIN HOME — the root arrival, and three doors out of it.
 *
 *   ⛩ Campaign · 人々 Coworks · 人 Agents
 *
 * Torii, hitobito, hito: the body of work, its people, one of them. Each door carries
 * ONE loaded default. Campaign opens that Campaign's complete Cowork collection,
 * Coworks opens the loaded Cowork, and Agent opens that Agent at work. The page holds no list, no
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
import { campaignOf, campaignsFailed, campaignsMessage, loadCampaigns, normalizeSelection, primaryCampaign, selectedIds } from './campaigns.js';
import { refreshTeams, teamsFromState } from './team-controller.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

/**
 * The three doors (owner, 2026-08-30): the machine's settings on the left — this Ronin,
 * one Campaign today, the page where everything about it is set; the Coworks in the
 * middle; and on the right a launch, a solo Agent or a whole Team. Read at paint and
 * never built at import: a module-level table holding words is evaluated before the
 * lexicon is up, which would freeze the stock English into every profile (KOKUGO § 5).
 */
function DOORS() {
  return [
    { key: 'machine', glyph: '⚙', name: t('campaign_home.machine', 'Machine settings'), is: t('campaign_home.machine_is', 'This Ronin — its look, roots and defaults') },
    { key: 'coworks', glyph: '人々', name: t('campaign.coworks', 'Coworks'), is: t('campaign_home.coworks_is', 'Coworking space for Agents') },
    { key: 'new', glyph: '人', name: t('league.new_agent', 'New Agent'), is: t('campaign_home.new_is', 'Launch a solo Agent, or a whole Team') },
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
  let open = ''; // '' | 'coworks' | 'new'

  /* ---------- what this tab is loaded with ---------- */
  const selection = () => normalizeSelection(ctx?.state?.campaignSelection);
  const mine = () => ctx?.viewState('home') || {};
  /** Durable Cowork records inside the current Campaign selection. */
  const coworksHere = () => teamsFromState().filter((row) => row.durable && inSel(row));
  const inSel = (record) => {
    const ids = selectedIds(selection());
    return !ids.length || ids.includes(campaignOf(record));
  };

  /** The loaded Cowork, healed: one that left the Campaign is not a default here. */
  const cowork = () => {
    const rows = coworksHere();
    const want = mine().cowork;
    return rows.find((row) => row.name === want) || rows[0] || null;
  };
  const coworkLabel = (row) => row?.title || row?.name || '';
  /** What the launch door launches: a solo Agent (the usual) or a whole Team. */
  const LAUNCHES = () => [
    { id: 'agent', label: t('campaign_home.solo_agent', 'Solo Agent'), seat: '@new' },
    { id: 'team', label: t('new_team.title', 'New Team'), seat: '@new-team' },
  ];
  const launch = () => LAUNCHES().find((row) => row.id === mine().launch) || LAUNCHES()[0];

  const valueOf = (key) => {
    if (key === 'coworks') return coworkLabel(cowork()) || t('campaign_home.no_cowork', 'No Cowork');
    if (key === 'new') return launch().label;
    return primaryCampaign(selection())?.title || t('campaign_home.no_campaign', 'No Campaign');
  };

  /* ---------- going through a door ---------- */
  const go = (key) => {
    if (!ctx) return;
    // The machine's settings are this Campaign's page — one Ronin, one Campaign today.
    if (key === 'machine') return void ctx.navigate('campaign');
    if (key === 'coworks') {
      const row = cowork();
      return void (row ? ctx.navigate('team', { param: row.name }) : ctx.navigate('cowork'));
    }
    // A LAUNCH IS A SURFACE IN THE COWORK WORKBENCH — the New Agent or New Team surface,
    // seated in workspace 1 there, with the Campaign already known.
    ctx.patchViewState('cowork', { seats: { workspace1: launch().seat } });
    ctx.navigate('cowork');
  };

  /* ---------- the tray ---------- */
  const rowsFor = (key) => {
    if (key === 'coworks') {
      const now = cowork()?.name;
      return coworksHere().map((row) => ({ id: row.name, label: coworkLabel(row), on: row.name === now }));
    }
    const now = launch().id;
    return LAUNCHES().map((row) => ({ id: row.id, label: row.label, on: row.id === now }));
  };

  const choose = (key, id, close = true) => {
    ctx?.patchViewState('home', key === 'coworks' ? { cowork: id } : { launch: id });
    if (close) open = '';
    paint();
  };

  const act = (key, id) => {
    choose(key, id);
    if (key === 'coworks') ctx?.navigate('team', { param: id });
    else go('new');
  };

  const create = () => {
    open = '';
    paint();
    ctx?.patchViewState('cowork', { seats: { workspace1: '@new-team' } });
    ctx?.navigate('cowork');
  };

  function paintTray() {
    tray.hidden = !open;
    if (!open) {
      delete tray.dataset.for;
      tray.replaceChildren();
      return;
    }
    tray.dataset.for = open;
    tray.replaceChildren();
    const key = open;
    const rows = rowsFor(key);
    for (const row of rows) {
      const line = el('div', 'ch-menu-row');
      line.dataset.loaded = String(row.on);
      const star = el('button', 'ch-menu-star', row.on ? '★' : '☆');
      star.type = 'button';
      star.dataset.on = String(row.on);
      star.setAttribute('aria-label', row.on ? 'The default' : `Make ${row.label} the default`);
      star.addEventListener('click', () => choose(key, row.id, false));
      const name = el('button', 'ch-menu-name', row.label);
      name.type = 'button';
      name.addEventListener('click', () => choose(key, row.id));
      const action = el('button', 'ch-menu-action', `▶ ${t('league.launch_team', 'Launch')}`);
      action.type = 'button';
      action.addEventListener('click', () => act(key, row.id));
      line.append(star, name, action);
      tray.append(line);
    }
    if (!rows.length) tray.append(el('p', 'ch-empty', t('campaign_home.tray_empty', 'Nothing here yet.')));
    if (key === 'coworks') {
      const foot = el('button', 'ch-menu-foot', `＋ New ${t('campaign.cowork', 'Cowork')}`);
      foot.type = 'button';
      foot.addEventListener('click', () => create());
      tray.append(foot);
    }
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

      // The machine door has no dial: one Campaign, so its chip just names it.
      const chip = el(door.key === 'machine' ? 'span' : 'button', 'ch-chip');
      if (door.key !== 'machine') {
        chip.type = 'button';
        chip.setAttribute('aria-label', t('campaign_home.change', 'Change'));
        chip.setAttribute('aria-expanded', String(open === door.key));
        chip.append(el('b', null, valueOf(door.key)), el('i', null, '▼'));
        chip.addEventListener('click', () => { open = open === door.key ? '' : door.key; paint(); });
      } else chip.append(el('b', null, valueOf(door.key)));

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
      // Ronin Home is above every workspace. Its bar is only the house mark; Cowork
      // identity, machine readings and workspace controls return when a door is opened.
      document.body.classList.add('ronin-home-active');
      open = '';
      paint();
      // Three reads, none of which the page waits on together: the Campaign list (which
      // synthesizes when no store answers yet), and the rosters/sessions behind them.
      await loadCampaigns();
      if (!entered) return;
      S.refreshWorkspaceHeader?.();
      paint();
      await refreshTeams();
      if (!entered) return;
      if (campaignsFailed()) root.dataset.failed = campaignsMessage();
      else delete root.dataset.failed;
      paint();
    },
    leave: () => {
      entered = false;
      open = '';
      document.body.classList.remove('ronin-home-active');
    },
    destroy: () => {
      entered = false;
      ctx = null;
      document.body.classList.remove('ronin-home-active');
    },
  };
}
