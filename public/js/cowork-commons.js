/* part of the ronin-cowork client — see js/README.md */
import { WorkspaceKit } from './workspace-kit.js';
import { buildProjectRoots } from './projectroots.js';
import { buildHotwords } from './hotwords.js';
import { buildKoshi } from './koshi.js';
import { buildMachineSettings } from './machine-settings.js';
import { buildStats } from './stats.js';
import { buildSystemPanel } from './system.js';
import { buildArchives } from './archives.js';
import { refreshHome } from './home.js';
import { askMika } from './mika.js';
import { S, serviceOff } from './state.js';
import { t } from './lexicon.js';
import { buildMessageQueue } from './message-queue.js';
import { choice } from './campaign-desk.js';
import { saveCampaign } from './campaigns.js';
import { setCampaignTheme, setTheme } from './theme.js';

export function coworkCommons(options = {}) {
  const { createTabbedSurface } = WorkspaceKit.primitives;

  const node = (tag, cls, text) => {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  };
  const pane = (id, extra = '') => {
    const d = node('div', `cc-pane ${extra}`.trim());
    d.dataset.tab = id;
    return d;
  };
  // `desk-<room>` is each room's own layout rule in style.css, unchanged from the desk;
  // the rooms moved surfaces, not names.
  const room = (cls) => node('div', `desk-pane ${cls} show`);
  const heading = (text) => node('h3', 'cc-h', text);

  // Which tab is on screen — the predicate every room polls on. A surface that is not
  // in the document (between placements) is not showing anything.
  let surface = null;
  const showing = (id) => () => !!surface && surface.el.isConnected && !surface.el.closest('[hidden]') && surface.current() === id;

  const atTile = (fn) => {
    const tile = S.active;
    if (tile) fn(tile);
  };

  const app = buildSystemPanel();

  // EACH TAB BUILDS ITS ROOMS ON FIRST ENTRY, not at page load. A room fetches when it
  // is built (hotwords reads its file, stats its window), and six tabs' worth of fetches
  // on every page load — on a page that may never open the commons — is what the desk's
  // per-tile build was rightly criticised for. `once` runs a builder the first time its
  // tab is entered and hands back the room for `enter` thereafter.
  const once = (build) => {
    let room;
    let built = false;
    return () => {
      if (!built) { built = true; room = build(); }
      return room;
    };
  };

  /* ---- Themes: the Campaign's pointer and touch surfaces ---- */
  const themes = pane('themes', 'cv-body');
  const themeOptions = () => [
    { value: 'light', label: t('campaign_view.theme_light', 'Light') },
    { value: 'dark', label: t('campaign_view.theme_dark', 'Dark') },
  ];
  const paintThemes = () => {
    const campaign = options.campaign?.();
    themes.replaceChildren();
    if (!campaign) {
      themes.append(node('p', 'cc-p', t('campaign_view.none_selected', 'No Campaign selected.')));
      return;
    }
    const save = (field) => async (value) => {
      const r = await saveCampaign(campaign.id, { desk: { [field]: value } });
      if (!r.ok) return paintThemes();
      const desk = options.campaign?.()?.desk || {};
      setCampaignTheme(desk);
      // A direct Setup-header choice is a device pin. Choosing the Campaign's
      // authoritative Desk theme releases that pin so the saved value can win now.
      setTheme('auto');
      paintThemes();
    };
    themes.append(
      choice(t('campaign_view.theme_desktop', 'Desktop'), themeOptions(), campaign.desk?.theme || 'light',
        t('campaign_view.theme_help', 'Light or dark for pointer surfaces.'), save('theme')),
      choice(t('campaign_view.theme_mobile', 'Mobile'), themeOptions(), campaign.desk?.theme_mobile || 'light',
        t('campaign_view.theme_mobile_help', 'Light or dark for touch surfaces — iPad and phone.'), save('theme_mobile')),
    );
  };

  /* ---- ▦ Desk: Ronin usage stats ---- */
  const health = pane('health');
  const healthRooms = once(() => {
    const stats = room('desk-stats');
    health.append(stats);
    return [buildStats(stats)];
  });

  /* ---- Account: the rest of the desk, AS IT WAS — the rail, and one room at a time ---- */
  // able to select what you wanted to see, so it wasn't just a long laundry list."* So the
  // desk's nav rail lives on inside this tab: rows on the left, one room on the right,
  // « to narrow the rail. Only what became a tab of its own left the rail.
  const account = pane('account', 'cc-rail');
  const appBox = (el) => {
    const box = room('cc-app');
    box.append(el);
    return box;
  };
  const ACCOUNT_ROWS = [
    { id: 'settei', label: t('pane.settei', 'Configuration'), glyph: '⚙', build: (host) => buildMachineSettings(host, showing('account')) },
    { id: 'release', label: t('desk.row_release', 'Release & update'), glyph: '↑', build: (host) => { host.append(appBox(app.release)); return app; } },
    { id: 'hotwords', label: t('pane.hotwords', 'Hotwords'), glyph: '▥', build: (host) => buildHotwords(host, showing('account')) },
    { id: 'koshi', label: t('pane.koshi', 'Koshi'), glyph: '目', build: (host) => buildKoshi(host, showing('account')) },
    { id: 'account', label: t('desk.log_out', 'Log out'), glyph: '⏻', build: (host) => { host.append(appBox(app.account)); return app; } },
  ];
  const nav = node('div', 'desk-nav');
  const railTop = node('div', 'desk-railtop');
  const railBtn = node('button', 'desk-railbtn', '«');
  railBtn.type = 'button';
  railBtn.title = t('desk.rail_collapse', 'Collapse the rail');
  railTop.append(railBtn);
  nav.append(railTop, node('div', 'desk-sep', t('desk.group_install', 'This install')));
  const content = node('div', 'desk-content');
  account.append(nav, content);
  let railed = false;
  railBtn.addEventListener('click', () => {
    railed = !railed;
    nav.classList.toggle('railed', railed);
    railBtn.textContent = railed ? '»' : '«';
    railBtn.title = railed ? t('desk.rail_expand', 'Expand the rail') : t('desk.rail_collapse', 'Collapse the rail');
  });
  const accountRows = {};
  const accountPanes = {};
  const accountRoom = {};
  let accountShowing = 'settei';
  const showAccount = (id) => {
    accountShowing = id;
    for (const [rid, b] of Object.entries(accountRows)) b.classList.toggle('on', rid === id);
    for (const [rid, p] of Object.entries(accountPanes)) p.classList.toggle('show', rid === id);
    const row = ACCOUNT_ROWS.find((r) => r.id === id);
    if (row && !accountRoom[id]) accountRoom[id] = row.build(accountPanes[id]) || {};
    accountRoom[id]?.enter?.();
  };
  for (const r of ACCOUNT_ROWS) {
    const b = node('button', 'desk-row');
    b.type = 'button';
    b.dataset.room = r.id;
    b.append(node('b', '', r.glyph), node('span', '', r.label));
    if (serviceOff(r.id)) {
      b.classList.add('off');
      b.disabled = true;
      b.setAttribute('aria-label', t('commons.tab_off', '{tab} — off, this service is not installed.', { tab: r.label }));
    } else b.addEventListener('click', () => showAccount(r.id));
    accountRows[r.id] = b;
    nav.append(b);
    const p = room(`desk-${r.id}`);
    p.classList.remove('show');
    p.dataset.room = r.id;
    accountPanes[r.id] = p;
    content.append(p);
  }
  const accountRooms = once(() => { showAccount(accountShowing); return []; });
  const accountEnter = () => { accountRooms(); showAccount(accountShowing); };

  /* ---- Archived — retained here; the Team roster moved to the Cowork workbench. ---- */
  const seatAdapter = { index: 'cc', connect: (name) => (S.connectSession ? S.connectSession(name) : atTile((tile) => tile.connect(name))) };
  const archivesPane = pane('archives');
  const archivesRooms = once(() => {
    const host = node('div', 'home-archives');
    archivesPane.append(host);
    return [buildArchives(seatAdapter, host)];
  });

  /* ---- Messages: inbound session delivery that has not cleared ---- */
  const messages = pane('messages');
  const messageRooms = once(() => [buildMessageQueue(messages, showing('messages'))]);

  /* ---- Help desk: Mika, over a reserved chat ---- */
  const help = pane('help', 'cc-stack');
  const helpRooms = once(() => {
    const mikaBox = room('cc-app');
    const mikaBtn = node('button', 'cc-btn', t('cowork.mika_button', 'ミ Ask Mika'));
    mikaBtn.type = 'button';
    mikaBtn.addEventListener('click', () => atTile((tile) => void askMika(tile)));
    mikaBox.append(
      node('p', 'cc-p', t('cowork.mika_text', 'Ask about Ronin itself — how it works, workspace folders, starting a session, changing a setting. She starts if she is not up.')),
      mikaBtn,
    );
    // RESERVED, like the team commons' Chat: geometry promised, no transcript, no composer,
    // no protocol implied. Mika's chat lands here when it is designed; until then this is
    // empty on purpose, not unfinished.
    const chat = node('div', 'cc-chat');
    chat.dataset.reserved = '';
    help.append(heading(t('cowork.h_mika', 'Mika Assist')), mikaBox, chat);
    return [];
  });

  /* ---- く Keypad, inline ---- */
  // LAZILY too, and for a second reason: this surface is built when the team view
  // registers, before the bar is assembled and `buildPadPanel` has run (js/layout.js). So
  // the card is taken the first time the tab is looked at — and the pad's open/isOpen
  // learn to mean this tab then.
  const keypad = pane('keypad');
  const padMissing = node('p', 'cc-p', t('cowork.keypad_missing', 'The keypad did not build on this page.'));
  keypad.append(padMissing);
  const mountPad = () => {
    const card = S.padPanel?.card;
    if (!card || keypad.contains(card)) return !!card;
    card.removeAttribute('role'); // a card in a tab is not a dialog
    padMissing.remove();
    keypad.append(card);
    // THE CARD NOW LIVES IN THIS TAB, so the pad's own sheet is no longer the truth about
    // whether the keypad is on screen — this tab is. Both hooks therefore answer from the
    // tab set: `open` selects the Keypad tab, `isOpen` reports whether it is the one
    // showing. Before this runs the card is still in the sheet and padpanel.js's own
    // open/isOpen are correct, so the bridge is built exactly when it becomes true.
    S.padPanel.open = () => { surface?.select('keypad'); };
    S.padPanel.isOpen = showing('keypad');
    return true;
  };

  const enterAll = (rooms) => () => { for (const r of rooms() || []) r?.enter?.(); };
  const service = (el, enter) => ({ el, mount: () => {}, enter: () => enter?.(), leave: () => {}, destroy: () => {} });
  const services = {
    themes: service(themes, paintThemes),
    health: service(health, enterAll(healthRooms)),
    account: service(account, accountEnter),
    archives: service(archivesPane, enterAll(archivesRooms)),
    messages: service(messages, enterAll(messageRooms)),
    help: service(help, enterAll(helpRooms)),
    keypad: service(keypad, () => { if (mountPad()) S.padPanel.render?.(); }),
  };
  // The caller names the tabs it wants; Desk profile and Workspace folders are surfaces
  // of their own (js/campaign-view.js) and are no longer built here at all.
  const wanted = Array.isArray(options.tabs) && options.tabs.length ? new Set(options.tabs) : null;
  const tabs = [
    { id: 'themes', label: t('cowork.tab_themes', 'Themes') },
    { id: 'health', label: t('cowork.tab_health', 'Desk') },
    { id: 'account', label: t('cowork.tab_account', 'Account') },
    { id: 'archives', label: t('cowork.tab_archives', 'Archived') },
    { id: 'messages', label: t('cowork.tab_messages', 'Messages') },
    { id: 'help', label: t('cowork.tab_help', 'Help desk') },
    { id: 'keypad', label: t('cowork.tab_keypad', 'Keypad') },
  ].filter((c) => (!wanted || wanted.has(c.id)) && (c.id !== 'themes' || options.campaign))
    // Stats is off only when its service is not installed, the same test and the same
    // words the Account rows above use. `serviceOff` takes a pane name: this tab's id is
    // `health`, the pane is `stats`.
    .map((c) => (c.id === 'health' && serviceOff('stats')
      ? { ...c, panel: services[c.id], disabled: true, title: t('commons.tab_off', '{tab} — off, this service is not installed.', { tab: c.label }) }
      : { ...c, panel: services[c.id] }));
  // The tab set's `select` enters the room it lands on, by click, keyboard or code alike,
  // so nothing here patches `select` or listens on the strip to make up for it.
  surface = createTabbedSurface({
    label: options.label,
    tabs,
    selected: tabs[0]?.id || 'health',
  });
  surface.el.classList.add('cc');
  // Nothing is entered here: the first `select` — the destination's enter — enters the
  // landing tab, so no room fetches on a page load.
  return surface;
}
