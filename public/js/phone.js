/* part of the ronin-cowork client — see js/README.md */
/**
 * THE MOBILE DOCUMENT'S ENTRY MODULE. `mobile.html` holds the bar and an empty main; this
 * module fills them and routes the phone's screens. Nothing here decides "phone": the server
 * sent this document because the request came from one (src/index.ts), so the first frame the
 * browser paints is already the mobile bar.
 *
 * ONE LIST IS THE FRONT DOOR (plan ronin_cowork/phone-lists, KAN-818): three questions across
 * the top — Type (the grouping: Team, Epic, Workspace), Kind (each row: Agent, Lead, Item) and
 * Sort (By type: one card per Team, Epic or Workspace; By active: one card each for Flagged,
 * Active, Recently active, Everyone else). A card pressed opens in place to its rows; pressed
 * again it closes; several stay open. An Agent's row opens its tile, an item's row its item
 * screen. Screens, one at a time: the list · a Team's Docs · an item · an Agent's tile ·
 * Feedback. On the tile the head is hidden and the bar carries the head's reading toggle and メ
 * control, RELOCATED not cloned; メ opens the same menu as on a desk (js/menu.js).
 */
import { trackAppHeight } from './appheight.js';
import { request } from './request.js';
import { guard, showFailure } from './errors.js';
import { sayWhenUnreachable, sessionsHandlers } from './events.js';
import { connect, subscribe as hear } from './store.js';
import { membersOfTeam, subscribe, teamByName, teamsFromState, UNASSIGNED } from './team-controller.js';
import { agentLabel, cardsByName, readable, rosterGroups, rosterMark, rosterQuestions, rosterRowClass, situationOf, teamLabel, teamsOfItem } from './roster-lists.js';
import { loadProjects, onAgeTick, projectData, situationTitle } from './home.js';
import { buildDocs } from './docs.js';
import { createTerminalTileHost } from './terminal-tile-host.js';
import { closeMenu } from './menu.js';
import { S } from './state.js';
import { t } from './lexicon.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createFeedbackSurface } from './feedback.js';
import { createKeyedList } from './workspace-primitives.js';
import { ask } from './ask.js';
import { splitItemTitle } from './item-title.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

/** #/ · #/d/<team> · #/s/<agent> · #/i/<item> · #/feedback — anything else is the list. */
const routeFromHash = () => {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  if (parts[0] === 'feedback') return { screen: 'feedback' };
  if (parts[0] === 'd' && parts[1]) return { screen: 'docs', team: parts[1] };
  if (parts[0] === 's' && parts[1]) return { screen: 'terminal', session: parts[1] };
  if (parts[0] === 'i' && parts[1]) return { screen: 'item', item: parts[1] };
  return { screen: 'list' };
};
const docsHash = (team) => '#/d/' + encodeURIComponent(team);
const sessionHash = (session) => '#/s/' + encodeURIComponent(session);
const itemHash = (id) => '#/i/' + encodeURIComponent(id);

export async function buildPhone() {
  // The visible height before anything is laid out in it — see js/appheight.js.
  trackAppHeight();
  const root = document.getElementById('phone');
  if (!root) throw new Error('the mobile document has no #phone');
  const bar = root.querySelector('.ph-bar');
  const main = root.querySelector('.ph-main');
  const connectionStatus = el('span', 'connection-state');
  connectionStatus.hidden = true;
  // ONE THING MOVES, ONE THING REPAINTS (owner, 2026-11-12, KAN-414): the kit's keyed list
  // lays the bar and the list. A bar piece is a node kept by identity, or a row of words drawn
  // again only when its words move; a list row is kept by its key, so a push repaints only the
  // row that moved and never detaches the one under a finger mid-tap.
  const kept = () => createKeyedList({ key: (row) => row.key, shows: (row) => row.shows, draw: (row) => row.draw() });
  const barCells = kept();
  const nodeIds = new WeakMap();
  let nextNodeId = 0;
  const asCell = (one) => (one instanceof Node ? { key: `#${nodeIds.get(one) ?? (nodeIds.set(one, ++nextNodeId), nextNodeId)}`, shows: '', draw: () => one } : one);
  const words = (key, shows, draw) => ({ key, shows, draw });
  const paintBar = (...nodes) => barCells.set(bar, [...nodes, connectionStatus].map(asCell));
  // The mark is in the document's own markup; tapping it is the way to the list.
  const brand = bar.querySelector('.brand');
  const feedbackAction = el('button', '', t('feedback.button', 'Feedback'));
  feedbackAction.type = 'button';
  feedbackAction.addEventListener('click', () => { location.hash = '#/feedback'; });
  const feedback = createFeedbackSurface(() => { location.hash = '#/'; });
  // A session put on screen from elsewhere (an Agent's name pressed in Chat, KAN-701) is that
  // Agent's own screen, as its row opens it.
  S.connectSession = (name) => {
    if (!(S.sessions || []).some((row) => row.name === name)) return false;
    location.hash = sessionHash(name);
    return true;
  };

  // Back from an item goes where you came from: the page's own history once it has moved here.
  let movedInPage = false;
  const backLink = (href, { previous = false } = {}) => {
    const back = el('a', 'ph-back', '‹');
    back.href = href;
    back.title = t('phone.back', 'Back');
    if (previous) back.addEventListener('click', (event) => { if (movedInPage) { event.preventDefault(); history.back(); } });
    return back;
  };
  const goBack = () => { if (movedInPage) history.back(); else location.hash = '#/'; };
  const listBar = () => paintBar(brand);
  const titledBar = (key, label, back = '#/') => paintBar(words(`back:${back}`, '', () => backLink(back)), words(`title:${key}`, label, () => el('span', 'ph-title', label)));
  // The document painted a bar for this address before any script ran (mobile.html);
  // the script's first act is to paint the same bar with its live pieces, so a stalled
  // server never shows a bare strip and nothing changes shape when the readings land.
  let route = routeFromHash();
  if (route.screen === 'list') listBar();
  else if (route.screen === 'feedback') titledBar('feedback', t('feedback.title', 'Feedback'));
  else if (route.screen === 'terminal') titledBar('terminal', readable(route.session));
  else titledBar('boot', route.item || '');

  let host = null; // the one terminal host, alive only on the terminal screen
  let stageTile = null; // the mounted tile inside it — its transcript mode is remembered on close
  let docsView = null; // the Docs screen's editor — asked before it is left, in case of unsaved typing
  let docToOpen = ''; // an item's attachment, opened once its Docs screen is up
  const transcriptModeKey = 'ronin.phone.transcript-modes';
  let savedTranscriptModes = {};
  try { savedTranscriptModes = JSON.parse(sessionStorage.getItem(transcriptModeKey) || '{}') || {}; } catch {}
  const transcriptModes = new Map(Object.entries(savedTranscriptModes).filter(([, chat]) => chat === true));
  const rememberTranscriptMode = (session, chat) => {
    if (!session) return;
    if (chat) transcriptModes.set(session, true);
    else transcriptModes.delete(session);
    try { sessionStorage.setItem(transcriptModeKey, JSON.stringify(Object.fromEntries(transcriptModes))); } catch {}
  };
  const transcriptCache = new Map(); // session + reading → records/cursor retained while Tiles come and go

  /* ---------- screen 1 · the list ---------- */
  // The phone remembers the three answers and which cards are open (plan phone-lists).
  const choiceKey = 'ronin.phone.list';
  let choice = { type: 'team', kind: 'agent', sort: 'type', open: [] };
  try { choice = { ...choice, ...(JSON.parse(localStorage.getItem(choiceKey) || '{}') || {}) }; } catch {}
  const openCards = new Set(Array.isArray(choice.open) ? choice.open : []);
  const remember = () => { try { localStorage.setItem(choiceKey, JSON.stringify({ ...choice, open: [...openCards] })); } catch {} };
  const questions = ask([{ group: '', fields: rosterQuestions() }], {
    value: { type: choice.type, kind: choice.kind, sort: choice.sort },
    density: 'tight',
    className: 'ph-questions',
    onChange: (next) => { choice = { ...choice, ...next }; remember(); paintList(); },
  });
  const listScreen = el('div', 'ph-list-screen');
  const list = el('div', 'ph-list');
  listScreen.append(questions.el, list);
  const rows = createKeyedList({ key: (row) => row.key, shows: (row) => row.shows, draw: (row) => row.draw() });

  const agentRow = (name, situation) => {
    const session = (S.sessions || []).find((one) => one.name === name) || { name };
    const lead = teamsFromState().some((team) => membersOfTeam(team.name).some((member) => member.name === name && member.team_lead));
    const card = el('a', `ph-card ph-row ${rosterRowClass(situation)}`);
    card.href = sessionHash(name);
    card.title = situationTitle(agentLabel(session), situation);
    const line = el('div', 'ph-card-line');
    const identity = el('span', 'ph-card-identity');
    if (lead) {
      const mark = el('span', 'home-job lead', '人');
      mark.title = t('league.team_lead', 'Team Lead');
      mark.setAttribute('aria-label', t('league.team_lead', 'Team Lead'));
      identity.append(mark);
    }
    identity.append(el('span', 'ph-card-name roster-name', agentLabel(session)));
    // ⚑ or the working dot on the right (owner, KAN-776; roster-lists.js rosterMark).
    line.append(identity, rosterMark());
    card.append(line);
    return { card, shows: JSON.stringify([name, agentLabel(session), lead, situation]) };
  };
  const itemRow = (item, situation) => {
    const card = el('a', `ph-card ph-row ${rosterRowClass(situation)}`);
    card.href = itemHash(item.id);
    const line = el('div', 'ph-card-line');
    const identity = el('span', 'ph-card-identity');
    identity.append(el('span', 'ph-card-name roster-name', splitItemTitle(item.title || item.id).shortTitle));
    line.append(identity, rosterMark());
    card.append(line, el('div', 'ph-card-key', [item.id, item.kind, item.status].filter(Boolean).join(' · ')));
    return { card, shows: JSON.stringify([item.id, item.title, item.kind, item.status, situation]) };
  };
  const drawRow = (row, situation, under = '') => {
    const made = row.kind === 'agent' ? agentRow(row.name, situation) : itemRow(row.item, situation);
    return { key: `${under}|${row.key}`, shows: made.shows, draw: () => made.card };
  };

  // A Team's launch form (the short Launch New Agent form), kept by Team so typing survives a push.
  const launchForms = new Map();
  const launchForm = (team) => {
    if (launchForms.has(team)) return launchForms.get(team);
    const form = el('div', 'ph-launch-form');
    form.hidden = true;
    const name = el('input');
    name.type = 'text';
    name.autocapitalize = 'off';
    name.autocomplete = 'off';
    name.spellcheck = false;
    name.maxLength = 40;
    name.placeholder = t('add_agent.name_placeholder', 'name');
    // Character-for-character, the server's own transform (sanitizeName, src/spawn.ts),
    // so the caret never jumps — the same rule Add Agent applies.
    name.addEventListener('input', () => {
      const clean = name.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      if (clean !== name.value) {
        const at = name.selectionStart;
        name.value = clean;
        name.setSelectionRange(at, at);
      }
    });
    const instructions = el('textarea');
    instructions.rows = 3;
    instructions.autocapitalize = 'off';
    instructions.spellcheck = false;
    instructions.placeholder = t('add_agent.instruction_placeholder', 'what this Agent should do');
    const note = el('p', 'ph-launch-note', t('phone.launch_defaults', "Everything else launches with this Team's defaults."));
    const state = el('p', 'ph-launch-state');
    state.hidden = true;
    const go = el('button', 'ph-launch-go', t('forms.launch', 'Launch'));
    go.dataset.launch = 'true';
    go.prepend(WorkspaceKit.primitives.ninMark('wk-launch-mark'));
    go.type = 'button';
    let busy = false;
    go.addEventListener('click', async () => {
      if (busy || !name.value.trim()) return;
      busy = true;
      go.disabled = true;
      state.hidden = false;
      state.dataset.kind = 'info';
      state.textContent = t('add_agent.starting', 'Starting…');
      const roster = teamByName(team);
      const result = await request('/api/launch', {
        method: 'POST',
        json: {
          session_type: 'cowork_agent',
          team: team === UNASSIGNED ? '' : team,
          instructions: instructions.value.trim(),
          name: name.value.trim(),
          project_root: (roster?.durable && roster.project_root) || projectData?.[0]?.name || '',
          provider: '', // blank = the install default, exactly as Add Agent sends it
          model: '',
        },
      });
      busy = false;
      go.disabled = false;
      if (!result.ok) {
        state.dataset.kind = 'failed';
        state.textContent = result.message;
        return;
      }
      // The Agent opens where it was born: its own tile, in this document.
      location.hash = sessionHash(result.data?.name || name.value.trim());
    });
    form.append(name, instructions, note, go, state);
    launchForms.set(team, form);
    return form;
  };
  // An open Team card's two actions, under its rows: Docs and ＋ Launch New Agent.
  const teamActions = (team) => {
    const actions = el('div', 'ph-actions');
    const docs = el('a', 'ph-action', t('phone.docs', 'Docs'));
    docs.href = docsHash(team);
    const launch = el('button', 'ph-action', '＋ ' + t('phone.launch_card', 'Launch New Agent'));
    launch.type = 'button';
    launch.addEventListener('click', () => {
      const form = launchForm(team);
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('input')?.focus();
    });
    actions.append(docs, launch);
    return actions;
  };
  const groupCard = (group, open) => {
    const card = el('button', 'ph-card ph-group');
    card.type = 'button';
    card.setAttribute('aria-expanded', String(open));
    const line = el('div', 'ph-card-line');
    line.append(el('span', 'ph-card-name', group.label));
    card.append(line);
    card.addEventListener('click', () => {
      if (openCards.has(group.cardId)) openCards.delete(group.cardId); else openCards.add(group.cardId);
      remember();
      paintList();
    });
    return card;
  };

  const paintList = () => {
    listBar();
    const cardOf = cardsByName();
    const groups = rosterGroups(choice, cardOf);
    const out = [];
    for (const group of groups) {
      const open = openCards.has(group.cardId);
      out.push({ key: `g:${group.cardId}`, shows: JSON.stringify([group.label, open]), draw: () => groupCard(group, open) });
      if (!open) continue;
      if (!group.rows.length) out.push({ key: `e:${group.cardId}`, shows: '', draw: () => el('div', 'ph-empty', t('phone.no_rows', 'Nobody here yet.')) });
      for (const row of group.rows) out.push(drawRow(row, situationOf(row, cardOf), group.cardId));
      if (group.team) {
        out.push({ key: `act:${group.team}`, shows: '', draw: () => teamActions(group.team) });
        out.push({ key: `launch:${group.team}`, shows: '', draw: () => launchForm(group.team) });
      }
    }
    if (!out.length) out.push({ key: '!none', shows: '', draw: () => el('div', 'ph-empty', t('phone.no_rows', 'Nobody here yet.')) });
    rows.set(list, out);
    if (main.firstChild !== listScreen || main.childNodes.length !== 1) main.replaceChildren(listScreen);
  };

  /* ---------- a Team's Docs ---------- */
  /**
   * The Team's documents — the same shelf the desktop commons shows (Tracked · Plans ·
   * Docs), built by docs.js for this Team's members and repos. A tapped document opens in
   * the same pane, full width; ← in the pane returns to the list, ‹ in the bar leaves.
   */
  const paintDocs = () => {
    const team = route.team;
    titledBar(`docs:${team}`, teamLabel({ ...teamByName(team), name: team }));
    const pane = el('div', 'home-docs ph-docs');
    const docs = buildDocs(pane, (name) => membersOfTeam(team).some((member) => member.name === name), { team: team === UNASSIGNED ? '' : team });
    docsView = docs;
    main.replaceChildren(pane);
    docs.enter();
    if (docToOpen) { docs.open(docToOpen); docToOpen = ''; }
  };
  const leaveDocs = () => {
    if (!docsView) return true;
    const left = docsView.leave(); // false while unsaved typing stands and the owner keeps it
    if (left) { docsView.close(); docsView = null; }
    return left;
  };

  /* ---------- an item ---------- */
  // The desk's item reading, full width (work-items-surface.js renderItemDetail), from the
  // item's whole read: its Agents open their tiles, its Subtasks their own item screens, its
  // attachments Docs, and its head goes back.
  const paintItem = () => {
    const id = route.item;
    titledBar(`item:${id}`, id);
    bar.querySelector('.ph-back')?.replaceWith(backLink('#/', { previous: true }));
    const pane = el('div', 'ph-item');
    main.replaceChildren(pane);
    void request(`/api/work-items/${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (result) => {
      if (!pane.isConnected) return;
      if (!result.ok) { pane.append(el('div', 'ph-empty', result.message || '')); return; }
      const { renderItemDetail, holderOf: holderWords } = await import('./work-items-surface.js');
      const whole = result.data.item;
      const team = teamsOfItem(whole, teamsFromState())[0] || UNASSIGNED;
      renderItemDetail(pane, whole, { holder: holderWords({ ...whole, held_by: result.data.held_by }), heldBy: result.data.held_by, history: false,
        children: Array.isArray(result.data.children) ? result.data.children : [],
        openAgent: (name) => S.connectSession(name),
        openChild: (child) => { location.hash = itemHash(child.id); },
        openAttachment: (path) => { docToOpen = path; location.hash = docsHash(team); },
        onClose: goBack });
    });
  };

  /* ---------- an Agent's tile ---------- */
  const openTerminal = () => {
    const { session } = route;
    closeTerminal();
    // The tile's close (Chat's Close Tile, KAN-700) is the bar's back link: the phone has no blank tilespace.
    host = createTerminalTileHost({ mode: 'reduced', transcriptCache, onMinimize: () => { location.hash = '#/'; } });
    const term = el('div', 'ph-term');
    term.append(host.el);
    main.replaceChildren(term);
    const tile = host.mount(session);
    stageTile = tile;
    if (transcriptModes.get(session)) {
      // The phone's one reading is Chat. Naming it now lets the transcript restore its
      // snapshot immediately instead of first opening the route's default reading.
      tile.transcriptReadings = [{ name: 'chat', label: 'Chat' }];
      tile.toggleTranscript();
    }
    tile.composer?.el.querySelector('.keysrow')?.append(feedbackAction);

    const transcriptBtn = tile.transcriptBtn;
    transcriptBtn.addEventListener('click', () => rememberTranscriptMode(session, tile.transcriptOn));

    // The tile's メ control moves from the hidden tile head to the bar; its menu still
    // hangs over the tile (js/menu.js). So does the reading toggle, and it is a toggle
    // here rather than a dial: the owner's ruling of 2026-09-23 is Term or Chat on a phone, in the head where the desktop keeps
    // it, never a row in a menu ("It should have the same toggle as the desktop"). The
    // button is the tile head's own — hidden when the route offers this Agent nothing,
    // opaque when it has nothing yet, naming where you are, exactly as on the desktop.
    paintBar(
      backLink('#/'),
      el('span', 'ph-title', agentLabel(S.sessions.find((row) => row.name === session) || { name: session })),
      tile.flagBtn,
      transcriptBtn,
      tile.menuBtn.el,
    );
  };
  const closeTerminal = () => {
    if (stageTile?.session) rememberTranscriptMode(stageTile.session, stageTile.transcriptOn);
    closeMenu();
    host?.destroy();
    host?.el.remove();
    host = null;
    stageTile = null;
  };

  const paintFeedback = () => {
    titledBar('feedback', t('feedback.title', 'Feedback'));
    main.replaceChildren(feedback.el);
    feedback.show?.();
  };

  /* ---------- the router ---------- */
  const render = () => {
    const next = routeFromHash();
    const staysOnDocs = next.screen === 'docs' && next.team === route.team;
    if (route.screen === 'docs' && !staysOnDocs && !leaveDocs()) {
      location.hash = docsHash(route.team); // the owner kept unsaved typing; stay
      return;
    }
    if (route.screen === 'terminal' && !(next.screen === 'terminal' && next.session === route.session)) closeTerminal();
    const moved = next.screen !== route.screen || next.item !== route.item || next.team !== route.team;
    route = next;
    if (route.screen === 'list') paintList();
    else if (route.screen === 'docs') { if (docsView) titledBar(`docs:${route.team}`, teamLabel({ ...teamByName(route.team), name: route.team })); else paintDocs(); } // a title that arrives late still lands
    else if (route.screen === 'item') { if (moved || !main.querySelector('.ph-item')) paintItem(); }
    else if (route.screen === 'feedback') paintFeedback();
    else if (!host) openTerminal();
  };
  window.addEventListener('hashchange', () => { movedInPage = true; guard('phone route', render); });

  /* ---------- the feeds ---------- */
  // Membership and the list are live off the same feed the workbench uses: the Team
  // projection repaints the list once per change. On the terminal, a killed or vanished
  // session sends you back to the list — a dead tile is not a page.
  sessionsHandlers.add(() => {
    if (route.screen !== 'terminal') return;
    const row = S.sessions.find((r) => r.name === route.session);
    if (!row) { location.hash = '#/'; return; }
    // The tile opened on the name alone; the Agent's own title lands with the list.
    const title = bar.querySelector('.ph-title');
    if (title && title.textContent !== agentLabel(row)) title.textContent = agentLabel(row);
  });
  const repaintList = () => { if (route.screen === 'list') paintList(); };
  subscribe(() => { if (route.screen === 'list' || route.screen === 'docs') render(); });
  // A card or item change redraws only the rows it moved (the keyed list compares their words).
  hear('home', repaintList);
  hear('epics', repaintList);
  hear('epicItems', repaintList);
  // Ready ages into idle with no push: the one local clock looks again.
  onAgeTick(repaintList);

  // Ask the operator which optional surfaces are plugged in BEFORE a tile is born, the
  // way main.js does: `stream:false` means the 🔓 views are off and every tile is 🔒.
  {
    const v = await request('/api/version');
    if (v.ok && v.data.stream === false) {
      S.streamOff = true;
      S.locked = true;
      S.output = 'locked';
    }
    if (v.ok && Array.isArray(v.data.services)) S.services = v.data.services;
  }
  // A tile address mounts its tile now: the terminal attaches by name and needs no list.
  if (route.screen === 'terminal') guard('phone paint', render);
  guard('say when Ronin is unreachable', () => sayWhenUnreachable(connectionStatus));
  guard('session event stream', connect);
  guard('load projects', loadProjects); // the launch form's project_root fallback
  guard('phone paint', render);
}

// The document's one script. A failure here must be on screen, not silent (errors.js).
buildPhone().catch((e) => showFailure('mobile boot', e));
