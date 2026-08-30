/* part of the ronin-cowork client — see js/README.md */
/** The one navigation header shared by every Ronin workspace. */
const readable = (name = '') => String(name).split(/[_-]+/).filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

export function installWorkspaceHeader(workspace) {
  const ronin = document.getElementById('brandbtn');
  const separator = document.getElementById('coworkssep');
  const coworkers = document.getElementById('coworksbtn');
  const team = document.getElementById('teamvalue');

  const root = () => {
    history.pushState(null, '', location.pathname + location.search);
    workspace.navigate('home', { fromHistory: true });
  };
  ronin?.addEventListener('click', root);
  coworkers?.addEventListener('click', () => workspace.navigate('cowork'));

  const refresh = () => {
    const active = workspace.active;
    const landing = !active || active.id === 'home';
    if (separator) separator.hidden = landing;
    if (coworkers) coworkers.hidden = landing;
    if (team) {
      const name = active?.id === 'team' ? active.param : '';
      team.textContent = readable(name);
      team.hidden = landing;
    }
  };
  refresh();
  return refresh;
}
