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
 *   WARM   hidden but still streaming. WARMTH IS DURABLE (owner, 2026-08-25): a tile
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
 *   prewarm(name) starts a member streaming hidden — the hover flourish: by the time
 *   the click lands, the tile is already painted. A prewarm is the coldest thing in the
 *   LRU, never steals a warm slot at the cap, and a short grace collects one that is
 *   never clicked — the ONLY thing the clock is still for.
 *
 * Timers are injectable so the unit floor can run the clock by hand.
 */

/**
 * SEATS (leg 2/3, 2026-08-25): the page has more than one place a terminal can be
 * watched — two workspaces, either of which may hold a member. `seats` maps a seat id to
 * the container a host is appended into; `container` alone is the one-seat form the
 * first cuts used and the unit floor still runs. A member is HOT in at most one seat;
 * showing it in another moves its host there and leaves the first seat empty. Every
 * seat's member is watched — none is ever the one parked for the cap. A WARM host that
 * is in no seat sits in the holding, out of the document: a seat holds one host or none.
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
  const entries = new Map(); // name -> { host, tile, graceTimer, seat }
  const lru = []; // streaming members, least-recently-shown first
  const pinned = new Set(); // never parked while members — the lead, by the caller's hand
  const seatEls = new Map(Object.entries(seats && typeof seats === 'object' ? seats : {}));
  if (!seatEls.size) seatEls.set('main', container);
  const defaultSeat = seatEls.keys().next().value;
  // THE HOLDING: where a warm host lives when it is in no seat — OUT of the document,
  // not hidden inside a seat (owner, 2026-08-25: "it's there or it's not there; there is
  // no hidden"). A seat's container holds its one member's host, or nothing.
  const bench = holding || (typeof document !== 'undefined' ? document.createElement('div') : { append: () => {} });
  const shown = new Map(); // seat -> name
  let active = ''; // the member most recently shown, in whichever seat

  const streaming = (entry) => !!entry?.host && !entry.host.parked;
  const watched = (name) => [...shown.values()].includes(name);

  const unlist = (name) => {
    const at = lru.indexOf(name);
    if (at >= 0) lru.splice(at, 1);
  };

  const clearGrace = (entry) => {
    if (!entry.graceTimer) return;
    cancel(entry.graceTimer);
    entry.graceTimer = null;
  };

  /** WARM → COLD: close the transport, keep the seat and the DOM. */
  const park = (name) => {
    const entry = entries.get(name);
    if (!streaming(entry)) return;
    clearGrace(entry);
    entry.host.park();
    unlist(name);
  };

  /** An unclaimed PREWARM earns its keep for one grace period, then parks. Shown tiles
   *  never ride this clock — warmth is durable (owner, 2026-08-25). */
  const armGrace = (name) => {
    const entry = entries.get(name);
    if (!entry) return;
    clearGrace(entry);
    entry.graceTimer = schedule(() => {
      entry.graceTimer = null;
      if (!watched(name)) park(name);
    }, warmGraceMs);
  };

  /** Most-recently-shown wins; the coldest UNPINNED warm tile parks when the cap is
   *  exceeded. The active member is at the tail and is never the one parked. */
  const touch = (name, asColdest = false) => {
    unlist(name);
    if (asColdest) lru.unshift(name);
    else lru.push(name);
    while (lru.length > streamCap) {
      const coldest = lru.find((n) => !watched(n) && !pinned.has(n));
      if (!coldest) break; // everything left is pinned or watched — the cap yields
      park(coldest);
    }
  };

  const destroyEntry = (name) => {
    const entry = entries.get(name);
    if (!entry) return false;
    clearGrace(entry);
    entry.host?.destroy();
    entry.host?.el.remove();
    entries.delete(name);
    unlist(name);
    pinned.delete(name); // a pin dies with its seat
    for (const [seat, member] of shown) if (member === name) shown.delete(seat);
    if (active === name) active = '';
    return true;
  };

  const sync = (names = []) => {
    const wanted = [...new Set(names.map(String).filter(Boolean))];
    const keep = new Set(wanted);
    const removed = [...shown.values()].filter((name) => !keep.has(name));
    for (const name of [...entries.keys()]) if (!keep.has(name)) destroyEntry(name);
    for (const name of wanted) {
      if (entries.has(name)) continue;
      // A seat, not a stream: nothing is created until this member is first shown.
      entries.set(name, { host: null, tile: null, graceTimer: null, seat: '' });
    }
    return { removedActive: removed.length > 0, removed, size: entries.size };
  };

  /** COLD → streaming, hidden or not. mount() reattaches a parked host by itself. A
   *  host is born in the default seat and moves when shown elsewhere. */
  const stream = (name, entry, seat = entry.seat || defaultSeat) => {
    if (!entry.host) entry.host = createHost({ mode: 'full' });
    if (entry.seat !== seat) {
      seatEls.get(seat).append(entry.host.el);
      entry.seat = seat;
    }
    entry.tile = entry.host.mount(name);
    return entry.tile;
  };

  /** A host in no seat goes to the holding; a seat holds exactly its member's host. */
  const paint = () => {
    for (const [name, entry] of entries) {
      if (!entry.host || watched(name) || !entry.seat) continue;
      bench.append(entry.host.el);
      entry.seat = '';
    }
  };

  const show = (name, focus = true, seat = defaultSeat) => {
    const entry = entries.get(name);
    if (!entry || !seatEls.has(seat)) return false;
    clearGrace(entry);
    for (const [other, member] of shown) if (member === name && other !== seat) shown.delete(other);
    stream(name, entry, seat);
    shown.set(seat, name);
    paint();
    active = name;
    touch(name);
    // The member just left behind stays WARM — durable, no clock. Only cap pressure,
    // membership loss or page exit takes its stream (and never a pin's).
    entry.host.fit();
    if (focus) entry.tile.focusTerminal?.();
    return true;
  };

  /** Empty a seat without touching the member's warmth — the seat took something else. */
  const clearSeat = (seat) => {
    if (!shown.has(seat)) return false;
    shown.delete(seat);
    paint();
    return true;
  };

  /** Mount a member hidden and keep it that way — the pinned lead's entry state
   *  (owner, 2026-08-25: "the team manager is always hot, regardless", which means hot
   *  from page entry, not merely hot-once-clicked). Unlike a prewarm it rides no grace
   *  and counts as recently shown. No-op when already streaming or on stage. */
  const keepHot = (name) => {
    const entry = entries.get(name);
    if (!entry || streaming(entry) || watched(name)) return false;
    stream(name, entry);
    paint();
    touch(name);
    return true;
  };

  /** The hover flourish: start streaming hidden so the click lands on a painted tile.
   *  Declines politely at the cap — a hover never costs a genuinely warm member. */
  const prewarm = (name) => {
    const entry = entries.get(name);
    if (!entry || streaming(entry) || watched(name)) return false;
    if (lru.length >= streamCap) return false;
    stream(name, entry);
    paint();
    touch(name, true); // coldest: first to park, never displacing shown members
    armGrace(name);
    return true;
  };

  const destroyAll = () => {
    for (const name of [...entries.keys()]) destroyEntry(name);
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
    activeIn: (seat) => shown.get(seat) || '',
    seatOf: (name) => [...shown].find(([, member]) => member === name)?.[0] || '',
    isShown: (name) => watched(name),
    get seats() { return [...seatEls.keys()]; },
    get active() { return active; },
    get size() { return entries.size; },
    get streamingCount() { return lru.length; },
  };
}
