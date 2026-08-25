/* Team-page-lifetime orchestration over the existing Workspace Kit terminal host. */
/**
 * LAZY, NOT WARM (owner-driven change, 2026-08-25). The pool used to MOUNT a full
 * terminal host per member on page entry — seven hidden xterm instances all parsing
 * seven busy sessions' output on the main thread, which made the whole Team page crawl:
 * typing lag in the composer, scroll jank, renders starving. why_team's own handoff
 * flagged it ("dogfood warm revisit latency on real large Teams").
 *
 * Now an entry is a SEAT: reserved on sync, mounted the first time it is shown, kept
 * mounted after (so revisits stay warm), destroyed on membership loss exactly as before.
 * The trade is deliberate: the first click on a member pays its mount, and a page with
 * seven members costs what one terminal costs, not seven.
 */

export function createWarmTerminalPool({ createHost, container, warmCap = 4 }) {
  const entries = new Map();
  let active = '';
  const lru = []; // mounted members, least-recently-shown first — the cap's eviction order

  const destroyEntry = (name) => {
    const entry = entries.get(name);
    if (!entry) return false;
    entry.host?.destroy();
    entry.host?.el.remove();
    entries.delete(name);
    const at = lru.indexOf(name);
    if (at >= 0) lru.splice(at, 1);
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
      entries.set(name, { host: null, tile: null });
    }
    return { removedActive, size: entries.size };
  };

  const show = (name, focus = true) => {
    const entry = entries.get(name);
    if (!entry) return false;
    if (!entry.host) {
      // First show mounts the host — the one moment the terminal's cost is wanted.
      entry.host = createHost({ mode: 'full' });
      container.append(entry.host.el);
      entry.tile = entry.host.mount(name);
    }
    // THE WARM CAP (owner, 2026-08-25: "cap the warm pool at 4"). Beyond it, the
    // least-recently-shown terminal closes its transport but KEEPS ITS SEAT — clicking
    // that member again simply pays the mount again. The one being shown is never evicted.
    const at = lru.indexOf(name);
    if (at >= 0) lru.splice(at, 1);
    lru.push(name);
    while (lru.length > warmCap) {
      const coldest = lru.shift();
      const cold = entries.get(coldest);
      if (!cold?.host || coldest === name) continue;
      cold.host.destroy();
      cold.host.el.remove();
      cold.host = null;
      cold.tile = null;
    }
    for (const [member, candidate] of entries) {
      if (candidate.host) candidate.host.el.hidden = member !== name;
    }
    active = name;
    entry.host.fit();
    if (focus) entry.tile.focusTerminal?.();
    return true;
  };

  const destroyAll = () => {
    for (const name of [...entries.keys()]) destroyEntry(name);
    active = '';
  };

  return {
    sync,
    show,
    destroyAll,
    has: (name) => entries.has(name),
    get active() { return active; },
    get size() { return entries.size; },
  };
}
