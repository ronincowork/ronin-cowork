/* The smallest useful description of the work still visible beside Mika. */
export function mikaViewContext(label, view = {}) {
  const hidden = new Set(Array.isArray(view.hidden) ? view.hidden : []);
  const order = Array.isArray(view.order) ? view.order : [];
  const workspaces = view.workspaces && typeof view.workspaces === 'object' ? view.workspaces : {};
  const visible = order.filter((name) => /^workspace[1-4]$/.test(name) && !hidden.has(name) && workspaces[name]);
  const describe = (item = {}) => item.holds === 'session'
    ? `session:${item.session || 'unknown'}`
    : String(item.holds || 'empty');
  const shown = visible.map((name) => `${name}=${describe(workspaces[name])}`).join(', ');
  return `Context only—do not reply: ${String(label || 'Ronin')}; selected ${view.selected || 'workspace1'}; visible ${shown || 'none'}.`;
}
