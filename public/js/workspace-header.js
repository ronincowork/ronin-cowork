/* part of the ronin-cowork client — see js/README.md */
import { t } from './lexicon.js';
import { workbenchLaunchUrl } from './workspace.js';

/** The one navigation header shared by every Ronin workspace. */
/** The active Workbench declares its appearance; routes and surfaces never infer it. */
export const workspaceHeaderAppearance = (active) => active?.view?.appearance || '';

export function installWorkspaceHeader(workspace) {
  const separator = document.getElementById('coworkssep');
  const coworkers = document.getElementById('coworksbtn');
  // THE PLACE is the label inside the centred scope island. Its solid colour stands
  // apart from the tinted Workbench headers below it.
  const place = document.getElementById('viewplace');
  // THE CRUMB (owner, 2026-10-20): the brand is a plain mark and word, never a link. Off the
  // landing the crumb reads RoninCowork • Home, then the Teams
  // door (#/cowork, the Teams workbench), then a view's own place (`place`) last. A Team page
  // sits under Teams — RoninCowork • Home • Teams • <Team title>; any other view naming a
  // place sits under Home alone — RoninCowork • Home • <place>.
  const home = document.getElementById('homebtn');
  const placeSeparator = document.getElementById('placesep');
  const crumb = document.getElementById('viewcrumb');

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
  home?.addEventListener('click', plainRoute(root));
  coworkers?.addEventListener('click', plainRoute(() => workspace.navigate('cowork')));

  const refresh = () => {
    const active = workspace.active;
    const appearance = workspaceHeaderAppearance(active);
    if (appearance) document.documentElement.dataset.workbench = appearance;
    else delete document.documentElement.dataset.workbench;
    const landing = !active || active.id === 'home';
    const placed = active?.view?.place ? active.view.place() : '';
    const underTeams = !landing && (!placed || active.id === 'team');
    if (home) { home.textContent = t('bar.home', 'Home'); home.hidden = landing; }
    if (separator) separator.hidden = !underTeams;
    if (coworkers) {
      coworkers.hidden = !underTeams;
      coworkers.href = workbenchLaunchUrl({ destination: 'cowork', mode: 'overlay' });
    }
    if (placeSeparator) placeSeparator.hidden = !placed;
    if (crumb) { crumb.textContent = placed; crumb.hidden = !placed; }
    if (place) {
      // The island is the editable tab name for any view that offers one (`tabName`): the
      // old Team, Teams and Desk. A Team page with no
      // Team named offers nothing to name.
      const editable = Boolean(active?.view?.tabName) && !(active?.id === 'team' && !active.param);
      if (editable) {
        // ViewHost has already seated the existing tab-name input here. Leave it intact:
        // its stored value names this workbench/tab and cannot rename the Team or Agent.
        place.title = '';
      } else if (active?.id === 'campaign' || active?.id === 'setup') {
        const setup = active.id === 'setup';
        place.replaceChildren();
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'ui-bar-place-toggle';
        toggle.textContent = setup ? t('setup.short_title', 'Setup') : t('campaign.settings_short_title', 'Settings');
        toggle.title = setup ? t('setup.open_settings', 'Open Settings') : t('setup.open_setup', 'Open Setup');
        toggle.setAttribute('aria-label', toggle.title);
        toggle.addEventListener('click', () => workspace.navigate(setup ? 'campaign' : 'setup'));
        place.append(toggle);
      } else if (active?.id === 'launch') {
        place.textContent = t('campaign_home.launch', 'New Project');
        place.title = '';
      } else if (active?.view?.island) {
        place.textContent = typeof active.view.island === 'function'
          ? active.view.island({ id: active.id, param: active.param })
          : String(active.view.island);
        place.title = '';
      } else {
        place.replaceChildren();
        place.title = '';
      }
      place.hidden = !(editable || place.textContent || place.childElementCount);
    }
  };
  refresh();
  return refresh;
}
