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
  // THE PLACE reading, centred in the bar's middle. The left is doors only; this says
  // which Workbench page the doors led to, in words a first-time visitor has.
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
      const coworksPage = active?.id === 'cowork';
      if (teamPage) {
        place.textContent = t('bar.place_team', 'Team: {team}', { team: readable(active.param) });
        place.title = '';
      } else if (coworksPage) {
        place.textContent = t('bar.place_teams', 'Teams');
        place.title = t('bar.place_teams_title', 'See all of your teams here');
      }
      place.hidden = !(teamPage || coworksPage);
    }
  };
  refresh();
  return refresh;
}
