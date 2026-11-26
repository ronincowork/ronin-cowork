/* part of the ronin-cowork client — see js/README.md */
/**
 * THE HELPFUL ASSISTANT IS SETUP'S ASK RONIN PANEL (owner, 2026-11-24; w926; docs/architecture/setup-workbench.md).
 * Irasshai is an ordinary session type whose behaviour is her prompt (Ronin Services, docs/irasshai.md).
 * Hosted, Setup's Workspace 1 is her panel on every step: the step's few lines, then her chat (her
 * conversation as Chat draws it, tile-transcript.js, and the message box), its header's one tool the
 * tile's Term / Chat toggle (KAN-717). The selector is Setup's own steps whether she runs or not; she
 * sees the step (Setup reports its view) and takes it when asked.
 *
 * ASKING FOR HER (KAN-691, KAN-694): the Ask Ronin panel's button (w926; the selector pill went, owner
 * 24 Nov: it did nothing visible). A press asks for her (POST /api/irasshai/open): live, she is there; archived and still
 * restorable, she is restored; else made fresh. It reads Opening… at once and ignores presses while it
 * runs; a failure says so on the card. While she is live a press shows her chat.
 *
 * SHE OPENS THE SURFACES (KAN-692): she opens what a step needs with `show <tab> <surface>`, as Mika
 * does; Setup reports its view for this tab and places what `show` names (setup-view.js).
 *
 * THE INTEGRATIONS PANEL (KAN-601) is a surface she can `show`, `setup.integrations`, embedded. It reads
 * the list again each time one of her turns ends (her row's stance, pushed on `home`): no timer.
 */
import { S } from './state.js';
import { get } from './store.js';
import { request } from './request.js';
import { buildComposer } from './composer.js';
import { sendComposerMessage } from './composer-rules.js';
import { makeTileTranscript } from './tile-transcript.js';
import { WorkspaceKit } from './workspace-kit.js';
import { IRASSHAI, IRASSHAI_NAME, irasshaiIn, irasshaiShown } from './setup-journey.js';
import { createIntegrationsPanel } from './integrations-panel.js';
import { campaigns, loadCampaigns } from './campaigns.js';
import { subscribe } from './store.js';
import { t } from './lexicon.js';
import { mikaTab } from './mika.js';

export { IRASSHAI, IRASSHAI_NAME, irasshaiShown } from './setup-journey.js';
/** The integrations panel as a surface `show` names. */
export const IRASSHAI_INTEGRATIONS_TYPE = 'setup.integrations';
/** Whether her session is live, as the pushed session list says. */
export const irasshaiLive = () => irasshaiIn(S.sessions);
/** Her session's birth key, as the pushed session list says; '' when she is not live. */
export const irasshaiKey = () => (irasshaiIn(S.sessions) ? String(S.sessions.find((one) => one.name === IRASSHAI)?.key || IRASSHAI) : '');

/** Ask for her: one POST, answered at once, with this tab (what her `show` addresses); her chat follows the session push. */
export const askIrasshai = () => request('/api/irasshai/open', { method: 'POST', json: { tab: mikaTab() } });

/**
 * Her opener: the Ask Ronin panel button's words and its press. Live, a press shows her
 * chat (Assist, Workspace 1: the one a phone shows); not live, it asks for her, reads Opening… at
 * once, ignores presses while it runs, and says so on the card if she couldn't be opened.
 */
export function createIrasshaiOpener({ refresh, showChat }) {
  let state = '';
  let why = '';
  const press = () => {
    if (irasshaiLive()) { showChat(); return; }
    if (state === 'opening') return;
    state = 'opening'; why = ''; refresh();
    void askIrasshai().then((result) => {
      if (!result.ok || result.data?.ok === false) { state = 'failed'; why = String(result.message || result.data?.error || ''); }
      else if (irasshaiLive()) { state = ''; showChat(); }
      refresh(); // made: she arrives on the session push, and arrived() shows her
    });
  };
  // The selector draws cards by name (their summary line is folded away), so the name carries the state.
  const label = () => (state === 'opening' ? t('setup.irasshai_opening', 'Opening…')
    : state === 'failed' ? why || t('setup.irasshai_failed', 'Couldn’t open the Helpful Assistant') : t('setup.irasshai_open', 'Ask Ronin')); // the panel button's words; why in one line, as the server says it
  const summary = () => (state === 'failed' && why ? why
    : irasshaiLive() ? t('setup.irasshai_here', 'Here, in Ask Ronin') : t('setup.irasshai_open_title', 'Your welcome Agent: start here'));
  return {
    press,
    offer: () => ({ key: 'open', label: label(), summary: summary(), title: summary(), className: 'setup-irasshai-card', action: press }),
    arrived: () => { if (state === 'opening') { state = ''; showChat(); } refresh(); },
  };
}

/**
 * HER CHAT READS AS A CONVERSATION (owner, 2026-11-16 and 18; KAN-617): the person's messages and
 * her replies, nothing else. It asks for the route's Chat reading, which leaves out Codex's own
 * startup (its system and developer text, skills, the session-start note) and injected context
 * (AGENTS.md). Of the user lines left, only the person's are drawn, as their words (every Chat
 * draws them without Ronin's head, KAN-758). Ronin's birth packet ("Read first: <packet>…") and
 * every other delivery (House notice, Tell, Wipeboard notice, Scheduled job) are not.
 */
export const CHAT_READING = 'chat';

/**
 * HER CHAT STARTS AT HER GREETING (owner, 2026-11-19; KAN-694): she runs `ready` right before she
 * speaks, and Core keeps that moment on her session (`ready`, pushed in the session list). Her chat
 * draws only records from that moment on; with no mark yet it draws nothing, only the working dots
 * (owner, 2026-11-19: her pre-ready narration reached the chat). A new mark reads again.
 */
export const irasshaiReady = () => String(S.sessions.find((one) => one.name === IRASSHAI)?.ready || '');
export const afterReady = (record, at) => !!at && Date.parse(record?.ts || '') >= Date.parse(at);

/**
 * Her chat: the conversation and the message box, and the tile's Term / Chat toggle in the
 * surface header (owner, 2026-11-19; KAN-717): Chat cannot answer every question ("Waiting for
 * your answer in Terminal"), so a press shows her terminal, a hosted tile on her session without
 * its own head, and another press comes back. Answer in Terminal presses it.
 */
export function createIrasshaiChat() {
  const el = document.createElement('div');
  el.className = 'tile transcript-on setup-irasshai-chat';
  const body = document.createElement('div');
  body.className = 'tile-body';
  body.dataset.surface = 'chat';
  el.append(body);
  let terminal = null;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'transcript-toggle';
  const paintToggle = () => {
    const on = !terminal || terminal.el.hidden; // pressed while Chat shows, as on a tile
    toggle.setAttribute('aria-pressed', String(on));
    toggle.textContent = on ? t('transcript.chat', 'Chat') : t('transcript.terminal', 'Term');
    toggle.title = t('transcript.toggle_help', 'Each press shows more of the record; past the last one it returns to the terminal');
    el.classList.toggle('transcript-on', on);
  };
  const toTerminal = () => {
    terminal ||= WorkspaceKit.adapters.createTerminalTileHost({ mode: 'full' });
    if (!terminal.el.isConnected) el.append(terminal.el);
    const tile = terminal.mount(IRASSHAI);
    if (tile) { tile.transcriptWantChat = false; if (tile.transcriptOn) tile.toggleTranscript(); }
    body.hidden = true;
    paintToggle();
  };
  const toChat = () => {
    terminal?.park();
    body.hidden = false;
    paintToggle();
  };
  toggle.addEventListener('click', () => (body.hidden ? toChat() : toTerminal()));
  paintToggle();
  const transcript = makeTileTranscript({
    admit: (record) => (afterReady(record, irasshaiReady()) ? irasshaiShown(record) : null),
    onAnswer: toTerminal,
  });
  body.append(transcript.el);
  const say = (text) => {
    const drop = transcript.pending(text);
    return sendComposerMessage(IRASSHAI, text).then((outcome) => { if (!outcome?.ok) drop(); return outcome; });
  };
  const composer = buildComposer(body, {
    activate: () => {}, clearOverlays: () => {}, connected: () => true, send: () => true,
    sendMessage: say, scrollToBottom: () => {},
  });
  composer.show(true);
  const stance = () => {
    const row = (get('home') || []).find((one) => one.name === IRASSHAI);
    // Before her greeting she is getting ready: the dots, never what she is doing.
    if (!irasshaiReady()) transcript.setStance('working', null);
    else transcript.setStance(row?.stance || '', row?.tool);
    transcript.rewatch();
  };
  return {
    el,
    toggle,
    say,
    show: () => { transcript.show(IRASSHAI, CHAT_READING); stance(); },
    /** Her ready mark moved: read the chat again from it. */
    reread: () => { transcript.hide(); transcript.show(IRASSHAI, CHAT_READING); stance(); },
    stance,
    hide: () => { toChat(); transcript.hide(); },
    dispose: () => { terminal?.destroy(); transcript.dispose(); composer.dispose(); },
  };
}

/** The integrations panel, embedded, for the office's Campaign: a surface her `show` names. */
export function registerIrasshaiIntegrations() {
  if (WorkspaceKit.workbench.surfaces.has(IRASSHAI_INTEGRATIONS_TYPE)) return IRASSHAI_INTEGRATIONS_TYPE;
  return WorkspaceKit.workbench.surfaces.register({
    type: IRASSHAI_INTEGRATIONS_TYPE,
    header: 'surface',
    label: () => t('integrations.title', 'Integrations'),
    create: () => {
      const surface = WorkspaceKit.primitives.createSurface({ label: t('integrations.title', 'Integrations'), className: 'setup-surface integrations-surface setup-irasshai-integrations' });
      const panel = createIntegrationsPanel(() => campaigns()[0] || null, { embedded: true });
      panel.el.querySelector('.integrations-heading')?.remove(); // the surface's header names it
      surface.content.append(panel.el);
      let working = false;
      const stop = subscribe('home', (rows) => {
        const now = (rows || []).find((one) => one.name === IRASSHAI)?.stance === 'working';
        if (working && !now) void panel.enter();
        working = now;
      });
      return {
        el: surface.el,
        show: async () => { await loadCampaigns(); await panel.enter(); },
        destroy: () => { stop(); panel.destroy(); },
      };
    },
  });
}
