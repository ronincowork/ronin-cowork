/* part of the ronin-cowork client — see js/README.md */
/** RONIN HOME — the quiet root arrival and three direct doors out of it. */
import { t } from './lexicon.js';
import { request } from './request.js';
import { createReleaseUpdateController, packageReading } from './release-update-controller.js';
import { createSenmaida } from './senmaida.js';
import { createThemeToggle } from './theme-toggle.js';
import { campaignById, loadCampaigns, normalizeSelection } from './campaigns.js';
import { workbenchLaunchUrl } from './workspace.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

function DOORS() {
  return [
    { key: 'desk', route: 'cowork', glyph: '⛩', name: t('campaign_home.desk', 'Desk'), is: t('campaign_home.desk_is', 'All Teams, Agents, and work') },
    { key: 'team', route: 'cowork', glyph: '人人', name: t('campaign_home.team', 'Team'), is: t('campaign_home.team_is', 'Choose a Team and open its Workbench') },
    { key: 'agent', route: 'cowork', glyph: '人', name: t('campaign_home.agent', 'Agent'), is: t('campaign_home.agent_is', 'Choose an Agent and open its Workbench') },
  ];
}

export const setupDefaultView = (campaign) => {
  const answers = campaign?.config?.setup?.answers || {};
  return ['provider', 'register', 'workspace', 'installations', 'password'].every((id) => answers[id]) ? 'campaign' : 'setup';
};

function doorGlyph(glyph) {
  const host = el('span', 'ch-glyph');
  host.setAttribute('aria-hidden', 'true');
  host.textContent = glyph;
  return host;
}

export function createCampaignHome() {
  const themeToggle = createThemeToggle();
  const root = el('main', 'ch-view');
  root.append(createSenmaida('page', 'ch-horizon'));
  const frame = el('div', 'ch-frame');
  const doors = el('div', 'ch-doors');
  const settings = el('button', 'ch-settings', t('campaign_home.settings', 'Settings'));
  settings.type = 'button';
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
  root.append(frame, settings, release);

  let ctx = null;
  let entered = false;
  let activatedCount = 0;
  let runtimeKnown = false;
  let setupCampaign = null;

  function paintDoors() {
    doors.replaceChildren();
    for (const door of DOORS()) {
      const card = el('a', 'ch-door');
      const locked = !runtimeKnown || activatedCount < 1;
      const route = door.route;
      const name = door.name;
      const reading = door.is;
      card.href = workbenchLaunchUrl({ destination: route, mode: 'overlay' });
      card.dataset.door = door.key;
      if (locked) {
        card.dataset.unavailable = 'true';
        card.setAttribute('aria-disabled', 'true');
      }
      card.append(doorGlyph(door.glyph), el('h2', null, name), el('p', 'ch-is', reading));
      if (locked) card.append(el('p', 'ch-gate', t('setup.provider_gate', 'Activate one model provider in Machine Setup to use this.')));
      card.addEventListener('click', (event) => {
        // Modified clicks belong to the browser: new tab/window, link menu, middle click.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (locked) return;
        ctx?.navigate(route);
      });
      doors.append(card);
    }
  }

  settings.addEventListener('click', () => {
    const route = setupDefaultView(setupCampaign);
    ctx?.navigate(route);
  });

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
    header: { actions: [themeToggle] },
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
