/* Team-page-lifetime orchestration over the existing Workspace Kit terminal host. */
/**
 * HOT, WARM, COLD — what a member's terminal costs, and when (owner-driven, 2026-08-25).
 *
 * Every streaming tile is real weight on BOTH ends: a websocket, a tmux viewer session
 * and a live `tmux attach` process on a pty server-side, and an xterm parsing the stream
 * client-side. The first cut of this pool mounted one per member on page entry — seven
 * streams for a seven-member team, six of them into hidden boxes — and the page crawled.
 * The second cut mounted lazily but kept every hidden tile streaming forever.
 *
 * This is the third cut, and the tiers are the design:
 *
 *   HOT    the visible member. Streaming, rendered, focused on request.
 *   WARM   still streaming, in no seat. WARMTH IS DURABLE (owner, 2026-08-25): a tile
 *          you opened stays hot until the cap forces the coldest out — four locked
 *          streams is a cost the owner has already accepted ("we have four tiles on a
 *          working page that work just fine"). No timer ever parks a shown tile.
 *   COLD   a seat. Costs nothing anywhere. First show — or a re-show after parking —
 *          pays one reattach, and tmux repaints the live screen immediately.
 *
 *   PINNED members are never parked by anything but membership loss or page exit —
 *   "the team manager is always hot, regardless" (owner). Pins count toward the cap.
 *
 *   streamCap bounds HOT+WARM together (owner: 4). At the cap the least-recently-shown
 *   unpinned warm tile parks; nothing is ever destroyed for the cap, so no member loses
 *   their seat. Destruction remains what it always was: membership loss and page exit.
 *
 *   prewarm(name) starts a member streaming in the holding — the hover flourish: by the
 *   time the click lands, the tile is already painted. A prewarm is the coldest thing in
 *   the LRU, never steals a warm slot at the cap, and a short grace collects one that is
 *   never clicked — the ONLY thing the clock is still for.
 *
 * SEATS (leg 2/3, 2026-08-25): the page has more than one place a terminal can be
 * watched — two workspaces. `seats` maps a seat id to the container a host is appended
 * into; `container` alone is the one-seat form the first cuts used and the unit floor
 * still runs. A seat's container holds exactly one host or nothing; a WARM host that is
 * in no seat sits in the holding, OUT of the document (owner: "it's there or it's not
 * there; there is no hidden"). Every seated host is watched — never the one parked.
 *
 * THE SAME MEMBER MAY BE UP IN TWO SEATS (owner, 2026-08-25: "tile in space 1 and tile
 * in space 2 could be the same terminal session — they're not connected, like the
 * regular terminal tile page"). A member has one durable entry — its seat in the pool,
 * warm or cold — and, while it is up in a second workspace at the same time, a SECOND
 * host keyed `name#seat`. The second is a stream like any other for the cap, and it is
 * destroyed the moment it leaves its seat: only the first entry is ever kept warm.
 *
 * Timers are injectable so the unit floor can run the clock by hand.
 */

export function createWarmTerminalPool({
  createHost,
  container,
  seats = null,
  holding = null,
  streamCap = 4,
  warmGraceMs = 25_000,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
} = {}) {
  const entries = new Map(); // key -> { name, host, tile, graceTimer, seat, extra }
  const lru = []; // streaming keys, least-recently-shown first
  const pinned = new Set(); // member names never parked while members — the lead, by the caller's hand
  const seatEls = new Map(Object.entries(seats && typeof seats === 'object' ? seats : {}));
  if (!seatEls.size) seatEls.set('main', container);
  const defaultSeat = seatEls.keys().next().value;
  const bench = holding || (typeof document !== 'undefined' ? document.createElement('div') : { append: () => {} });
  const shown = new Map(); // seat -> key
  let active = ''; // the member most recently shown, in whichever seat

  const streaming = (entry) => !!entry?.host && !entry.host.parked;
  const watched = (key) => [...shown.values()].includes(key);
  const keysOf = (name) => [...entries.keys()].filter((key) => entries.get(key).name === name);

  const unlist = (key) => {
    const at = lru.indexOf(key);
    if (at >= 0) lru.splice(at, 1);
  };

  const clearGrace = (entry) => {
    if (!entry.graceTimer) return;
    cancel(entry.graceTimer);
    entry.graceTimer = null;
  };

  /** WARM → COLD: close the transport, keep the seat and the DOM. */
  const park = (key) => {
    const entry = entries.get(key);
    if (!streaming(entry)) return;
    clearGrace(entry);
    entry.host.park();
    unlist(key);
  };

  /** An unclaimed PREWARM earns its keep for one grace period, then parks. Shown tiles
   *  never ride this clock — warmth is durable (owner, 2026-08-25). */
  const armGrace = (key) => {
    const entry = entries.get(key);
    if (!entry) return;
    clearGrace(entry);
    entry.graceTimer = schedule(() => {
      entry.graceTimer = null;
      if (!watched(key)) park(key);
    }, warmGraceMs);
  };

  /** Most-recently-shown wins; the coldest UNPINNED, UNWATCHED stream parks when the
   *  cap is exceeded. A seated key is never the one parked. */
  const touch = (key, asColdest = false) => {
    unlist(key);
    if (asColdest) lru.unshift(key);
    else lru.push(key);
    while (lru.length > streamCap) {
      const coldest = lru.find((k) => !watched(k) && !pinned.has(entries.get(k)?.name));
      if (!coldest) break; // everything left is pinned or watched — the cap yields
      park(coldest);
    }
  };

  const destroyEntry = (key) => {
    const entry = entries.get(key);
    if (!entry) return false;
    clearGrace(entry);
    entry.host?.destroy();
    entry.host?.el.remove();
    entries.delete(key);
    unlist(key);
    for (const [seat, k] of shown) if (k === key) shown.delete(seat);
    if (!entry.extra) pinned.delete(entry.name); // a pin dies with its seat
    if (active === entry.name && !keysOf(entry.name).length) active = '';
    return true;
  };

  const sync = (names = []) => {
    const wanted = [...new Set(names.map(String).filter(Boolean))];
    const keep = new Set(wanted);
    const removed = [...new Set([...shown.values()].map((key) => entries.get(key)?.name).filter((name) => name && !keep.has(name)))];
    for (const [key, entry] of [...entries]) if (!keep.has(entry.name)) destroyEntry(key);
    for (const name of wanted) {
      if (entries.has(name)) continue;
      // A seat, not a stream: nothing is created until this member is first shown.
      entries.set(name, { name, host: null, tile: null, graceTimer: null, seat: '', extra: false });
    }
    return { removedActive: removed.length > 0, removed, size: wanted.length };
  };

  /** COLD → streaming. mount() reattaches a parked host by itself. A host is born in the
   *  holding and moves into a seat when shown there. */
  const stream = (key, entry, seat = entry.seat || '') => {
    if (!entry.host) entry.host = createHost({ mode: 'full' });
    const target = seat ? seatEls.get(seat) : bench;
    if (entry.seat !== seat || !entry.host.el.isConnected) {
      target.append(entry.host.el);
      entry.seat = seat;
    }
    entry.tile = entry.host.mount(entry.name);
    return entry.tile;
  };

  /** A host in no seat goes to the holding — or, for a second host, away for good. */
  const paint = () => {
    for (const [key, entry] of [...entries]) {
      if (!entry.host || watched(key) || !entry.seat) continue;
      if (entry.extra) { destroyEntry(key); continue; }
      bench.append(entry.host.el);
      entry.seat = '';
    }
  };

  /** The key that goes into `seat` for `name`: the member's own entry unless that is up
   *  in ANOTHER seat, in which case a second host, keyed name#seat. */
  const keyFor = (name, seat) => {
    const own = entries.get(name);
    if (!own) return '';
    const ownSeat = [...shown].find(([, key]) => key === name)?.[0] || '';
    if (!ownSeat || ownSeat === seat) return name;
    const key = `${name}#${seat}`;
    if (!entries.has(key)) entries.set(key, { name, host: null, tile: null, graceTimer: null, seat: '', extra: true });
    return key;
  };

  const show = (name, focus = true, seat = defaultSeat) => {
    if (!seatEls.has(seat)) return false;
    const key = keyFor(name, seat);
    const entry = entries.get(key);
    if (!entry) return false;
    clearGrace(entry);
    if (shown.get(seat) !== key) shown.delete(seat);
    for (const [other, k] of shown) if (k === key && other !== seat) shown.delete(other);
    stream(key, entry, seat);
    shown.set(seat, key);
    paint();
    active = name;
    touch(key);
    entry.host.fit();
    if (focus) entry.tile.focusTerminal?.();
    return true;
  };

  /** Empty a seat: the member's own host goes to the holding, warm; a second host goes away. */
  const clearSeat = (seat) => {
    if (!shown.has(seat)) return false;
    shown.delete(seat);
    paint();
    return true;
  };

  /** Mount a member in the holding and keep it streaming — the pinned lead's entry
   *  state (owner, 2026-08-25: "the team manager is always hot, regardless", which means
   *  hot from page entry, not merely hot-once-clicked). Unlike a prewarm it rides no
   *  grace and counts as recently shown. No-op when already streaming or seated. */
  const keepHot = (name) => {
    const entry = entries.get(name);
    if (!entry || streaming(entry) || watched(name)) return false;
    stream(name, entry);
    touch(name);
    return true;
  };

  /** The hover flourish: start streaming in the holding so the click lands on a painted
   *  tile. Declines politely at the cap — a hover never costs a genuinely warm member. */
  const prewarm = (name) => {
    const entry = entries.get(name);
    if (!entry || streaming(entry) || watched(name)) return false;
    if (lru.length >= streamCap) return false;
    stream(name, entry);
    touch(name, true); // coldest: first to park, never displacing shown members
    armGrace(name);
    return true;
  };

  const destroyAll = () => {
    for (const key of [...entries.keys()]) destroyEntry(key);
    shown.clear();
    active = '';
  };

  /** The always-hot set — the lead(s). Pins survive re-sync; a pin on a member that
   *  loses membership dies with its seat. Pinning does not itself mount: the caller
   *  shows the lead, and the pin keeps that stream from ever being taken. */
  const setPinned = (names = []) => {
    pinned.clear();
    for (const name of names) if (entries.has(name)) pinned.add(name);
  };

  return {
    sync,
    show,
    clearSeat,
    prewarm,
    keepHot,
    setPinned,
    destroyAll,
    has: (name) => entries.has(name),
    activeIn: (seat) => entries.get(shown.get(seat))?.name || '',
    seatOf: (name) => [...shown].find(([, key]) => entries.get(key)?.name === name)?.[0] || '',
    isShown: (name) => [...shown.values()].some((key) => entries.get(key)?.name === name),
    get seats() { return [...seatEls.keys()]; },
    get active() { return active; },
    get size() { return [...entries.values()].filter((entry) => !entry.extra).length; },
    get streamingCount() { return lru.length; },
  };
}
