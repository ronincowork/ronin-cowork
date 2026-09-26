/* part of the ronin-cowork client — see js/README.md */
/**
 * THE STORE — the browser's one copy of what the server publishes, and the one socket it
 * arrives on.
 *
 * Every surface in the person's path has one lifecycle (owner's ruling, 2026-09-25): OPEN
 * subscribes and is handed what the store holds; WHILE OPEN the store hands it each change;
 * CLOSE unsubscribes. A reconnect is a new connection, and the server sends it every pushed
 * resource whole. No surface fetches a resource held here and no surface owns a timer for one.
 *
 * The contract a subscriber may rely on: it hears a resource only when the resource
 * changed. The store compares what arrived with what it holds, by the fields a surface
 * paints, and says nothing when they are the same.
 *
 *   home      {t:'home', rows}      — pushed on connect and on change; the only way in
 *   sessions  {t:'sessions', list}  — pushed on connect and on change; the only way in
 *   teams     {t:'teams'}           — a nudge: the store reads GET /api/team-rosters
 *   desks     read on demand from GET /api/desks; never pushed
 */
import { request } from './request.js';

const SNAPSHOTS = {
  desks: { url: '/api/desks', valid: (data) => Boolean(data) && typeof data === 'object' && !Array.isArray(data) },
  teams: { url: '/api/team-rosters', valid: Array.isArray },
};

const RECONNECT_MS = 3000;

// What a surface paints. A row's or session's `activity` stamp and a row's stance `at` move
// on every turn and nothing shows them, so they never make a change on their own — the
// same rule the server's `homeSignature` (src/ws/events.ts) applies before it pushes.
export const painted = (list) => JSON.stringify(list.map(({ activity: _activity, at: _at, ...rest }) => rest));
const SIGNATURES = { home: painted, sessions: painted };

export function createStore({
  read = (url) => request(url, { cache: 'no-store' }),
  open = () => new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/events`),
  later = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle),
} = {}) {
  const values = new Map();
  const signatures = new Map();
  const subscribers = new Map(); // key -> Set<fn>
  const reducers = new Map(); // key -> fn, run before any subscriber hears the change
  const listeners = new Map(); // message type -> Set<fn>, for the feeds that are not resources
  const openers = new Set();
  const reading = new Map(); // key -> the one read in flight
  let socket = null;
  let retry = null;

  /** Hold a value; tell the subscribers only when it differs from what was held. */
  function set(key, value) {
    const signature = (SIGNATURES[key] || JSON.stringify)(value);
    if (signatures.get(key) === signature) return false;
    signatures.set(key, signature);
    values.set(key, value);
    reducers.get(key)?.(value);
    for (const fn of [...(subscribers.get(key) || [])]) {
      try { fn(value); } catch (error) { console.error(error); }
    }
    return true;
  }

  const get = (key) => values.get(key);

  /** Hear a resource: the snapshot now if one is held, then each change. Returns the unsubscribe. */
  function subscribe(key, fn) {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    const heard = subscribers.get(key);
    heard.add(fn);
    if (values.has(key)) fn(values.get(key));
    return () => { heard.delete(fn); };
  }

  /** The one step that must run before anyone hears `key` change (the sessions reconcile). */
  function reduce(key, fn) { reducers.set(key, fn); }

  /**
   * Read a resource that is not pushed (desks, teams) from its route. Concurrent callers
   * share one request. Resolves {ok, changed, message, result}.
   */
  function snapshot(key) {
    if (reading.has(key)) return reading.get(key);
    const { url, valid } = SNAPSHOTS[key];
    const pending = Promise.resolve(read(url))
      .then((result) => (result?.ok && valid(result.data)
        ? { ok: true, changed: set(key, result.data), result }
        : { ok: false, changed: false, message: result?.message || `unreadable ${url}`, result }))
      .finally(() => { reading.delete(key); });
    reading.set(key, pending);
    return pending;
  }

  function receive(message) {
    if (message.t === 'home' && Array.isArray(message.rows)) set('home', message.rows);
    else if (message.t === 'sessions' && Array.isArray(message.list)) set('sessions', message.list);
    else if (message.t === 'teams') void snapshot('teams');
    for (const fn of listeners.get(message.t) || []) fn(message);
  }

  /** Open the socket. The server sends a new connection every pushed resource whole. */
  function connect() {
    cancel(retry);
    retry = null;
    const ws = open();
    socket = ws;
    ws.onopen = () => { for (const fn of openers) fn(); };
    ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      receive(message);
    };
    ws.onclose = () => { if (socket === ws) retry = later(connect, RECONNECT_MS); }; // keep the feed alive
    return ws;
  }

  /** A resumed tab: reconnect now if the socket went, rather than waiting out the retry. */
  function renew() {
    if (!socket || socket.readyState > 1) connect();
  }

  /** Hear a message type that is a feed rather than a resource (transcripts, drafts, Mika). */
  function listen(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type).delete(fn);
  }
  /** Run on every open of the socket, the first and each reconnect. */
  function onOpen(fn) { openers.add(fn); return () => openers.delete(fn); }

  /** Say something to the server; false when the socket is not open (the next open says it again). */
  function send(message) {
    if (!socket || socket.readyState !== 1) return false;
    try { socket.send(JSON.stringify(message)); return true; } catch { return false; }
  }

  return { get, subscribe, reduce, snapshot, connect, renew, listen, onOpen, send, receive };
}

/** The tab's one store. */
export const store = createStore();
export const { get, subscribe, snapshot, connect, renew } = store;
