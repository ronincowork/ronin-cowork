/* part of the ronin-cowork client — see js/README.md */
import { t } from './lexicon.js';
import { applyWorkbenchAppearance } from './workspace-contract.js';

/** The one navigation header shared by every Ronin workspace. */
const readable = (name = '') => String(name).split(/[_-]+/).filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

/** The active Workbench declares its appearance; routes and surfaces never infer it. */
export const workspaceHeaderAppearance = (active) => active?.view?.appearance || '';

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
    const appearance = workspaceHeaderAppearance(active);
    applyWorkbenchAppearance(appearance);
    const landing = !active || active.id === 'home';
    if (separator) separator.hidden = landing;
    if (coworkers) coworkers.hidden = landing;
    if (place) {
      const teamPage = active?.id === 'team' && active.param;
      const editable = teamPage || active?.id === 'cowork';
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
