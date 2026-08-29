import { request } from './request.js';
import { field } from './ui.js';
import { t } from './lexicon.js';

/** The one Campaign record, edited through SETTEI's one named write door. */
export function createCampaignSurface() {
  const el = document.createElement('div');
  el.className = 'st-body';

  const make = (label, max, placeholder) => {
    const input = document.createElement('input');
    input.className = 'st-inp';
    input.maxLength = max;
    input.placeholder = placeholder;
    const f = field(input, { label, sr: false });
    f.el.classList.add('st-field');
    el.appendChild(f.el);
    return { input, f };
  };
  const name = make(t('campaign.name', 'Campaign name'), 120, t('campaign.name_placeholder', 'My campaign'));
  const description = make(t('campaign.description', 'Description'), 500, t('campaign.description_placeholder', 'What this campaign is for'));

  const save = async () => {
    name.f.say(t('settei.saving', 'saving…'));
    const r = await request('/api/settei/campaign', { method: 'PUT', json: { name: name.input.value, description: description.input.value } });
    name.f.say(r.ok ? t('settei.saved', 'saved') : r.message, !r.ok);
    if (r.ok) window.dispatchEvent(new CustomEvent('ronin:campaign-change', { detail: { name: name.input.value.trim() } }));
  };
  name.input.addEventListener('change', () => void save());
  description.input.addEventListener('change', () => void save());

  const enter = async () => {
    const r = await request('/api/settei');
    if (!r.ok) return name.f.say(r.message, true);
    name.input.value = r.data?.set?.campaign?.name || '';
    description.input.value = r.data?.set?.campaign?.description || '';
    name.f.say('');
  };
  return { el, enter };
}
