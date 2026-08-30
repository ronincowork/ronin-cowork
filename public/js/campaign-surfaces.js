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
 * title, a description. No kind field; a desk_profile already carries its `campaign_kind`.
 */
import { t } from './lexicon.js';
import { field } from './ui.js';
import { deskProfiles } from './desk-profile.js';
import { saveCampaign } from './campaigns.js';
import { WorkspaceKit } from './workspace-kit.js';
import { listSkins, setSkin } from './skins.js';
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
  const id = make(t('campaign_view.id', 'Id'), el('input'), t('campaign_view.id_help', 'Fixed at creation — the address and the storage key. Rename freely; the id stays.'));
  id.control.readOnly = true;

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
      head.title.textContent = row?.title || t('campaign', 'Campaign');
      title.control.value = row?.title || '';
      description.control.value = row?.description || '';
      id.control.value = row?.id || '';
      title.f.setValidation('', '');
      description.f.setValidation('', '');
      surface.setState(row ? null : 'empty', row ? '' : t('campaign_view.none_selected', 'No Campaign selected.'));
    },
  };
}

/** A skin token, said as a word: `stock` → Stock. The catalog's labels are these. */
export const skinWord = (skin) => (skin ? skin[0].toUpperCase() + skin.slice(1) : '');
/** A rireki_view token, in the words the Output picker already uses — one literal key each, so the gate can see them. */
const tileWord = (view) => ({
  locked: t('output.locked', 'Locked'),
  terminal_mirror: t('output.terminal_mirror', 'Terminal Mirror'),
  detailed: t('output.detailed', 'Detailed'),
  condensed: t('output.condensed', 'Condensed'),
  cherry_pick: t('output.cherry_pick', 'Cherry Pick'),
}[view] || view);

/**
 * THE LOBBY, as a surface: which desk profile this Campaign opens on.
 *
 * A desk_profile is not a skin — it HAS one, plus the lexicon, the campaign kind and the
 * Team page's default arrangement (KOTOBA R38). Picking one here settles the kind too,
 * which is why the Campaign record carries no kind of its own.
 */
/**
 * THE CAMPAIGN'S OWN DESK, then the templates (owner, 2026-08-30). A desk_profile is
 * three things — the skin, the agent tile's Output, the lexicon — and a Campaign holds
 * its own copy (`desk`, CampaignDeskSettings): a catalog profile is a template copied in,
 * never a live reference. So the surface shows the Campaign's settings first — the skin
 * as the live choice, the Output as a value (Terminal Mirror is the one that ships; the
 * Services positions are named, not offered), the lexicon held to one and not shown —
 * and the profiles below as "start from", which copies whole and then leaves the
 * Campaign's settings its own.
 */
export function createDeskProfileSurface(campaign) {
  const { createSurface, createCard, createField, setSurfaceState } = WorkspaceKit.primitives;
  const label = t('cowork.tab_profile', 'Desk profile');
  const surface = createSurface({ label, className: 'cv-surface' });
  const own = el('div', 'cv-body');
  const cards = el('div', 'cv-cards');
  surface.content.append(own, cards);
  let skins = [];

  const choose = async (name) => {
    const row = campaign();
    if (!row) return;
    const r = await saveCampaign(row.id, { desk_profile: name });
    if (!r.ok) return setSurfaceState(surface.el, 'failed', r.message);
    setSurfaceState(surface.el, null, '');
    const skin = campaign()?.desk?.skin;
    if (skin) setSkin(skin);
    paint();
  };
  const setDesk = async (patch, f) => {
    const row = campaign();
    if (!row) return;
    f.setValidation('pending', t('campaign.saving', 'saving…'));
    const r = await saveCampaign(row.id, { desk: patch });
    f.setValidation(r.ok ? 'valid' : 'invalid', r.ok ? t('settei.saved', 'saved') : r.message);
    if (r.ok && patch.skin) setSkin(patch.skin);
  };

  function paintOwn(row) {
    own.replaceChildren();
    if (!row) return;
    own.append(el('span', 'cv-eyebrow', t('campaign_view.desk_own', 'This Campaign’s desk')));
    const skin = el('select', 'cv-input');
    for (const s of skins) skin.add(new Option(s.label || s.name, s.name));
    skin.value = row.desk?.skin || '';
    const skinField = createField({ label: t('campaign_view.skin', 'Skin'), control: skin, description: t('campaign_view.skin_help', 'The look — colours, corners, faces. The page wears it now.') });
    skin.addEventListener('change', () => void setDesk({ skin: skin.value }, skinField));
    const output = el('input', 'cv-input');
    output.readOnly = true;
    output.value = tileWord(row.desk?.rireki_view || '') || t('settei.none_set', '— none set —');
    const outputField = createField({ label: t('campaign_view.output', 'Output'), control: output, description: t('campaign_view.output_help', 'What an Agent’s tile shows. Terminal Mirror is the one that ships; Detailed, Condensed and Cherry Pick arrive with Ronin Services.') });
    own.append(skinField.el, outputField.el);
    own.append(el('span', 'cv-eyebrow', t('campaign_view.desk_from', 'Start from a desk profile')));
    own.append(el('p', 'cv-note', t('campaign_view.desk_from_help', 'Copies that profile’s settings into this Campaign. Changing them here afterwards changes no profile.')));
  }

  function paint() {
    const row = campaign();
    paintOwn(row);
    cards.replaceChildren();
    const profiles = deskProfiles();
    if (!profiles.length) {
      setSurfaceState(surface.el, 'empty', t('campaign_view.no_profiles', 'No desk profiles on this install.'));
      return;
    }
    setSurfaceState(surface.el, row ? null : 'empty', row ? '' : t('campaign_view.none_selected', 'No Campaign selected.'));
    for (const profile of profiles) {
      // What a profile is, in words a person can compare: the look, and what a tile
      // shows — not the catalog's tokens.
      const card = createCard({
        heading: profile.label || profile.name,
        summary: profile.blurb || '',
        metadata: [
          profile.skin ? t('campaign_view.looks', 'Looks: {skin}', { skin: skinWord(profile.skin) }) : '',
          profile.rireki_view ? t('campaign_view.tile_shows', 'Tile: {view}', { view: tileWord(profile.rireki_view) }) : '',
        ].filter(Boolean),
        selected: profile.name === row?.desk_profile,
        action: () => void choose(profile.name),
      });
      cards.append(card.el);
    }
  }

  return {
    el: surface.el,
    enter: () => {
      paint();
      if (!skins.length) void listSkins().then((rows) => { skins = rows; paint(); });
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
