/* part of the ronin-cowork client — see js/README.md */
/**
 * CAMPAIGN — select, create, archive. The surface behind the home's ✳ Manage.
 *
 * NEW CAMPAIGN STOPS AT THE STAGE (owner, 2026-08-29). It is the League concept's Lobby
 * and Campaign steps trimmed to what a `campaign_config` actually holds — a desk profile,
 * a title, a description — and nothing else. Saving creates the record, selects it, and
 * STOPS: no Cowork, no team, no project root, no Agent is born in this flow. Coworks are
 * made from the Cowork space and Agents from their own surfaces, each with the Campaign
 * context already supplied.
 *
 * NO KIND FIELD, deliberately. The Lobby step in the concept picks a campaign kind as
 * well as a skin, but every `desk_profile` definition already carries its own
 * `campaign_kind` (src/desk-profiles.ts), so choosing the profile settles the kind for
 * free. A second stored copy could only drift from it.
 *
 * ARCHIVE HIDES AND KILLS NOTHING. An archived Campaign drops out of the selectors; its
 * Agents keep running, keep their desks, and keep their records. It is also still the
 * home of any unstamped legacy record, which is why `campaigns.js` reads archived rows
 * when it resolves the initial Campaign.
 */
import { t } from './lexicon.js';
import { campaigns, campaignsFailed, campaignsMessage, createCampaign, loadCampaigns } from './campaigns.js';
import { deskProfiles } from './desk-profile.js';
import { request } from './request.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

export function createCampaignManage() {
  const root = el('main', 'cm-view');
  const frame = el('div', 'cm-frame');
  const list = el('div', 'cm-list');
  const note = el('p', 'cm-note');
  note.hidden = true;
  frame.append(list, note);
  root.append(frame);

  let ctx = null;
  let entered = false;
  let drafting = false;

  const say = (message, bad = false) => {
    note.hidden = !message;
    note.textContent = message || '';
    note.dataset.bad = String(!!bad);
  };

  const selectCampaign = (id) => {
    ctx?.patchState({ campaignSelection: { mode: 'selected', campaign_ids: [id], primary_campaign_id: id } });
    // A Cowork or an Agent from another Campaign is not a legal default — let the home
    // re-home both rather than carrying a stale pair back to it.
    ctx?.patchViewState('home', { cowork: '', agent: '' });
    ctx?.navigate('home');
  };

  const archive = async (row) => {
    if (!window.confirm(t('campaign.archive_confirm', 'Archive {title}? It stops nothing — its Agents keep running.', { title: row.title }))) return;
    const r = await request(`/api/campaigns/${encodeURIComponent(row.id)}`, { method: 'PATCH', json: { state: 'archived' } });
    if (!r.ok) return say(r.message, true);
    await loadCampaigns();
    paint();
  };

  const save = async (fields) => {
    say(t('campaign.saving', 'saving…'));
    const r = await createCampaign(fields);
    if (!r.ok) return say(r.message, true);
    say('');
    drafting = false;
    selectCampaign(r.data.id);
  };

  /** The New Campaign form: a desk profile, a title, a description. Nothing else. */
  function draftForm() {
    const form = el('form', 'cm-draft');
    const profiles = deskProfiles();

    const title = el('input', 'cm-input');
    title.maxLength = 120;
    title.required = true;
    title.placeholder = t('campaign.name_placeholder', 'My campaign');

    const description = el('textarea', 'cm-input');
    description.maxLength = 500;
    description.rows = 2;
    description.placeholder = t('campaign.description_placeholder', 'What this campaign is for');

    const profile = el('select', 'cm-input');
    for (const p of profiles) {
      const option = el('option', null, p.label || p.name);
      option.value = p.name;
      profile.append(option);
    }
    if (!profiles.length) profile.disabled = true;

    const field = (label, control, hint = '') => {
      const wrap = el('label', 'cm-field');
      wrap.append(el('span', 'cm-label', label), control);
      if (hint) wrap.append(el('small', 'cm-hint', hint));
      return wrap;
    };
    form.append(
      el('h2', null, t('campaign.new', 'New Campaign')),
      field(t('campaign.name', 'Campaign name'), title),
      field(t('campaign.description', 'Description'), description),
      field(t('cowork.tab_profile', 'Desk profile'), profile, t('campaign.profile_hint', 'Sets the words, the skin and the templates this Campaign opens with.')),
    );

    const actions = el('div', 'cm-actions');
    const cancel = el('button', 'cm-button', t('launcher.cancel', 'Cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', () => { drafting = false; say(''); paint(); });
    const create = el('button', 'cm-button', t('campaign.create', 'Create Campaign'));
    create.type = 'submit';
    create.dataset.primary = 'true';
    actions.append(cancel, create);
    form.append(actions);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!title.value.trim()) return say(t('campaign.name_needed', 'A Campaign needs a name.'), true);
      void save({ title: title.value, description: description.value, desk_profile: profile.value });
    });
    window.setTimeout(() => title.focus(), 0);
    return form;
  }

  function paint() {
    if (!entered) return;
    list.replaceChildren();
    if (campaignsFailed()) {
      list.append(el('p', 'cm-empty', t('campaign.read_failed', 'Could not read Campaigns — {message}', { message: campaignsMessage() })));
      return;
    }
    const rows = campaigns();
    for (const row of rows) {
      const card = el('div', 'cm-row');
      card.dataset.archived = String(row.state === 'archived');

      const open = el('button', 'cm-open');
      open.type = 'button';
      open.append(el('b', null, row.title), el('span', 'cm-desc', row.description || ''));
      open.addEventListener('click', () => selectCampaign(row.id));

      const meta = el('div', 'cm-meta');
      if (row.desk_profile) meta.append(el('span', 'cm-profile', row.desk_profile));
      if (row.state === 'archived') meta.append(el('span', 'cm-archived', t('campaign.archived', 'archived')));
      else {
        const drop = el('button', 'cm-archive', t('campaign.archive', 'Archive'));
        drop.type = 'button';
        drop.addEventListener('click', () => void archive(row));
        meta.append(drop);
      }

      card.append(open, meta);
      list.append(card);
    }
    if (!rows.length) list.append(el('p', 'cm-empty', t('campaign.none', 'No Campaigns yet.')));

    if (drafting) list.append(draftForm());
    else {
      const add = el('button', 'cm-new', t('campaign.new', 'New Campaign'));
      add.type = 'button';
      add.addEventListener('click', () => { drafting = true; paint(); });
      list.append(add);
    }
  }

  return {
    el: root,
    glyph: '⛩',
    title: () => t('campaign', 'Campaign'),
    enter: async (context) => {
      ctx = context;
      entered = true;
      drafting = false;
      say('');
      paint();
      await loadCampaigns();
      if (entered) paint();
    },
    leave: () => { entered = false; drafting = false; },
    destroy: () => { entered = false; ctx = null; },
  };
}
