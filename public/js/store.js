/* part of the ronin-cowork client — see js/README.md */
/*
 * NO POLLING FOR DATA. Nothing here asks the server for a resource on a clock: every
 * resource arrives by push into this store, the page's one source of truth (owner,
 * 2026-09-29). The one thing on a timer is liveness: the server's {t:'beat'} carries no data,
 * and a feed silent past two beats is replaced. Put any change to that to the owner first.
 */
/**
 * THE STORE — the browser's one copy of what the server publishes, and the one socket it
 * arrives on.
 *
 * Every surface in the person's path has one lifecycle (owner's ruling, 2026-09-25): OPEN
 * subscribes and is handed what the store holds; WHILE OPEN the store hands it each change;
 * CLOSE unsubscribes. A reconnect is a new connection, and the server sends it every
 * resource whole.
 *
 * The contract a subscriber may rely on: it hears a resource only when the resource
 * changed. The store compares what arrived with what it holds, by the fields a surface
 * paints, and says nothing when they are the same.
 *
 * Each resource is pushed on connect and on change, and the push is the only way in.
 *
 *   home      {t:'home', rows}
 *   sessions  {t:'sessions', list}   — reduced into S.sessions (js/events.js) before anyone hears it
 *   teams     {t:'teams', rosters}   — the shape of GET /api/team-rosters
 *   messages  {t:'messages', list}   — the message queue
 *   memory    {t:'memory', reading}  — the machine reading behind the memory gauge
 *
 * {t:'beat'} holds nothing: it says the link is alive (SILENT_MS below).
 *
 * Two kinds are per board or per team, and nobody holds them until a surface asks: a
 * subscription to `wipeboard:<board>` or `jikan:<team>` sends the server a `want` on the
 * socket, and the server answers this connection with the message it broadcasts on every
 * write. Snapshot and changes come down the one ordered channel; each open says the wants
 * of every live subscription again.
 *
 *   wipeboard:<board>  {t:'wipeboard', board, posts, more}  — held as { posts, more }
 *   jikan:<team>       {t:'jikan', team, jobs}               — held as the jobs
 */

const RECONNECT_MS = 3000;
// The server beats every 15 s (src/ws/events.ts). This socket only listens, so a link that
// died under it (a laptop sleep, a network change) still says open and simply goes quiet.
// Quiet past two beats is a dead link, and it is replaced without a word.
export const SILENT_MS = 35_000;

// What a surface paints. A row's or session's `activity` stamp and a row's stance `at` move
// on every turn and nothing shows them, so they never make a change on their own — the
// same rule the server's `homeSignature` (src/ws/events.ts) applies before it pushes.
export const painted = (list) => JSON.stringify(list.map(({ activity: _activity, at: _at, ...rest }) => rest));
const SIGNATURES = { home: painted, sessions: painted };

// `wipeboard:ops` wants { resource: 'wipeboard', board: 'ops' }; a plain key wants nothing.
const WANTED = { wipeboard: 'board', jikan: 'team' };
// A READING is wanted with a filter (owner, 2026-10-06: the server resolves each tenant's
// reading into this store). `collection:{"team":"surface"}` wants { resource: 'collection',
// team: 'surface' }; the server answers {t:'collection', filter, …} and again on every change
// to the connections holding that filter (src/ws/events.ts). The key is the resource and the
// filter's JSON in the server's own order, so `readingKey` is the one way to spell it.
const READINGS = { collection: ['campaign', 'team', 'board', 'root'], 'work-items': ['team', 'board'] };
const word = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
export function readingFilter(resource, filter = {}) {
  const out = {};
  for (const field of READINGS[resource] || []) {
    if (field === 'root') {
      const root = [...new Set([filter.root].flat().map(word).filter(Boolean))];
      if (root.length) out.root = root;
    } else if (word(filter[field])) out[field] = word(filter[field]);
  }
  return out;
}
export const readingKey = (resource, filter = {}) => `${resource}:${JSON.stringify(readingFilter(resource, filter))}`;
const wantFor = (key) => {
  const at = key.indexOf(':');
  const resource = at > 0 ? key.slice(0, at) : '';
  if (READINGS[resource]) { try { return { t: 'want', resource, ...JSON.parse(key.slice(at + 1)) }; } catch { return null; } }
  return WANTED[resource] ? { t: 'want', resource, [WANTED[resource]]: key.slice(at + 1) } : null;
};

export function createStore({
  open = () => new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/events`),
  later = (fn, ms) => setTimeout(fn, ms),
  cancel = (handle) => clearTimeout(handle),
  quiet = (fn, ms) => { const handle = setTimeout(fn, ms); handle.unref?.(); return handle; },
} = {}) {
  const values = new Map();
  const signatures = new Map();
  const subscribers = new Map(); // key -> Set<fn>
  const reducers = new Map(); // key -> fn, run before any subscriber hears the change
  const listeners = new Map(); // message type -> Set<fn>, for the feeds that are not resources
  const openers = new Set();
  const closers = new Set();
  let socket = null;
  let retry = null;
  let silence = null;

  /** Hold a value; tell the subscribers only when it differs from what was held. */
  function set(key, value) {
    const signature = (SIGNATURES[key] || JSON.stringify)(value);
    if (signatures.get(key) === signature) return false;
    signatures.set(key, signature);
    const previous = values.get(key);
    values.set(key, value);
    reducers.get(key)?.(value, previous);
    for (const fn of [...(subscribers.get(key) || [])]) {
      try { fn(value); } catch (error) { console.error(error); }
    }
    return true;
  }

  const get = (key) => values.get(key);

  /** Hear a resource: what the store holds now, if anything, then each change. Returns the unsubscribe. */
  function subscribe(key, fn) {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    const heard = subscribers.get(key);
    heard.add(fn);
    if (values.has(key)) fn(values.get(key));
    const want = wantFor(key);
    if (want) send(want);
    return () => { heard.delete(fn); };
  }

  /** The one step that must run before anyone hears `key` change (the sessions reconcile).
   *  It is handed the new value and the one it replaces (undefined for the first). */
  function reduce(key, fn) { reducers.set(key, fn); }

  function receive(message) {
    if (message.t === 'home' && Array.isArray(message.rows)) set('home', message.rows);
    else if (message.t === 'sessions' && Array.isArray(message.list)) set('sessions', message.list);
    else if (message.t === 'teams' && Array.isArray(message.rosters)) set('teams', message.rosters);
    else if (message.t === 'messages' && Array.isArray(message.list)) set('messages', message.list);
    else if (message.t === 'memory' && message.reading && typeof message.reading === 'object') set('memory', message.reading);
    else if (message.t === 'wipeboard' && message.board && Array.isArray(message.posts)) set(`wipeboard:${message.board}`, { posts: message.posts, more: Boolean(message.more) });
    else if (message.t === 'jikan' && message.team && Array.isArray(message.jobs)) set(`jikan:${message.team}`, message.jobs);
    else if (READINGS[message.t] && message.filter && typeof message.filter === 'object') { const { t: _t, filter, ...reading } = message; set(readingKey(message.t, filter), reading); }
    for (const fn of listeners.get(message.t) || []) fn(message);
  }

  /** Open the socket. The server sends a new connection every pushed resource whole. */
  function connect() {
    cancel(retry);
    retry = null;
    const ws = open();
    socket = ws;
    // Each message puts off the check; only silence lets it run.
    const heard = () => {
      cancel(silence);
      silence = quiet(() => { if (socket === ws) renew({ force: true }); }, SILENT_MS);
    };
    ws.onopen = () => {
      heard();
      for (const fn of openers) fn();
      for (const [key, heard] of subscribers) {
        const want = heard.size ? wantFor(key) : null;
        if (want) send(want);
      }
    };
    ws.onmessage = (event) => {
      heard();
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      receive(message);
    };
    ws.onclose = () => {
      if (socket !== ws) return; // a socket renew() already replaced
      cancel(silence);
      for (const fn of closers) fn();
      retry = later(connect, RECONNECT_MS); // keep the feed alive
    };
    return ws;
  }

  /** Reconnect now if the socket went, rather than waiting out the retry. `force` also
   *  replaces a socket that still says open: the feed went silent past the beat, or an
   *  answer proved the page stale. One still connecting is left to finish. */
  function renew({ force = false } = {}) {
    if (force && socket?.readyState === 1) {
      const stale = socket;
      socket = null; // its late close is not news: no failure bar, no retry
      try { stale.close(); } catch { /* already gone */ }
    }
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
  /** Run each time the socket closes or fails to open. */
  function onClose(fn) { closers.add(fn); return () => closers.delete(fn); }

  /** Say something to the server; false when the socket is not open (the next open says it again). */
  function send(message) {
    if (!socket || socket.readyState !== 1) return false;
    try { socket.send(JSON.stringify(message)); return true; } catch { return false; }
  }

  return { get, subscribe, reduce, connect, renew, listen, onOpen, onClose, send, receive };
}

/** The tab's one store. */
export const store = createStore();
export const { get, subscribe, connect, renew } = store;
