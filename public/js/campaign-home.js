/* part of the ronin-cowork client — see js/README.md */
/** RONIN HOME — the quiet root arrival and three direct doors out of it. */
import { t } from './lexicon.js';
import { request } from './request.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

function DOORS() {
  return [
    { key: 'campaign', route: 'campaign', glyph: 'gear', name: t('campaign_home.machine_settings', 'Machine Settings'), is: t('campaign_home.campaign_is', 'Admin Desk configuration') },
    { key: 'coworks', route: 'cowork', glyph: '人人', name: t('campaign.coworks', 'Coworks'), is: t('campaign_home.coworks_is', 'Coworking space for Agents') },
    { key: 'launch', route: 'launch', glyph: '人', name: t('campaign_home.launch', 'New Project'), is: t('campaign_home.launch_is', 'Start a new Team or Agent') },
  ];
}

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
  const root = el('main', 'ch-view');
  const frame = el('div', 'ch-frame');
  const doors = el('div', 'ch-doors');
  const release = el('div', 'ch-release');
  const version = el('span', 'ch-version', t('campaign_home.version', 'v1.3'));
  const check = el('button', 'ch-update', t('campaign_home.check_updates', 'Check for updates'));
  const answer = el('span', 'ch-update-answer');
  check.type = 'button';
  release.append(version, check, answer);
  frame.append(doors);
  root.append(frame, release);

  let ctx = null;
  let entered = false;

  function paintDoors() {
    doors.replaceChildren();
    for (const door of DOORS()) {
      const card = el('a', 'ch-door');
      card.href = `#/${door.route}`;
      card.dataset.door = door.key;
      card.append(doorGlyph(door.glyph), el('h2', null, door.name), el('p', 'ch-is', door.is));
      card.addEventListener('click', (event) => {
        // Modified clicks belong to the browser: new tab/window, link menu, middle click.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        ctx?.navigate(door.route);
      });
      doors.append(card);
    }
  }

  const checkUpdates = async () => {
    check.disabled = true;
    answer.dataset.state = 'working';
    answer.textContent = t('campaign_home.checking', 'Checking…');
    const result = await request('/api/update/check', { cache: 'no-store' });
    if (!entered) return;
    if (!result.ok) {
      answer.dataset.state = 'failed';
      answer.textContent = result.status === 404
        ? t('campaign_home.check_unavailable', 'Available after the next restart')
        : result.message;
    } else if (!result.data.latest || result.data.upToDate) {
      answer.dataset.state = 'ready';
      answer.textContent = t('campaign_home.up_to_date', 'Up to date');
    } else {
      answer.dataset.state = 'available';
      answer.textContent = t('campaign_home.update_available', '{version} available', { version: result.data.latest });
    }
    check.disabled = false;
  };
  check.addEventListener('click', () => void checkUpdates());

  return {
    el: root,
    glyph: '⛩',
    // The ViewHost adds the house name. Empty keeps the root tab exactly "Ronin".
    title: () => '',
    enter: (context) => {
      ctx = context;
      entered = true;
      document.body.classList.add('ronin-home-active');
      answer.textContent = '';
      delete answer.dataset.state;
      check.disabled = false;
      paintDoors();
    },
    leave: () => { entered = false; document.body.classList.remove('ronin-home-active'); },
    destroy: () => { entered = false; ctx = null; document.body.classList.remove('ronin-home-active'); },
  };
}
