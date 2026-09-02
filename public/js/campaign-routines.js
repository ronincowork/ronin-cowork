/* part of the ronin-cowork client — see js/README.md */
/** Campaign Routine defaults: catalog supplies the rows; campaign_config owns the answer. */
import { t } from './lexicon.js';
import { S } from './state.js';
import { request } from './request.js';
import { saveCampaign } from './campaigns.js';
import { WorkspaceKit } from './workspace-kit.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};
const bucket = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function completeRoutineMap(catalog, stored) {
  const current = bucket(stored);
  return Object.fromEntries(catalog.map((routine) => [routine.name, current[routine.name] === true]));
}

export function createRoutinesSurface(campaign) {
  const { createSurface, createNotice } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('campaign_view.routines', 'Routines'), className: 'cv-surface' });
  const body = el('div', 'cv-body');
  surface.content.append(body);
  let catalog = [];

  const available = (routine) => (routine.mcp || []).every((name) => !Array.isArray(S.services) || S.services.includes(name));
  const save = async (name, on, notice) => {
    const row = campaign();
    if (!row) return;
    const routines = { ...completeRoutineMap(catalog, row.config?.agent_defaults?.routines), [name]: on };
    notice.set('info', t('campaign.saving', 'saving…'));
    const result = await saveCampaign(row.id, { config: { agent_defaults: { ...bucket(row.config?.agent_defaults), routines } } });
    notice.set(result.ok ? 'success' : 'failed', result.ok ? t('settei.saved', 'saved') : result.message);
    if (result.ok) paint();
  };

  function paint() {
    body.replaceChildren();
    const row = campaign();
    if (!row) return surface.setState('empty', t('campaign_view.none_selected', 'No Campaign selected.'));
    surface.setState(null, '');
    const values = completeRoutineMap(catalog, row.config?.agent_defaults?.routines);
    const notice = createNotice();
    body.append(el('p', 'cv-note', t('campaign_view.routines_help', 'Choose what new Cowork Agents start with. This Campaign answer seeds new Teams; a Team may replace it, and New Agent shows the resolved answer. Nothing already running changes.')));
    for (const routine of catalog) {
      const line = el('div', 'cv-choice');
      const words = el('div', 'cv-choice-pick');
      words.append(el('span', 'cv-choice-name', routine.label || routine.name), el('p', 'cv-choice-why', routine.blurb || t('campaign_view.routine_no_description', 'No description supplied.')));
      if (routine.name === 'ronin_worktrees') words.append(el('p', 'cv-choice-why', t('campaign_view.worktrees_routine_help', 'On: an Agent uses its own worktree only in Project Roots that allow Worktrees. Off: it works directly in each project checkout and its branches. Project Root permission is configured separately.')));
      const controls = el('div', 'cv-routine-control');
      controls.append(el('span', available(routine) ? 'cv-state cv-state-ok' : 'cv-state', available(routine) ? t('campaign_view.available', 'Available') : t('campaign_view.unavailable', 'Unavailable')));
      const toggle = el('label', 'cv-switch');
      const box = el('input'); box.type = 'checkbox'; box.checked = values[routine.name];
      const state = el('span', null, box.checked ? t('campaign_view.on', 'On') : t('campaign_view.off', 'Off'));
      box.addEventListener('change', () => { state.textContent = box.checked ? t('campaign_view.on', 'On') : t('campaign_view.off', 'Off'); void save(routine.name, box.checked, notice); });
      toggle.append(box, state); controls.append(toggle); line.append(words, controls); body.append(line);
    }
    body.append(notice.el);
  }

  return {
    el: surface.el,
    enter: () => void request('/api/routines').then((result) => { catalog = result.ok && Array.isArray(result.data) ? result.data : []; paint(); }),
  };
}

export function routinesSummary(campaign) {
  const values = bucket(campaign?.config?.agent_defaults?.routines);
  return t('campaign_view.routines_n', '{n} on', { n: Object.values(values).filter((value) => value === true).length });
}
