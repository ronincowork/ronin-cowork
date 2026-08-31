/* part of the ronin-cowork client — see js/README.md */
/**
 * THE CAMPAIGN-LEVEL SURFACES — what a `campaign_config` owns, one surface each.
 *
 * These are ordinary workspace surfaces: they know nothing about seats, arrangement or
 * recall, and campaign-view.js puts them in a workspace exactly as the Cowork space puts
 * a terminal or a commons in one. That is the whole point of the framework — a Campaign
 * surface is not a page, and nothing here opens, closes or navigates.
 *
 * WHICH CAMPAIGN is never asked for: each takes a `campaign()` reader and paints whatever
 * is selected now. Changing the selection re-enters the surface rather than rebuilding it.
 *
 * Identity is Ronin League's step 2 (name the body of work) and Desk Profile its step 1,
 * the Lobby — trimmed to what the record actually holds, per the owner's cut: a profile, a
 * title and a description.
 */
import { t } from './lexicon.js';
import { field } from './ui.js';
import { deskProfiles } from './desk-profile.js';
import { saveCampaign } from './campaigns.js';
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

/**
 * The Campaign's own words: what this body of work is called and what it is for.
 *
 * EVERY SETTING IS THREE THINGS — its name, its control, and what it actually does. The
 * third is the sentence that lets someone who has never met the word decide, so it is
 * the Kit field's `description`, not a tooltip. The id rides along read-only: it is the
 * address and the storage key, fixed at creation, and a person should see that it is.
 */
export function createCampaignIdentitySurface(campaign) {
  const { createSurface, createField } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('campaign', 'Campaign'), className: 'cv-surface' });
  const head = surface.header;
  const body = el('div', 'cv-body');
  surface.content.append(body);

  const make = (label, control, description, max, placeholder) => {
    control.classList.add('cv-input');
    if (max) control.maxLength = max;
    if (placeholder) control.placeholder = placeholder;
    const f = createField({ label, control, description });
    body.append(f.el);
    return { control, f };
  };
  const title = make(t('campaign.name', 'Campaign name'), el('input'), t('campaign_view.name_help', 'On the door, the browser tab and the address.'), 120, t('campaign.name_placeholder', 'My campaign'));
  const description = make(t('campaign.description', 'Description'), el('textarea'), t('campaign_view.description_help', 'What this body of work is for. Shown on its card.'), 500, t('campaign.description_placeholder', 'What this campaign is for'));
  description.control.rows = 3;
  // The id is shown fixed, in grey: it is the address every campaign_id points at — a
  // fact to read, not a choice (owner, 2026-08-30).
  const id = make(t('campaign_view.id', 'Id'), el('input'), t('campaign_view.id_help', 'Fixed once created — printed on every record that points here, so it cannot change.'));
  id.control.readOnly = true;
  id.control.tabIndex = -1;

  const save = async (fields, f) => {
    const row = campaign();
    if (!row) return;
    f.setValidation('pending', t('campaign.saving', 'saving…'));
    const r = await saveCampaign(row.id, fields);
    f.setValidation(r.ok ? 'valid' : 'invalid', r.ok ? t('settei.saved', 'saved') : r.message);
    // Every surface reads the one Campaign name; tell them rather than making them poll.
    if (r.ok) window.dispatchEvent(new CustomEvent('ronin:campaign-change', { detail: { name: title.control.value.trim() } }));
  };
  title.control.addEventListener('change', () => void save({ title: title.control.value }, title.f));
  description.control.addEventListener('change', () => void save({ description: description.control.value }, description.f));

  return {
    el: surface.el,
    enter: () => {
      const row = campaign();
      head.title.textContent = row?.title ? t('campaign_view.head', 'Campaign: {name}', { name: row.title }) : t('campaign', 'Campaign');
      title.control.value = row?.title || '';
      description.control.value = row?.description || '';
      id.control.value = row?.id || '';
      title.f.setValidation('', '');
      description.f.setValidation('', '');
      surface.setState(row ? null : 'empty', row ? '' : t('campaign_view.none_selected', 'No Campaign selected.'));
    },
  };
}


/**
 * SESSION ROLES — what a launch in this Campaign offers, read-only (owner, 2026-08-30).
 * Templates exist for Agents (the session_roles catalog) and not yet for Teams; this says
 * both plainly instead of offering a form for the one that does not exist. Grouped by
 * role family as the launcher groups them; a role in no family sits in the tail.
 */
export function createSessionRolesSurface() {
  const { createSurface, createCard } = WorkspaceKit.primitives;
  const label = t('campaign_view.roles', 'Session roles');
  const surface = createSurface({ label, className: 'cv-surface' });
  const body = el('div', 'cv-body');
  surface.content.append(body);
  let families = [];
  let roles = [];
  const paint = () => {
    body.replaceChildren();
    body.append(el('p', 'cv-note', t('campaign_view.roles_help', 'What a launch here offers an Agent to be. Templates for a whole Team do not exist yet.')));
    if (!roles.length) return surface.setState('empty', t('campaign_view.roles_none', 'No session roles on this install.'));
    surface.setState(null, '');
    const placed = new Set();
    const group = (heading, names) => {
      const rows = names.map((n) => roles.find((r) => r.name === n)).filter(Boolean);
      if (!rows.length) return;
      body.append(el('span', 'cv-eyebrow', heading));
      const grid = el('div', 'cv-cards');
      for (const r of rows) {
        placed.add(r.name);
        grid.append(createCard({ heading: r.label || r.name, summary: r.blurb || '', mark: r.icon || null }).el);
      }
      body.append(grid);
    };
    for (const f of families) group(f.label || f.name, Array.isArray(f.session_roles) ? f.session_roles : []);
    group(t('campaign_view.roles_loose', 'No family'), roles.map((r) => r.name).filter((n) => !placed.has(n)));
  };
  return {
    el: surface.el,
    enter: () => {
      paint();
      void Promise.all([request('/api/role-families'), request('/api/session-roles')]).then(([f, r]) => {
        families = f.ok && Array.isArray(f.data) ? f.data : [];
        roles = r.ok && Array.isArray(r.data) ? r.data : [];
        paint();
      });
    },
  };
}

/** New Campaign: the stage is set here and nothing else is born with it. */
export function createNewCampaignSurface(onCreated) {
  const { createSurface } = WorkspaceKit.primitives;
  const label = t('campaign.new', 'New Campaign');
  const surface = createSurface({ label, className: 'cv-surface' });
  const form = el('form', 'cv-body');
  surface.content.append(form);

  const make = (label, control, max, placeholder) => {
    control.className = 'cv-input';
    control.maxLength = max;
    control.placeholder = placeholder;
    const f = field(control, { label, sr: false });
    f.el.classList.add('cv-field');
    form.append(f.el);
    return { control, f };
  };
  const title = make(t('campaign.name', 'Campaign name'), el('input'), 120, t('campaign.name_placeholder', 'My campaign'));
  const description = make(t('campaign.description', 'Description'), el('textarea'), 500, t('campaign.description_placeholder', 'What this campaign is for'));
  description.control.rows = 3;

  const select = el('select', 'cv-input');
  const profileField = field(select, { label: t('cowork.tab_profile', 'Desk profile'), sr: false });
  profileField.el.classList.add('cv-field');
  form.append(profileField.el);

  const create = el('button', 'cv-button', t('campaign.create', 'Create Campaign'));
  create.type = 'submit';
  create.dataset.primary = 'true';
  const actions = el('div', 'cv-actions');
  actions.append(create);
  form.append(actions);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!title.control.value.trim()) return title.f.say(t('campaign.name_needed', 'A Campaign needs a name.'), true);
    title.f.say(t('campaign.saving', 'saving…'));
    void onCreated({ title: title.control.value, description: description.control.value, desk_profile: select.value })
      .then((r) => {
        if (!r.ok) return title.f.say(r.message, true);
        title.f.say('');
        title.control.value = '';
        description.control.value = '';
      });
  });

  return {
    el: surface.el,
    enter: () => {
      select.replaceChildren();
      for (const profile of deskProfiles()) {
        const option = el('option', null, profile.label || profile.name);
        option.value = profile.name;
        select.append(option);
      }
      select.disabled = !deskProfiles().length;
      title.f.say('');
    },
  };
}
