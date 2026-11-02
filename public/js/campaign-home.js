/* part of the ronin-cowork client — see js/README.md */
/**
 * RONIN HOME — the quiet root arrival and its doors out (PATTERNS.md, Home; owner, 2026-10-19).
 * THE OFFICE (owner, 2026-11-02; KAN-186, KAN-191, KAN-194): three stones in a triangle read Who,
 * What, Where: Teams (who does the work) on top, Epics (what the work is) bottom left, Workspaces
 * (where the work is) bottom right, at Home's stone size with even room between them, no heading,
 * a little left of centre; Model Providers, Help and Settings three smaller stones in a vertical
 * line on the right of the page, inset from its edge. Home stays a page; each door opens its own
 * workbench in this tab (door-workbenches.js), the bar reading RoninCowork • Home • <door>
 * with Home the way back. A door is a link: a plain press navigates here, a modified press
 * opens the workbench in a new tab. THE GATE (owner, 2026-10-19, "let's have the gate"): as on
 * the old root, the doors are locked until one model provider is activated, Settings the one
 * live stone, so a new user's way in is Setup. Help is the one door outside the gate: a new user
 * needs it before Setup (owner, 2026-10-21). Settings opens Setup until its answers are recorded,
 * Settings after (`setupDefaultView`). TWO ROOTS (owner, 2026-10-19): this is the default root;
 * the current root (current-home.js, Home as it was before 2026-10-18) keeps its own address,
 * and one plain toggle in the bar, the same spot on each, swaps between them while pieces move
 * from Current to Next: it reads Current here and Next there.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { createReleaseUpdateController, packageReading } from './release-update-controller.js';
import { createSenmaida } from './senmaida.js';
import { createThemeToggle } from './theme-toggle.js';
import { campaignById, loadCampaigns, normalizeSelection, setupDefaultView } from './campaigns.js';
import { workbenchLaunchUrl } from './workspace.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

/** The office: the triangle, Teams at its apex. */
function OFFICE() {
  return [
    { key: 'teams', route: 'cowork', glyph: '人人', name: t('campaign_home.teams', 'Teams'), is: t('campaign_home.teams_is', 'Who does the work') },
    { key: 'epics', route: 'epics', glyph: '◇', name: t('campaign_home.epics', 'Epics'), is: t('campaign_home.epics_is', 'What the work is') },
    { key: 'workspaces', route: 'workspaces', glyph: '⌂', name: t('campaign_home.workspaces', 'Workspaces'), is: t('campaign_home.workspaces_is', 'Where the work is') },
  ];
}

/** The smaller stones on the right, one above the other. Settings' route is read at paint. */
function SIDE() {
  return [
    { key: 'models', route: 'models', glyph: '✶', name: t('campaign_home.model_providers', 'Model Providers'), is: t('campaign_home.models_is', 'Model providers on this machine: install, sign in, choose') },
    { key: 'help', route: 'help', glyph: 'ミ', name: t('campaign_home.help', 'Help'), is: t('campaign_home.help_is', 'The guides, and Mika to ask'), gated: false },
    { key: 'settings', route: null, glyph: '⚙', name: t('campaign_home.settings', 'Settings'), is: t('campaign_home.settings_is', 'Setup, and this machine’s settings'), gated: false },
  ];
}

/** THE ROOT TOGGLE: a plain bar link to the other root, one press; a modified press is the browser's. */
export function createRootToggle({ route, label, navigate }) {
  const link = el('a', 'ui-bar-nav', label());
  link.href = `#/${route}`;
  link.dataset.rootToggle = route;
  link.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(route);
  });
  return link;
}

function doorGlyph(glyph) {
  const host = el('span', 'ch-glyph');
  host.setAttribute('aria-hidden', 'true');
  host.textContent = glyph;
  return host;
}

export function createCampaignHome() {
  const themeToggle = createThemeToggle();
  const rootToggle = createRootToggle({ route: 'current', label: () => t('campaign_home.current', 'Current'), navigate: (route) => ctx?.navigate(route) });
  const root = el('main', 'ch-view');
  root.append(createSenmaida('page', 'ch-horizon'));
  const frame = el('div', 'ch-frame');
  const doors = el('div', 'ch-doors');
  const side = el('nav', 'ch-side');
  side.setAttribute('aria-label', t('campaign_home.side', 'Models, Help and Settings'));
  const release = el('div', 'ch-release');
  const check = el('button', 'ch-update', t('campaign_home.check_updates', 'Check for updates'));
  const answer = el('span', 'ch-update-answer');
  check.type = 'button';
  const readings = el('div', 'ch-update-readings');
  readings.hidden = true;
  answer.hidden = true;
  const controls = {};
  for (const pkg of ['cowork', 'services']) {
    const line = el('div', 'ch-update-package');
    const text = el('span', 'ch-update-reading');
    const update = el('button', 'ch-update', `Update ${pkg === 'cowork' ? 'Cowork' : 'Services'}`);
    update.type = 'button';
    update.hidden = true;
    update.addEventListener('click', () => void updates.run(pkg));
    line.append(text, update);
    readings.append(line);
    controls[pkg] = { text, update };
  }
  answer.setAttribute('aria-live', 'polite');
  readings.setAttribute('aria-live', 'polite');
  release.append(readings, answer, check);
  frame.append(doors);
  root.append(frame, side, release);

  let ctx = null;
  let entered = false;
  let activatedCount = 0;
  let runtimeKnown = false;
  let setupCampaign = null;

  // A DOOR IS A LINK to its workbench: pressed, it navigates this tab; with a modifier it
  // opens the workbench in a new tab through the same request the bar's doors carry. Until
  // one model provider is activated the door is locked and says where the way in is.
  function stone(door, small) {
    const card = el('a', small ? 'ch-door ch-door-small' : 'ch-door');
    const locked = door.gated !== false && (!runtimeKnown || activatedCount < 1);
    const route = door.route || setupDefaultView(setupCampaign);
    card.href = workbenchLaunchUrl({ destination: route, mode: 'overlay' });
    card.dataset.door = door.key;
    if (locked) {
      card.dataset.unavailable = 'true';
      card.setAttribute('aria-disabled', 'true');
    }
    card.append(doorGlyph(door.glyph), el('h2', null, door.name), el('p', 'ch-is', door.is));
    if (locked) card.append(el('p', 'ch-gate', t('setup.provider_gate', 'Activate one model provider in Machine Setup to use this.')));
    card.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (locked) return;
      ctx?.navigate(route);
    });
    return card;
  }
  function paintDoors() {
    doors.replaceChildren(...OFFICE().map((one) => stone(one, false)));
    side.replaceChildren(...SIDE().map((one) => stone(one, true)));
  }

  const updates = createReleaseUpdateController({ onChange: state => {
    check.setAttribute('aria-disabled', String(state.busy));
    answer.textContent = state.message;
    answer.hidden = !state.message;
    readings.hidden = !state.facts;
    answer.dataset.state = state.bad ? 'failed' : '';
    for (const pkg of ['cowork', 'services']) {
      const fact = packageReading(state.facts?.[pkg]);
      const { text, update } = controls[pkg];
      const installed = state.facts?.[pkg]?.installed;
      const detail = state.canUpdate ? fact.text : (fact.available ? `${state.facts[pkg].latest} available · This installation cannot be updated here.` : fact.text);
      text.textContent = `Ronin ${pkg === 'cowork' ? 'Cowork' : 'Services'} — ${installed && !state.canUpdate && fact.available ? `Installed ${installed} · ` : ''}${detail}`;
      text.dataset.state = fact.state;
      update.hidden = !fact.available || !state.canUpdate;
      update.disabled = !state.canUpdate || state.busy;
      update.title = '';
    }
  }});
  check.addEventListener('click', () => void updates.check());

  return {
    el: root,
    glyph: '⛩',
    title: () => t('campaign_home.ronin_home', 'Ronin Home'),
    header: { leading: [rootToggle], actions: [themeToggle] },
    enter: (context) => {
      ctx = context;
      entered = true;
      paintDoors();
      void Promise.all([request('/api/setup/runtime', { cache: 'no-store' }), loadCampaigns()]).then(([result]) => {
        if (!entered) return;
        runtimeKnown = result.ok;
        activatedCount = result.ok ? Number(result.data?.activated_count) || 0 : 0;
        setupCampaign = campaignById(normalizeSelection(ctx?.state?.campaignSelection).primary_campaign_id);
        paintDoors();
      });
    },
    leave: () => { entered = false; },
    destroy: () => { entered = false; ctx = null; },
  };
}
