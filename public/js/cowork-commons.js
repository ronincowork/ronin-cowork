/* part of the ronin-cowork client — see js/README.md */
import { WorkspaceKit } from './workspace-kit.js';
import { buildProjectRoots } from './projectroots.js';
import { buildHotwords } from './hotwords.js';
import { buildKoshi } from './koshi.js';
import { buildGbrain } from './gbrain.js';
import { buildSettei } from './settei.js';
import { buildStats } from './stats.js';
import { buildSystemPanel } from './system.js';
import { askMika } from './mika.js';
import { S } from './state.js';
import { t } from './lexicon.js';

/**
 * THE COWORK COMMONS — the install's shared surface, a `workspace_surface` (owner,
 * 2026-08-27; docs/cowork-space.md; KOTOBA `cowork_commons`).
 *
 * It is the `admin_desk` re-hung. The desk was one nav rail over eleven rows and an
 * OVERLAY a tile drew on itself; the owner's ruling: *"too many things in one thing … it
 * should be another workspace alternative"*. So this is the Kit's channel surface — the
 * same primitive, strip and look as the `team_commons` — with SIX tabs, and it sits IN a
 * workspace (`team-view.js` places it; the grid page shows it as the `cowork` destination).
 * No room is rewritten: each tab hangs the room builders the desk already had.
 *
 *   Machine health   ▦ Stats
 *   Account          "the rest, as the current Admin Desk" (owner): ⚙ Configuration ·
 *                    ◐ Appearance · ↑ Release & update · ▥ Hotwords · 目 Koshi · ◇ gbrain ·
 *                    ⏻ Log out
 *   Desk profile     ◫ the profile picker (js/system.js, kokugo's row)
 *   Project roots    ▣ Project roots
 *   Help desk        ミ Mika — *"the Mika assistant, but that can be a holding place now
 *                    for chat"* (owner): her door, over a RESERVED chat area, empty on
 *                    purpose like the team commons' Chat
 *   Keypad           く the pad panel, INLINE (owner: *"no reason to have it separate"*) —
 *                    padpanel.js still builds the card; this tab is where the card lives
 *
 * ONE INSTANCE. A surface element can be in one place at a time, and the two doors
 * (⚙ on the team page, ⚙ on the grid page) must show the same thing with the same state,
 * so `coworkCommons()` is memoised and both callers place the one element.
 *
 * WHERE AN ASK GOES. gbrain's "ask a PersonalAssistant" used to be handed the desk's own
 * tile; a surface has no tile, so the ask goes to the ACTIVE tile's Commons launcher
 * (`S.active.askPersonalAssistant`), which is where that tile sent it anyway. Mika is
 * asked through `askMika(S.active)`, the way the bar's ミ did before it left (2026-08-27).
 */
let instance = null;

export function coworkCommons() {
  if (instance) return instance;
  const { createChannelSurface } = WorkspaceKit.primitives;

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

  // AN ASK CROSSES SURFACES: on the grid page the commons is the `cowork` destination, and
  // the tile the ask lands in is on the Sessions destination behind it — so go back first,
  // or the launcher opens filled-in and invisible (smoke-ui's gbrain journey is the record).
  const atTile = (fn) => {
    if (S.workspace?.active?.id === 'cowork') S.workspace.back();
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

  /* ---- ▦ Machine health ---- */
  const health = pane('health');
  const healthRooms = once(() => {
    const stats = room('desk-stats');
    health.append(stats);
    return [buildStats(stats)];
  });

  /* ---- Account: the rest of the desk, as it was ---- */
  const account = pane('account', 'cc-stack');
  const appBox = (el) => {
    const box = room('cc-app');
    box.append(el);
    return box;
  };
  const accountRooms = once(() => {
    const settei = room('desk-settei');
    const hotwords = room('desk-hotwords');
    const koshi = room('desk-koshi');
    const gbrain = room('desk-gbrain');
    account.append(
      heading(t('cowork.h_configuration', 'Configuration')), settei,
      heading(t('cowork.h_appearance', 'Appearance')), appBox(app.appearance),
      heading(t('cowork.h_release', 'Release & update')), appBox(app.release),
      heading(t('cowork.h_hotwords', 'Hotwords')), hotwords,
      heading(t('cowork.h_koshi', 'Koshi')), koshi,
      heading(t('cowork.h_gbrain', 'gbrain')), gbrain,
      heading(t('cowork.h_log_out', 'Log out')), appBox(app.account),
    );
    return [
      buildSettei(settei, showing('account')),
      buildHotwords(hotwords, showing('account')),
      buildKoshi(koshi, showing('account')),
      buildGbrain(gbrain, showing('account'), (prompt) => atTile((tile) => tile.askPersonalAssistant?.(prompt))),
      app,
    ];
  });

  /* ---- ◫ Desk profile ---- */
  const profile = pane('profile', 'cc-stack');
  const profileRooms = once(() => {
    profile.append(appBox(app.profile));
    return [app];
  });

  /* ---- ▣ Project roots ---- */
  const roots = pane('roots');
  const rootsRooms = once(() => {
    const proj = room('desk-proj');
    roots.append(proj);
    // No tile of its own: projectroots falls back to the active tile for its ask.
    return [buildProjectRoots(proj, showing('roots'), null)];
  });

  /* ---- Help desk: Mika, over a reserved chat ---- */
  const help = pane('help', 'cc-stack');
  const helpRooms = once(() => {
    const mikaBox = room('cc-app');
    const mikaBtn = node('button', 'cc-btn', t('cowork.mika_button', 'ミ Ask Mika'));
    mikaBtn.type = 'button';
    mikaBtn.addEventListener('click', () => atTile((tile) => void askMika(tile)));
    mikaBox.append(
      node('p', 'cc-p', t('cowork.mika_text', 'Ask about Ronin itself — how it works, project roots, starting a session, changing a setting. She starts if she is not up.')),
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
    S.padPanel.open = () => S.showCoworkCommons?.('keypad');
    S.padPanel.isOpen = showing('keypad');
    return true;
  };

  const enterAll = (rooms) => () => { for (const r of rooms() || []) r?.enter?.(); };
  const service = (el, enter) => ({ el, mount: () => {}, enter: () => enter?.(), leave: () => {}, destroy: () => {} });
  const services = {
    health: service(health, enterAll(healthRooms)),
    account: service(account, enterAll(accountRooms)),
    profile: service(profile, enterAll(profileRooms)),
    roots: service(roots, enterAll(rootsRooms)),
    help: service(help, enterAll(helpRooms)),
    keypad: service(keypad, () => { if (mountPad()) S.padPanel.render?.(); }),
  };
  surface = createChannelSurface({
    label: t('cowork.commons', 'Cowork commons'),
    channels: [
      { id: 'health', label: t('cowork.tab_health', 'Machine health') },
      { id: 'account', label: t('cowork.tab_account', 'Account') },
      { id: 'profile', label: t('cowork.tab_profile', 'Desk profile') },
      { id: 'roots', label: t('cowork.tab_roots', 'Project roots') },
      { id: 'help', label: t('cowork.tab_help', 'Help desk') },
      { id: 'keypad', label: t('cowork.tab_keypad', 'Keypad') },
    ],
    selected: 'health',
    services,
  });
  surface.el.classList.add('cc');
  // Entering a tab is the room's `enter` — the strip's select does not call the hook, so
  // the surface does it: what the desk's `show()` did per row, per tab here.
  const rawSelect = surface.select;
  surface.select = (id) => {
    const picked = rawSelect(id);
    services[picked]?.enter?.();
    return picked;
  };
  surface.tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.wk-channel-service-tab');
    if (tab) services[surface.current()]?.enter?.();
  });
  // THE PAD'S OPEN/ISOPEN MEAN THIS TAB NOW (set in `mountPad`): `S.padPanel.open()` (a
  // bound pad key, the pad's own ask) shows the cowork commons on Keypad wherever the page
  // can show it — `S.showCoworkCommons` is set by the page (team-view.js / layout.js);
  // `isOpen` is the pad key handler's "you are working the pad" test (layout.js).
  // Nothing is entered here: the first `select` — the cowork destination's enter, or the
  // team page's putCowork — enters the landing tab, so no room fetches on a page load.
  instance = surface;
  return instance;
}

/** The names a draft may use for a tab (`workspace2=cowork:roots`) — team-arrange.js reads this. */
export const COWORK_TABS = Object.freeze({
  health: 'health', account: 'account', profile: 'profile', roots: 'roots', help: 'help', keypad: 'keypad',
});
