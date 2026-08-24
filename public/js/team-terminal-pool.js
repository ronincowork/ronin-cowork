/* Team-page-lifetime orchestration over the existing Workspace Kit terminal host. */

export function createWarmTerminalPool({ createHost, container }) {
  const entries = new Map();
  let active = '';

  const destroyEntry = (name) => {
    const entry = entries.get(name);
    if (!entry) return false;
    entry.host.destroy();
    entry.host.el.remove();
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
      const host = createHost({ mode: 'full' });
      container.append(host.el);
      const tile = host.mount(name);
      host.el.hidden = true;
      entries.set(name, { host, tile });
    }
    return { removedActive, size: entries.size };
  };

  const show = (name, focus = true) => {
    const entry = entries.get(name);
    if (!entry) return false;
    for (const [member, candidate] of entries) candidate.host.el.hidden = member !== name;
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
