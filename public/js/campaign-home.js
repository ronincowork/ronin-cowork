/* part of the ronin-cowork client — see js/README.md */
/** RONIN HOME — the quiet root arrival and three direct doors out of it. */
import { t } from './lexicon.js';
import { request } from './request.js';
import { createReleaseUpdateController, packageReading } from './release-update-controller.js';
import { createSenmaida } from './senmaida.js';
import { createThemeToggle } from './theme-toggle.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

function DOORS() {
  return [
    { key: 'campaign', route: 'campaign', glyph: 'gear', name: t('campaign_home.machine_settings', 'Machine Settings'), is: t('campaign_home.campaign_is', 'Admin Desk configuration') },
    { key: 'coworks', route: 'cowork', glyph: '人人', name: t('campaign.coworks', 'Teams'), is: t('campaign_home.coworks_is', 'Your Teams and Agents') },
    { key: 'launch', route: 'launch', glyph: '人', name: t('campaign_home.launch', 'New Project'), is: t('campaign_home.launch_is', 'Start a new Team or Agent') },
  ];
}

export const setupDefaultView = (activatedCount) => Number(activatedCount) >= 1 ? 'campaign' : 'setup';

/** The machine door's house mark: a wheel with eight broad teeth, recognisably admin
 * without importing a platform emoji or turning into a literal vehicle silhouette. */
function doorGlyph(glyph) {
  const host = el('span', 'ch-glyph');
  host.setAttribute('aria-hidden', 'true');
  if (glyph !== 'gear') {
    host.textContent = glyph;
    return host;
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('focusable', 'false');
  const wheel = document.createElementNS(ns, 'path');
  wheel.setAttribute('d', 'M16 2v5M16 25v5M2 16h5M25 16h5M6.1 6.1l3.6 3.6M22.3 22.3l3.6 3.6M25.9 6.1l-3.6 3.6M9.7 22.3l-3.6 3.6M26 16a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z');
  svg.append(wheel);
  host.append(svg);
  return host;
}

export function createCampaignHome() {
  const themeToggle = createThemeToggle();
  const root = el('main', 'ch-view');
  root.append(createSenmaida('page', 'ch-horizon'));
  const frame = el('div', 'ch-frame');
  const doors = el('div', 'ch-doors');
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
  root.append(frame, release);

  let ctx = null;
  let entered = false;
  let activatedCount = 0;
  let runtimeKnown = false;

  function paintDoors() {
    doors.replaceChildren();
    for (const door of DOORS()) {
      const card = el('a', 'ch-door');
      const locked = door.key !== 'campaign' && (!runtimeKnown || activatedCount < 1);
      const route = door.key === 'campaign' ? setupDefaultView(activatedCount) : door.route;
      const name = door.key === 'campaign' && route === 'setup'
        ? t('campaign_home.machine_setup', 'Machine Setup') : door.name;
      const reading = door.key === 'campaign' && route === 'setup'
        ? t('campaign_home.setup_is', 'Install and authenticate a model provider') : door.is;
      card.href = `#/${route}`;
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
      void request('/api/setup/runtime', { cache: 'no-store' }).then((result) => {
        if (!entered) return;
        runtimeKnown = result.ok;
        activatedCount = result.ok ? Number(result.data?.activated_count) || 0 : 0;
        paintDoors();
      });
    },
    leave: () => { entered = false; },
    destroy: () => { entered = false; ctx = null; },
  };
}
