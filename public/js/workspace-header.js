/* part of the ronin-cowork client — see js/README.md */
/** The one navigation breadcrumb shared by every Ronin workspace. */
import { campaignById, normalizeSelection, primaryCampaign } from './campaigns.js';

const readable = (name = '') => String(name).split(/[_-]+/).filter(Boolean)
  .map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

export function installWorkspaceHeader(workspace) {
  const ronin = document.getElementById('brandbtn');
  const campaign = document.getElementById('campaigncrumb');
  const coworkers = document.getElementById('coworkscrumb');
  const team = document.getElementById('teamcrumb');

  const root = () => {
    history.pushState(null, '', location.pathname + location.search);
    workspace.navigate('home', { fromHistory: true });
  };
  ronin?.addEventListener('click', root);
  campaign?.addEventListener('click', () => workspace.navigate('campaign'));
  coworkers?.addEventListener('click', () => workspace.navigate('cowork'));
  team?.addEventListener('click', () => {
    const name = workspace.active?.id === 'team' ? workspace.active.param : workspace.state.team;
    if (name) workspace.navigate('team', { param: name });
  });

  const refresh = () => {
    const active = workspace.active;
    const landing = !active || active.id === 'home';
    const selection = normalizeSelection(workspace.state.campaignSelection);
    const selected = primaryCampaign(selection) || campaignById(selection.primary_campaign_id);
    if (campaign) {
      campaign.textContent = selected?.title || selection.primary_campaign_id || 'Campaign';
      campaign.hidden = landing;
    }
    if (coworkers) coworkers.hidden = landing;
    if (team) {
      const name = active?.id === 'team' ? active.param : '';
      team.textContent = readable(name);
      team.hidden = landing || !name;
    }
  };
  refresh();
  return refresh;
}
