/* part of the ronin-cowork client — see js/README.md */
/** The one navigation header shared by every Ronin workspace. */
import { loadCampaigns, normalizeSelection, primaryCampaign } from './campaigns.js';

const readable = (name = '') => String(name).split(/[_-]+/).filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

export function installWorkspaceHeader(workspace) {
  const ronin = document.getElementById('brandbtn');
  const campaign = document.getElementById('campaignvalue');
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
    const selection = normalizeSelection(workspace.state.campaignSelection);
    const selected = primaryCampaign(selection);
    if (campaign) {
      campaign.textContent = selected?.title || '';
      campaign.hidden = landing;
    }
    if (coworkers) coworkers.hidden = landing;
    if (team) {
      const name = active?.id === 'team' ? active.param : '';
      team.textContent = readable(name);
      team.hidden = landing;
    }
  };
  refresh();
  // A direct #/cowork or #/team arrival has not passed through the root selector, so
  // resolve the selected Campaign here too. The bar must never depend on visit order.
  void loadCampaigns().then(refresh);
  return refresh;
}
