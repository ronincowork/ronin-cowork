/* part of the ronin-cowork client — see js/README.md */
import { t } from './lexicon.js';

/** The one navigation header shared by every Ronin workspace. */
const readable = (name = '') => String(name).split(/[_-]+/).filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

/** One scope name owns the whole header treatment; routes never paint it themselves. */
export const workspaceHeaderScope = (active) => {
  if (active?.id === 'team' && active.param) return 'team';
  if (active?.id === 'cowork') return 'teams';
  if (active?.id === 'campaign' || active?.id === 'launch') return 'campaign';
  return '';
};

export function installWorkspaceHeader(workspace) {
  const ronin = document.getElementById('brandbtn');
  const separator = document.getElementById('coworkssep');
  const coworkers = document.getElementById('coworksbtn');
  // THE PLACE is the label inside the centred scope island. Its solid colour stands
  // apart from the tinted Workbench headers below it.
  const place = document.getElementById('viewplace');

  const root = () => {
    history.pushState(null, '', location.pathname + location.search);
    workspace.navigate('home', { fromHistory: true });
  };
  const plainRoute = (action) => (event) => {
    // Preserve native link behavior for new-tab/window gestures and context-menu opens.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    action();
  };
  ronin?.addEventListener('click', plainRoute(root));
  coworkers?.addEventListener('click', plainRoute(() => workspace.navigate('cowork')));

  const refresh = () => {
    const active = workspace.active;
    const scope = workspaceHeaderScope(active);
    if (scope) document.documentElement.dataset.scope = scope;
    else delete document.documentElement.dataset.scope;
    const landing = !active || active.id === 'home';
    if (separator) separator.hidden = landing;
    if (coworkers) coworkers.hidden = landing;
    if (place) {
      const teamPage = active?.id === 'team' && active.param;
      if (teamPage) {
        place.textContent = t('bar.place_team', '{team}', { team: readable(active.param) });
        place.title = '';
      } else if (active?.id === 'cowork') {
        place.textContent = t('bar.place_teams', 'Teams');
        place.title = '';
      } else if (active?.id === 'campaign' || active?.id === 'launch') {
        place.textContent = t('campaign', 'Campaign');
        place.title = '';
      } else {
        place.textContent = '';
        place.title = '';
      }
      place.hidden = !place.textContent;
    }
  };
  refresh();
  return refresh;
}
