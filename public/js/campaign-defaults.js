/* part of the ronin-cowork client — see js/README.md */
/** Campaign Team and Agent defaults. These values seed the next form; they never edit a live Team or Agent. */
import { t } from './lexicon.js';
import { saveCampaign } from './campaigns.js';
import { WorkspaceKit } from './workspace-kit.js';
import { ask } from './ask.js';
import { createBriefSettingsPanel } from './brief-step.js';
import { firstMandate, screenOf, loadMandates, mandateRows } from './mandates.js';

const el = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = String(text); return out; };
const bucket = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
// The Campaign is the TOP of this cascade — campaign → team → launch — so the stock value
// has to be settable somewhere, and this card is that somewhere. Its mandate menus are the
// catalog's mandate files (mandates.js), never a list here.
const optionLabel = (value) => ({
  configured: t('launch_mode.configured', 'Native'), live_dangerously: t('launch_mode.live', 'Dangerously'),
})[value] || value;

/** `modelsHere`: Settings v2 shows the starting models on the same card (KAN-871), so the pointer to Models goes. */
export function createAgentDefaultsSurface(campaign, { modelsHere = false } = {}) {
  const { createSurface, createNotice } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('campaign_view.defaults', 'Defaults'), className: 'cv-surface' });
  const body = el('div', 'cv-body'); surface.content.append(body);
  let edited = null;
  let screen = {}; // what this Campaign (and the user) block or screen: off its mandate menus

  function paint() {
    const row = campaign(); body.replaceChildren();
    if (!row) return surface.setState('empty', t('campaign_view.none_selected', 'No office settings yet.'));
    surface.setState(null, '');
    const current = bucket(row.config?.defaults);
    const form = el('form', 'cv-defaults-form');
    const questionsRow = el('div', 'cv-default-field');
    const notice = createNotice();
    body.append(el('p', 'cv-note', t('campaign_view.defaults_help', 'These defaults land in the next Team or Agent form that opens. They remain editable there; nothing live changes.')));
    if (!modelsHere) body.append(el('p', 'cv-note', t('campaign_view.defaults_models', 'Models are set in Models.')));
    let picked = edited || {
      reach: current.reach || firstMandate('reach'), recruit: current.recruit || firstMandate('recruit'),
      output: list(current.output), launch_mode: current.launch_mode || 'live_dangerously',
    };
    const questions = ask([
      { group: t('mandate', 'Mandate'), fields: [
        { key: 'reach', label: t('campaign_view.default_reach', 'Reach'), options: mandateRows('reach', screen) },
        { key: 'recruit', label: t('campaign_view.default_recruit', 'Recruit'), options: mandateRows('recruit', screen) },
        { key: 'output', label: t('campaign_view.default_output', 'Output'), many: true, options: mandateRows('output', screen) },
      ] },
      { group: t('campaign_view.defaults_runtime', 'Runtime'), fields: [
        { key: 'launch_mode', label: t('launch_mode.head', 'Launch mode'), options: [
          { v: 'configured', l: optionLabel('configured'), sub: t('launch_mode.configured_sub', 'Do not override the harness’s approval behavior. Model selection is separate.') },
          { v: 'live_dangerously', l: optionLabel('live_dangerously'), sub: t('launch_mode.live_sub', 'Use that harness’s own approval-bypass launch.') },
        ] },
      ] },
    ], { value: picked, trayHost: questionsRow, onChange: (value) => { picked = value; edited = value; } });
    questionsRow.append(questions.el); form.append(questionsRow);
    /* What every Agent in this Campaign is told: its brief settings, saved by the one Save below. */
    const brief = createBriefSettingsPanel({ layer: 'campaign', id: row.id, campaignId: row.id, ownSave: false, preview: { campaign_id: row.id } });
    const briefRow = el('div', 'cv-default-field');
    briefRow.append(el('h3', 'cv-brief-head', t('behaviours', 'Behaviors')), el('p', 'cv-note', t('campaign_view.brief_help', 'What every new Workspace, Team and Agent inherits. Nothing that already exists changes.')), brief.el);
    form.append(briefRow);
    void brief.enter();
    const actions = el('div', 'cv-default-actions');
    const save = el('button', 'cv-save', t('panels.save', 'Save')); save.type = 'submit'; actions.append(notice.el, save); form.append(actions); body.append(form);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); save.disabled = true; notice.set('info', t('campaign.saving', 'saving…'));
      const told = await brief.save();
      if (!told.ok) { notice.set('failed', told.message); save.disabled = false; return; }
      const { behaviours: _gone, ...kept } = current; // the Campaign's behaviours are its brief settings now (above)
      const next = { ...kept, ...picked };
      const result = await saveCampaign(row.id, { config: { defaults: next } });
      notice.set(result.ok ? 'success' : 'failed', result.ok ? t('settei.saved', 'saved') : result.message); save.disabled = false;
      if (result.ok) { edited = null; paint(); }
    });
  }

  return { el: surface.el, enter: async () => {
    const id = campaign()?.id || '';
    [, screen] = await Promise.all([loadMandates(), screenOf({ campaign_id: id })]);
    paint();
  } };
}

export function defaultsSummary(campaign) {
  const defaults = bucket(campaign?.config?.defaults);
  return t('campaign_view.defaults_reach', 'Reach {reach}', { reach: defaults.reach || 'open' });
}
