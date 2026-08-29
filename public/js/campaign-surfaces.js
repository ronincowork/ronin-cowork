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

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

/** The Campaign's own words: what this body of work is called and what it is for. */
export function createCampaignIdentitySurface(campaign) {
  const { createSurface, createSurfaceHeader } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('campaign', 'Campaign'), className: 'cv-surface' });
  const head = createSurfaceHeader({ label: t('campaign', 'Campaign') });
  surface.el.prepend(head.el);
  const body = el('div', 'cv-body');
  surface.content.append(body);

  const make = (label, control, max, placeholder) => {
    control.className = 'cv-input';
    control.maxLength = max;
    control.placeholder = placeholder;
    const f = field(control, { label, sr: false });
    f.el.classList.add('cv-field');
    body.append(f.el);
    return { control, f };
  };
  const title = make(t('campaign.name', 'Campaign name'), el('input'), 120, t('campaign.name_placeholder', 'My campaign'));
  const description = make(t('campaign.description', 'Description'), el('textarea'), 500, t('campaign.description_placeholder', 'What this campaign is for'));
  description.control.rows = 3;

  const save = async (fields) => {
    const row = campaign();
    if (!row) return;
    title.f.say(t('campaign.saving', 'saving…'));
    const r = await saveCampaign(row.id, fields);
    title.f.say(r.ok ? t('settei.saved', 'saved') : r.message, !r.ok);
    // Every surface reads the one Campaign name; tell them rather than making them poll.
    if (r.ok) window.dispatchEvent(new CustomEvent('ronin:campaign-change', { detail: { name: title.control.value.trim() } }));
  };
  title.control.addEventListener('change', () => void save({ title: title.control.value }));
  description.control.addEventListener('change', () => void save({ description: description.control.value }));

  return {
    el: surface.el,
    enter: () => {
      const row = campaign();
      head.title.textContent = row?.title || t('campaign', 'Campaign');
      title.control.value = row?.title || '';
      description.control.value = row?.description || '';
      title.f.say('');
      surface.setState(row ? null : 'empty', row ? '' : t('campaign_view.none_selected', 'No Campaign selected.'));
    },
  };
}

/**
 * THE LOBBY, as a surface: which desk profile this Campaign opens on.
 *
 * A desk_profile is not a skin — it HAS one, plus the lexicon, the campaign kind and the
 * Team page's default arrangement (KOTOBA R38). Picking one here settles the kind too,
 * which is why the Campaign record carries no kind of its own.
 */
export function createDeskProfileSurface(campaign) {
  const { createSurface, createSurfaceHeader, createCard, setSurfaceState } = WorkspaceKit.primitives;
  const label = t('cowork.tab_profile', 'Desk profile');
  const surface = createSurface({ label, className: 'cv-surface' });
  surface.el.prepend(createSurfaceHeader({ label }).el);
  const cards = el('div', 'cv-cards');
  surface.content.append(cards);

  const choose = async (name) => {
    const row = campaign();
    if (!row) return;
    const r = await saveCampaign(row.id, { desk_profile: name });
    if (!r.ok) return setSurfaceState(surface.el, 'failed', r.message);
    setSurfaceState(surface.el, null, '');
    paint();
  };

  function paint() {
    const row = campaign();
    cards.replaceChildren();
    const profiles = deskProfiles();
    if (!profiles.length) {
      setSurfaceState(surface.el, 'empty', t('campaign_view.no_profiles', 'No desk profiles on this install.'));
      return;
    }
    setSurfaceState(surface.el, row ? null : 'empty', row ? '' : t('campaign_view.none_selected', 'No Campaign selected.'));
    for (const profile of profiles) {
      const card = createCard({
        heading: profile.label || profile.name,
        summary: profile.blurb || '',
        metadata: [profile.skin, profile.campaign_kind].filter(Boolean),
        selected: profile.name === row?.desk_profile,
        action: () => void choose(profile.name),
      });
      cards.append(card.el);
    }
  }

  return { el: surface.el, enter: paint };
}

/** New Campaign: the stage is set here and nothing else is born with it. */
export function createNewCampaignSurface(onCreated) {
  const { createSurface, createSurfaceHeader } = WorkspaceKit.primitives;
  const label = t('campaign.new', 'New Campaign');
  const surface = createSurface({ label, className: 'cv-surface' });
  surface.el.prepend(createSurfaceHeader({ label }).el);
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

/**
 * TEMPLATE PREFERENCES — which Cowork templates this Campaign offers.
 *
 * DELIBERATELY THIN, and it should stay thin until the selections are defined (owner,
 * 2026-08-29: "we don't really run templates yet but will add selections soon"). What it
 * is NOT is the template manager: saving a draft, using a template and deleting one are
 * RUNNING actions — a Cowork is born from a template — and they live beside New Team in
 * the Cowork space. A config surface that could launch a Cowork would cross the one line
 * the 4+1 model draws: desk_profile, project roots and template preferences are chosen
 * here; team_rosters and agent_sessions are managed while running.
 *
 * An empty-but-correct surface beats a full one pointed the wrong way — there is nothing
 * to un-build when the field arrives.
 */
export function createTemplatePreferencesSurface(campaign) {
  const { createSurface, createSurfaceHeader, setSurfaceState } = WorkspaceKit.primitives;
  const label = t('campaign_view.template_prefs', 'Template preferences');
  const surface = createSurface({ label, className: 'cv-surface' });
  surface.el.prepend(createSurfaceHeader({ label }).el);
  const body = el('div', 'cv-body');
  surface.content.append(body);

  return {
    el: surface.el,
    enter: () => {
      const row = campaign();
      body.replaceChildren(el('p', 'cv-note', t(
        'campaign_view.template_prefs_soon',
        'Which Cowork templates {campaign} offers. The selections land here once templates carry a Campaign.',
        { campaign: row?.title || t('campaign', 'Campaign') },
      )));
      setSurfaceState(surface.el, row ? 'inert' : 'empty', row ? '' : t('campaign_view.none_selected', 'No Campaign selected.'));
    },
  };
}
