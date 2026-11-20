/* part of the ronin-cowork client — see js/README.md */
/**
 * SETUP IS IRASSHAI'S WHILE SHE RUNS (owner, 2026-11-15; KAN-573). Irasshai is a hosted
 * office's onboarding Agent (Ronin Services, docs/irasshai.md). While her session is live:
 * - the Assist surface is her chat only: her conversation as Chat draws it (tile-transcript.js)
 *   and the message box under it, with no tile chrome; its header's one tool is the tile's
 *   Term / Chat toggle, to her terminal and back (KAN-717);
 * - the selector's steps are her onboarding epic's tasks, in the template's order, a done one
 *   marked ✓; a press asks her to take that step, one line through the message queue, shown in
 *   her chat at once ("Let's do Workspace.", never an id); a press on a done one sends her nothing
 *   and opens the surface its task's Open line names (KAN-699).
 * Her items are the store's pushed `epics` and `epicItems`; nothing here asks on a timer. With no
 * Irasshai, Setup is as it always was.
 *
 * OPENING SETUP OPENS HER (KAN-676): a hosted office's Setup, on opening, asks Ronin Services for her
 * (POST /api/irasshai/open): live, she is there; not live, she is made fresh, as any Agent is made.
 * Once her session is live the pushed session list seats her chat as above; a new birth (a new key)
 * gets a new chat. Self-hosted Setup asks for her only on her selector entry.
 *
 * HER ENTRY (owner, 2026-11-19; KAN-691, KAN-694): Setup's selector has a Helpful Assistant entry at
 * the top, always (her name people see, IRASSHAI_NAME), on any ronin_install,
 * this machine included. A press asks for her as opening a hosted Setup does: it reads Opening… at
 * once and ignores presses while it runs; a failure says so on the card. While she is live a press
 * shows her chat.
 *
 * SHE OPENS THE SURFACES (owner, 2026-11-19; KAN-692): each onboarding task names the surface to open
 * for it, and she opens it with `show <tab> <surface>`, as Mika does; Setup reports its view for this
 * tab and places what `show` names (setup-view.js). Nothing here maps a step to a surface. The tab
 * goes with each ask for her (`askIrasshai`), into her launch prompt.
 *
 * THE INTEGRATIONS PANEL (KAN-601) is one of those surfaces, `setup.integrations`, embedded: each
 * service she adds appears there with its state (key needed, key saved, sign in), with its paste
 * field or Sign in. It reads the list again each time one of her turns ends (her row's stance,
 * pushed on `home`, leaves working): no timer, no new watcher.
 */
import { S } from './state.js';
import { get } from './store.js';
import { request } from './request.js';
import { buildComposer } from './composer.js';
import { sendComposerMessage } from './composer-rules.js';
import { makeTileTranscript } from './tile-transcript.js';
import { WorkspaceKit } from './workspace-kit.js';
import { IRASSHAI, IRASSHAI_NAME, irasshaiIn, irasshaiShown, onboardingDone } from './setup-journey.js';
import { createIntegrationsPanel } from './integrations-panel.js';
import { campaigns, loadCampaigns } from './campaigns.js';
import { subscribe } from './store.js';
import { t } from './lexicon.js';
import { mikaTab } from './mika.js';

export { IRASSHAI, IRASSHAI_NAME, irasshaiShown, irasshaiSteps, takeStepLine } from './setup-journey.js';
export const IRASSHAI_STEP_TYPE = 'setup.irasshai-step';
/** The integrations panel as a surface `show` names. */
export const IRASSHAI_INTEGRATIONS_TYPE = 'setup.integrations';
/** Whether her session is live, as the pushed session list says. */
export const irasshaiLive = () => irasshaiIn(S.sessions);
/** A hosted Setup is hers while she runs or her onboarding is not over: opening it is what makes her (KAN-676). */
export const irasshaiSetup = () => irasshaiLive() || !onboardingDone(get('epics'));
/** Her session's birth key, as the pushed session list says; '' when she is not live. */
export const irasshaiKey = () => (irasshaiIn(S.sessions) ? String(S.sessions.find((one) => one.name === IRASSHAI)?.key || IRASSHAI) : '');

/** The onboarding template's task titles, read once: the steps' order; and the surface each task's Open line names. */
let order = null;
const opens = new Map();
export function irasshaiOrder(onRead) {
  if (order) return order;
  order = [];
  void request('/api/epic-templates').then((result) => {
    const onboarding = result.ok ? (result.data.templates || []).find((one) => one.name === 'onboarding') : null;
    if (onboarding) {
      order = onboarding.tasks.slice();
      order.forEach((title, at) => { if (onboarding.opens?.[at]) opens.set(title, onboarding.opens[at]); });
      onRead?.();
    }
  });
  return order;
}
/** The Setup surface a step's task names in its Open line, '' none: what a dragged step pill opens (KAN-696). */
export const stepOpens = (step) => opens.get(step?.title) || '';

/** Ask for her: one POST, answered at once, with this tab (what her `show` addresses); her chat follows the session push. */
export const askIrasshai = () => request('/api/irasshai/open', { method: 'POST', json: { tab: mikaTab() } });

export const IRASSHAI_OPEN_TYPE = 'setup.irasshai';

/**
 * Her entry at the top of Setup's selector: its card's words and its press. Live, a press shows her
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
    : state === 'failed' ? t('setup.irasshai_failed', 'Couldn’t open the Helpful Assistant') : t('setup.irasshai_open', IRASSHAI_NAME));
  const summary = () => (state === 'failed' && why ? why
    : irasshaiLive() ? t('setup.irasshai_here', 'Here, in Assist') : t('setup.irasshai_open_title', 'Your welcome Agent: start here'));
  return {
    press,
    offer: () => ({ key: 'open', label: label(), summary: summary(), title: summary(), className: 'setup-irasshai-card', action: press }),
    arrived: () => { if (state === 'opening') { state = ''; showChat(); } refresh(); },
  };
}

/** Her entry as a selector type: one card, never placed (a press is her opener's). */
export function registerIrasshaiOpen() {
  if (WorkspaceKit.workbench.library.has(IRASSHAI_OPEN_TYPE)) return IRASSHAI_OPEN_TYPE;
  return WorkspaceKit.workbench.library.register({
    type: IRASSHAI_OPEN_TYPE,
    header: 'surface',
    label: IRASSHAI_NAME,
    discover: (_tenant, environment) => (environment?.irasshaiOpen ? [environment.irasshaiOpen()] : []),
    // A drag does what a press does: her chat, or her made fresh; nothing is placed (KAN-696).
    redirect: (_detail, environment) => { environment?.irasshaiPress?.(); return null; },
    create: () => WorkspaceKit.primitives.createBlankSurface(),
  });
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

/** Her steps in the selector: one card per task, read off `environment.irasshaiSteps()`. */
export function registerIrasshaiSteps() {
  if (WorkspaceKit.workbench.library.has(IRASSHAI_STEP_TYPE)) return IRASSHAI_STEP_TYPE;
  return WorkspaceKit.workbench.library.register({
    type: IRASSHAI_STEP_TYPE,
    header: 'surface',
    label: 'Step',
    discover: (_tenant, environment) => (environment?.irasshaiSteps?.() || []).map((step) => ({
      key: step.id, label: step.title, summary: '', mark: step.done ? '✓' : null, opens: stepOpens(step),
      action: () => environment.takeIrasshaiStep(step),
    })),
    // A press asks her; a drag opens the surface its task's Open line names, or nothing (KAN-696).
    redirect: (detail) => (detail?.opens ? { type: detail.opens } : null),
    create: () => WorkspaceKit.primitives.createBlankSurface(),
  });
}

/** Her Integrations step's surface: the integrations panel, embedded, for the office's Campaign. */
export function registerIrasshaiIntegrations() {
  if (WorkspaceKit.workbench.library.has(IRASSHAI_INTEGRATIONS_TYPE)) return IRASSHAI_INTEGRATIONS_TYPE;
  return WorkspaceKit.workbench.library.register({
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
