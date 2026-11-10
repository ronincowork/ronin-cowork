import { mkdirSync, watch } from 'node:fs';
import { onClock } from '../jikan.js';
import { type WebSocket } from 'ws';
import { listSessions, type SessionInfo } from '../tmux.js';
import { tmux, type TmuxClient } from '../tmux-client.js';
import { withAxes, type SessionWithAxes } from '../tegami.js';
import { unwatch, watchFor } from './watchers.js';
import { emitPaneActivity, emitTranscriptWatch, onRowChanged } from '../sockets.js';

const eventClients = new Set<WebSocket>();

/*
 * THE PUSH — the browser store holds what arrives here. Each tick (a tmux notification, a
 * pane's output, or a read writing a line) takes ONE session listing and builds both
 * messages from it: {t:'sessions', list} and {t:'home', rows}, each sent only when a field
 * the UI paints moved. While a GitHub or git setup session is attached, the tick also sends
 * {t:'github-setup', github} when that answer moved.
 *
 * HELD messages ({t:'teams'}, {t:'epics'}, {t:'messages'}, {t:'memory'}) are published when their
 * resource changes, sent only when they differ from the last, and sent whole to every fresh
 * connection. A board's or a Team's cron jobs are asked for: {t:'want', resource, board|team}
 * answers that one connection with the message every connection is sent on a write.
 *
 * NO POLLING FOR DATA: the browser never asks for a resource on a clock (owner, 2026-09-29).
 * The one clock the browser hears is {t:'beat'}, every BEAT_MS to every connection, carrying
 * nothing: a tab's socket only listens, so without it a link that died under the tab looks
 * like a quiet one. public/js/store.js replaces a feed silent past two beats.
 */
export const BEAT_MS = 15_000;
export interface Feed {
  list: () => Promise<SessionInfo[]>;
  home: (sessions: SessionWithAxes[]) => Promise<unknown[]>;
  teams: () => Promise<unknown[]>;
  /** Every Epic (a level-1 work item) whole, with its holder, and every item under one, slim:
   * the Epics workbench's stones (KAN-190, KAN-206). */
  epics: () => Promise<{ epics: unknown[]; items: unknown[] }>;
  messages: () => Promise<unknown[]>;
  wipeboard: (board: string) => Promise<Record<string, unknown> | null>;
  jikan: (team: string) => Promise<unknown[] | null>;
  github: { attached: () => Promise<boolean>; answer: () => Promise<unknown> };
  shutdown: (id: string) => object | null;
}
const empty: Feed = {
  list: listSessions, home: async () => [], teams: async () => [], epics: async () => ({ epics: [], items: [] }), messages: async () => [],
  wipeboard: async () => null, jikan: async () => null, github: { attached: async () => false, answer: async () => null },
  shutdown: () => null,
};
let feed: Feed = empty;
let lastSessions = '';
let lastHome = '';
let lastGithub = '';
// The last text of each held message, by `t`.
const held = new Map<string, string>();
// For a board or a Team's jobs: the last text sent, and the read running now. A burst of
// file events from one write waits as one read behind the running one, and a read that
// finds the text unchanged sends nothing, so one write is one push.
const lastSent = new Map<string, string>();
const reads = new Map<string, Promise<void>>();
const waiting = new Set<string>();
// What every connected tab holds: a fresh connection is sent these when its own tick could
// not read them (a failed listing, or nothing that moved).
let heldSessions: SessionWithAxes[] | undefined;
let heldRows: unknown[] | undefined;
// A tick says who each broadcast reached, so a connection that joins one in flight is sent
// only what it missed.
type Tick = { reached: Map<string, ReadonlySet<WebSocket>> };
let ticking: Promise<Tick> | undefined;
// Something changed while a tick was in flight: that tick may have read before it, so one more runs.
let rerun = false;
// Roster reads run in write order, so an older read never lands after a newer one.
let teamsRead: Promise<void> = Promise.resolve();

// The fields the UI paints: `activity` moves on every keystroke and nothing under public/
// shows it, and a row's stance `at` is the same; neither makes a push on its own.
export function sessionsSignature(list: unknown): string {
  return JSON.stringify((list as Array<Record<string, unknown>>).map(({ activity: _activity, ...painted }) => painted));
}
export function homeSignature(rows: unknown): string {
  return JSON.stringify((rows as Array<Record<string, unknown>>).map(({ activity: _activity, at: _at, ...painted }) => painted));
}

export function feedEvents(next: Partial<Feed>): void {
  feed = { ...empty, ...next };
  lastSessions = lastHome = lastGithub = '';
  heldSessions = heldRows = undefined;
  held.clear();
  lastSent.clear();
  reads.clear();
  waiting.clear();
  teamsRead = Promise.resolve();
}

// Sends a held message when it differs from the last one of its kind, and keeps it for the
// next connection. Services publish through here too (the machine reading).
export function publishHeld(msg: { t: string } & Record<string, unknown>): boolean {
  const text = JSON.stringify(msg);
  if (held.get(msg.t) === text) return false;
  held.set(msg.t, text);
  for (const ws of eventClients) if (ws.readyState === ws.OPEN) ws.send(text);
  return true;
}

export function tick(): Promise<Tick> {
  if (eventClients.size === 0) return Promise.resolve({ reached: new Map() });
  if (ticking) return ticking;
  const reached: Tick['reached'] = new Map();
  const send = (msg: { t: string } & Record<string, unknown>) => {
    broadcastEvent(msg);
    reached.set(msg.t, new Set(eventClients));
  };
  ticking = (async (): Promise<Tick> => {
    const sessions = await withAxes(await feed.list());
    heldSessions = sessions;
    const signature = sessionsSignature(sessions);
    if (signature !== lastSessions) {
      lastSessions = signature;
      send({ t: 'sessions', list: sessions });
    }
    const rows = await feed.home(sessions).catch(() => undefined);
    if (rows && homeSignature(rows) !== lastHome) {
      lastHome = homeSignature(rows);
      heldRows = rows;
      send({ t: 'home', rows });
    }
    // Watched only while a setup session is attached, and once more after the last one
    // closes, so a login that finishes and closes lands.
    const attached = await feed.github.attached().catch(() => false);
    if (attached || lastGithub) {
      const github = await feed.github.answer().catch(() => undefined);
      const signature = github === undefined ? lastGithub : JSON.stringify(github);
      if (github !== undefined && signature !== lastGithub) send({ t: 'github-setup', github });
      lastGithub = attached ? signature : '';
    }
    return { reached };
  })()
    .catch(() => ({ reached }))
    .finally(() => {
      ticking = undefined;
      if (rerun) { rerun = false; void tick(); }
    });
  return ticking;
}

/** Something changed: tick now, or once more after the tick in flight, which may have read before the change. */
export function changed(): void {
  if (ticking) rerun = true;
  else void tick();
}

// Called after every roster or work-item write: one read of the rosters, and one of the
// Epics, for every connected tab; each is sent only when it moved.
export function pushTeams(): Promise<void> {
  teamsRead = teamsRead.then(async () => {
    const rosters = await feed.teams().catch(() => undefined);
    if (rosters) publishHeld({ t: 'teams', rosters });
    const epics = await feed.epics().catch(() => undefined);
    if (epics) publishHeld({ t: 'epics', epics: epics.epics, items: epics.items });
  });
  return teamsRead;
}

function readThenSend(key: string, build: () => Promise<({ t: string } & Record<string, unknown>) | null>, send: (msg: { t: string } & Record<string, unknown>) => void): Promise<void> {
  if (waiting.has(key)) return reads.get(key)!;
  waiting.add(key);
  const next = (reads.get(key) ?? Promise.resolve()).then(async () => {
    waiting.delete(key);
    const msg = await build().catch(() => null);
    if (msg) send(msg);
  });
  reads.set(key, next);
  return next;
}

const sendChanged = (key: string) => (msg: Record<string, unknown>) => {
  const text = JSON.stringify(msg);
  if (lastSent.get(key) === text) return;
  lastSent.set(key, text);
  for (const ws of eventClients) if (ws.readyState === ws.OPEN) ws.send(text);
};

export function pushMessages(): Promise<void> {
  return readThenSend('messages', async () => {
    const list = await feed.messages();
    return { t: 'messages', list };
  }, publishHeld);
}

const wipeboardMessage = async (board: string) => {
  const answer = await feed.wipeboard(board).catch(() => null);
  return answer && { t: 'wipeboard', board, ...answer };
};
// team '*' is every Team's jobs, for the Cron tab's universal view.
const jikanMessage = async (team: string) => {
  const jobs = await feed.jikan(team).catch(() => null);
  return jobs && { t: 'jikan', team, jobs };
};

// After a board's file changed: every connection is sent the whole board, if it moved.
export function pushWipeboard(board: string): Promise<void> {
  return readThenSend(`wipeboard:${board}`, () => wipeboardMessage(board), sendChanged(`wipeboard:${board}`));
}
// After a Team's jobs file changed: that Team's jobs, and every Team's, each if it moved.
export function pushJikan(team: string): Promise<void> {
  return Promise.all([team, '*'].map((key) =>
    readThenSend(`jikan:${key}`, () => jikanMessage(key), sendChanged(`jikan:${key}`)))).then(() => undefined);
}

// The store folders are the whole truth for boards, cron jobs and the message queue, and
// every writer (a route, a CLI child, the server itself) changes a file in them. The server
// watches each and pushes the resource the changed file names.
export function watchStore(dir: string, changed: (file: string) => void): () => void {
  mkdirSync(dir, { recursive: true });
  const watcher = watch(dir, { recursive: true }, (_event, file) => { if (file) changed(String(file)); });
  watcher.on('error', () => {});
  return () => watcher.close();
}

const SESSION_NOTIFICATIONS = [
  'sessions-changed',
  'session-renamed',
  'window-add',
  'window-close',
  'unlinked-window-add',
  'unlinked-window-close',
  'unlinked-window-renamed',
] as const;

export function handleEvents(ws: WebSocket): void {
  eventClients.add(ws);
  const drop = () => { eventClients.delete(ws); unwatch(ws); };
  ws.on('close', drop);
  ws.on('error', drop);
  // The one thing a browser says on this socket. Everything else it sends is ignored: this
  // is a feed, and an unknown message from a client is not a reason to drop the connection.
  ws.on('message', (raw) => {
    let msg: { t?: string; session?: unknown; reading?: unknown; watches?: unknown[]; resource?: unknown; board?: unknown; team?: unknown; id?: unknown };
    try {
      msg = JSON.parse(String(raw)) as typeof msg;
    } catch {
      return;
    }
    // A surface that opens asks for its board or its Team's jobs, and a socket that reopened
    // mid-shutdown asks for that shutdown; the answer is the same message a change sends, on
    // this socket, in order with every push after it.
    if (msg?.t === 'want') {
      const shutdown = msg.resource === 'shutdown' && typeof msg.id === 'string' ? feed.shutdown(msg.id) : null;
      const answer = msg.resource === 'wipeboard' && typeof msg.board === 'string' ? wipeboardMessage(msg.board)
        : msg.resource === 'jikan' && typeof msg.team === 'string' ? jikanMessage(msg.team)
          : shutdown ? Promise.resolve({ t: 'shutdown', ...shutdown })
            : null;
      void answer?.then((reply) => { if (reply && ws.readyState === ws.OPEN) ws.send(JSON.stringify(reply)); });
      return;
    }
    if (msg?.t !== 'watch') return;
    const watches = (Array.isArray(msg.watches) ? msg.watches : [])
      .filter((w): w is { session: string; reading?: unknown } => !!w && typeof w === 'object' && typeof (w as { session?: unknown }).session === 'string')
      .map((w) => ({ session: w.session, reading: typeof w.reading === 'string' ? w.reading : '' }));
    watchFor(ws, watches);
    // Somebody is now looking at these Agents: a good moment for whoever follows journals to
    // make sure it is following them. Already following is nothing at all; not following
    // means installing a watcher, which catches up what was missed.
    for (const session of new Set(watches.map((w) => w.session))) if (session) emitTranscriptWatch(session);
  });
  // A fresh connection gets each message exactly once. The held ones it is sent now, as every
  // other tab holds them; a later publish is a newer change. The session list and the rows
  // come from the tick's broadcast if it reached this socket, or else what the others hold.
  for (const text of held.values()) ws.send(text);
  void tick().then(({ reached }) => {
    if (ws.readyState !== ws.OPEN) return;
    if (heldSessions && !reached.get('sessions')?.has(ws)) ws.send(JSON.stringify({ t: 'sessions', list: heldSessions }));
    if (heldRows && !reached.get('home')?.has(ws)) ws.send(JSON.stringify({ t: 'home', rows: heldRows }));
  });
}

// Whether any browser is on /events: a server-side check that exists only to be pushed can
// skip its work when nobody would hear it.
export const listening = (): boolean => eventClients.size > 0;

export function broadcastEvent(msg: Record<string, unknown>): number {
  const text = JSON.stringify(msg);
  let sent = 0;
  for (const ws of eventClients) if (ws.readyState === ws.OPEN) { ws.send(text); sent += 1; }
  return sent;
}

export function wireTmuxNotifications(client: Pick<TmuxClient, 'on'>, refresh: () => void): () => void {
  const unsubscribes = SESSION_NOTIFICATIONS.map((kind) => client.on(kind, refresh));
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

/**
 * WHICH PANES HAD OUTPUT, from tmux's activity subscription: `name:stamp,` per session. Only
 * the sessions whose stamp moved since the last report are returned.
 */
export function activityMoved(value: string, last: Map<string, string>): string[] {
  const moved: string[] = [];
  const now = new Map<string, string>();
  for (const entry of value.split(',')) {
    const at = entry.lastIndexOf(':');
    if (at <= 0) continue;
    const name = entry.slice(0, at);
    const stamp = entry.slice(at + 1);
    now.set(name, stamp);
    if (last.has(name) && last.get(name) !== stamp) moved.push(name);
  }
  last.clear();
  for (const [name, stamp] of now) last.set(name, stamp);
  return moved;
}

/*
 * NO CLOCK. The push runs when something changed: tmux says the session set changed, tmux says a
 * pane had output (which is also what wakes the terminal read), or a read wrote a line (the
 * part calls rowChanged). An Agent doing nothing costs nothing; the beat stays, carrying no data.
 */
export function startSessionsBroadcast(next: Feed): void {
  feedEvents(next);
  void pushTeams();
  void pushMessages();
  wireTmuxNotifications(tmux, changed);
  const stamps = new Map<string, string>();
  tmux.on('subscription', (n) => {
    if (!n.subscription?.startsWith('activity')) return;
    const moved = activityMoved(n.value ?? '', stamps);
    for (const name of moved) emitPaneActivity(name);
    if (moved.length) changed();
  });
  onRowChanged(changed);
  onClock('events_beat', BEAT_MS, async () => { broadcastEvent({ t: 'beat' }); });
}
