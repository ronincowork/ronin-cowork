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
    { key: 'campaign', route: 'campaign', glyph: '⛩', name: t('campaign_home.machine_settings', 'Machine Settings'), is: t('campaign_home.campaign_is', 'Admin Desk configuration') },
    { key: 'coworks', route: 'cowork', glyph: '人々', name: t('campaign.coworks', 'Coworks'), is: t('campaign_home.coworks_is', 'Coworking space for Agents') },
    { key: 'launch', route: 'launch', glyph: '人', name: t('campaign_home.launch', 'Launch'), is: t('campaign_home.launch_is', 'Start a new Team or Agent') },
  ];
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
      const card = el('button', 'ch-door');
      card.type = 'button';
      card.dataset.door = door.key;
      card.append(el('span', 'ch-glyph', door.glyph), el('h2', null, door.name), el('p', 'ch-is', door.is));
      card.addEventListener('click', () => ctx?.navigate(door.route));
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
