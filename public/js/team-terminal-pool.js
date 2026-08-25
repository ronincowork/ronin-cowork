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

export function createWarmTerminalPool({
  createHost,
  container,
  streamCap = 4,
  warmGraceMs = 25_000,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
} = {}) {
  const entries = new Map(); // name -> { host, tile, graceTimer }
  const lru = []; // streaming members, least-recently-shown first
  const pinned = new Set(); // never parked while members — the lead, by the caller's hand
  let active = '';

  const streaming = (entry) => !!entry?.host && !entry.host.parked;

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
      if (name !== active) park(name);
    }, warmGraceMs);
  };

  /** Most-recently-shown wins; the coldest UNPINNED warm tile parks when the cap is
   *  exceeded. The active member is at the tail and is never the one parked. */
  const touch = (name, asColdest = false) => {
    unlist(name);
    if (asColdest) lru.unshift(name);
    else lru.push(name);
    while (lru.length > streamCap) {
      const coldest = lru.find((n) => n !== active && !pinned.has(n));
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
    if (active === name) active = '';
    return true;
  };

  const sync = (names = []) => {
    const wanted = [...new Set(names.map(String).filter(Boolean))];
    const keep = new Set(wanted);
    const removedActive = !!active && !keep.has(active);
    for (const name of [...entries.keys()]) if (!keep.has(name)) destroyEntry(name);
    for (const name of wanted) {
      if (entries.has(name)) continue;
      // A seat, not a stream: nothing is created until this member is first shown.
      entries.set(name, { host: null, tile: null, graceTimer: null });
    }
    return { removedActive, size: entries.size };
  };

  /** COLD → streaming, hidden or not. mount() reattaches a parked host by itself. */
  const stream = (name, entry) => {
    if (!entry.host) {
      entry.host = createHost({ mode: 'full' });
      container.append(entry.host.el);
    }
    entry.tile = entry.host.mount(name);
    return entry.tile;
  };

  const show = (name, focus = true) => {
    const entry = entries.get(name);
    if (!entry) return false;
    const previous = active;
    clearGrace(entry);
    stream(name, entry);
    for (const [member, candidate] of entries) {
      if (member !== name && candidate.host) candidate.host.hide();
    }
    active = name;
    touch(name);
    // The member just left behind stays WARM — durable, no clock. Only cap pressure,
    // membership loss or page exit takes its stream (and never a pin's).
    void previous;
    entry.host.fit();
    if (focus) entry.tile.focusTerminal?.();
    return true;
  };

  /** The hover flourish: start streaming hidden so the click lands on a painted tile.
   *  Declines politely at the cap — a hover never costs a genuinely warm member. */
  const prewarm = (name) => {
    const entry = entries.get(name);
    if (!entry || streaming(entry) || name === active) return false;
    if (lru.length >= streamCap) return false;
    stream(name, entry);
    entry.host.hide();
    touch(name, true); // coldest: first to park, never displacing shown members
    armGrace(name);
    return true;
  };

  const destroyAll = () => {
    for (const name of [...entries.keys()]) destroyEntry(name);
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
    prewarm,
    setPinned,
    destroyAll,
    has: (name) => entries.has(name),
    get active() { return active; },
    get size() { return entries.size; },
    get streamingCount() { return lru.length; },
  };
}
