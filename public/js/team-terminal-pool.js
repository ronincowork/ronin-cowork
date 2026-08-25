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

export function createWarmTerminalPool({ createHost, container }) {
  const entries = new Map();
  let active = '';

  const destroyEntry = (name) => {
    const entry = entries.get(name);
    if (!entry) return false;
    entry.host?.destroy();
    entry.host?.el.remove();
    entries.delete(name);
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
