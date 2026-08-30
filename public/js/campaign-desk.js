/* part of the ronin-cowork client — see js/README.md */
/**
 * THE CAMPAIGN'S DESK (owner, 2026-08-30). A desk_profile is a PRESET — a template of
 * the desk's components: skin, theme, Output, lexicon, kind, arrangement. Applying one
 * copies every component into the Campaign (`campaign_config.desk`); after that each
 * component is the Campaign's own and any one may be changed alone. So the surface is
 * the components, laid out as choices with the explanation beside each, and above them
 * the presets as pills with one Apply.
 *
 * Nothing here dereferences a catalog profile as a live source: the pill row reads the
 * catalog to OFFER a preset; the choices read `desk`, which the server copied.
 */
import { t } from './lexicon.js';
import { deskProfiles } from './desk-profile.js';
import { saveCampaign } from './campaigns.js';
import { WorkspaceKit } from './workspace-kit.js';
import { listSkins, setSkin } from './skins.js';
import { applyTheme } from './theme.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

/** A skin token, said as a word: `stock` → Stock. The catalog's labels are these. */
export const skinWord = (skin) => (skin ? skin[0].toUpperCase() + skin.slice(1) : '');
/** A rireki_view token, in the words the Output picker already uses — one literal key each, so the gate can see them. */
export const tileWord = (view) => ({
  locked: t('output.locked', 'Locked'),
  terminal_mirror: t('output.terminal_mirror', 'Terminal Mirror'),
  detailed: t('output.detailed', 'Detailed'),
  condensed: t('output.condensed', 'Condensed'),
  cherry_pick: t('output.cherry_pick', 'Cherry Pick'),
}[view] || view);

export function createDeskProfileSurface(campaign) {
  const { createSurface, createNotice, setSurfaceState } = WorkspaceKit.primitives;
  // The option lists, read at paint so the lexicon is up (KOKUGO § 5). Output: the two
  // positions that ship, then the three that arrive with Ronin Services.
  const OUTPUTS = () => [
    { value: 'terminal_mirror', label: tileWord('terminal_mirror') },
    { value: 'locked', label: tileWord('locked') },
    { value: 'detailed', label: tileWord('detailed'), services: true },
    { value: 'condensed', label: tileWord('condensed'), services: true },
    { value: 'cherry_pick', label: tileWord('cherry_pick'), services: true },
  ];
  const THEMES = () => [
    { value: 'light', label: t('campaign_view.theme_light', 'Light') },
    { value: 'dark', label: t('campaign_view.theme_dark', 'Dark') },
    { value: 'automatic', label: t('campaign_view.theme_auto', 'Automatic') },
  ];
  const KINDS = () => [
    { value: 'coding', label: t('kind.coding', 'coding') },
    { value: 'work', label: t('kind.work', 'work') },
    { value: 'personal', label: t('kind.personal', 'personal') },
    { value: 'household', label: t('kind.household', 'household') },
    { value: 'social', label: t('kind.social', 'social') },
    { value: 'school', label: t('kind.school', 'school') },
  ];
  const label = t('cowork.tab_profile', 'Desk profile');
  const surface = createSurface({ label, className: 'cv-surface' });
  const body = el('div', 'cv-body');
  surface.content.append(body);
  let skins = [];
  let picked = ''; // the preset pill pressed, not yet applied

  const notice = createNotice();
  const setDesk = async (patch) => {
    const row = campaign();
    if (!row) return;
    notice.set('info', t('campaign.saving', 'saving…'));
    const r = await saveCampaign(row.id, { desk: patch });
    notice.set(r.ok ? 'success' : 'failed', r.ok ? t('settei.saved', 'saved') : r.message);
    if (!r.ok) return;
    wear(campaign()?.desk);
    paint();
  };
  const apply = async () => {
    const row = campaign();
    if (!row || !picked) return;
    notice.set('info', t('campaign.saving', 'saving…'));
    const r = await saveCampaign(row.id, { desk_profile: picked });
    notice.set(r.ok ? 'success' : 'failed', r.ok ? t('campaign_view.applied', 'applied — every component below is now this Campaign’s own') : r.message);
    if (!r.ok) return;
    picked = '';
    wear(campaign()?.desk);
    paint();
  };
  /** The page wears the Campaign's desk as soon as it is saved — that is the point of a look. */
  const wear = (desk) => {
    if (desk?.skin) setSkin(desk.skin);
    if (desk?.theme) applyTheme(desk.theme === 'automatic' ? 'auto' : desk.theme);
  };

  /** One choice: its name and pills on the left, what it does on the right. */
  const choice = (name, options, current, why, onPick) => {
    const row = el('div', 'cv-choice');
    const left = el('div', 'cv-choice-pick');
    left.append(el('span', 'cv-choice-name', name));
    const pills = el('div', 'cv-pills');
    for (const o of options) {
      const b = el('button', 'cv-pill', o.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(o.value === current));
      if (o.services) { b.disabled = true; b.append(el('small', 'cv-pill-tag', t('campaign_view.with_services', 'Ronin Services'))); b.title = t('campaign_view.services_title', 'Arrives with Ronin Services.'); }
      if (onPick && !o.services) b.addEventListener('click', () => onPick(o.value));
      if (!onPick) b.disabled = true;
      pills.append(b);
    }
    left.append(pills);
    row.append(left, el('p', 'cv-choice-why', why));
    return row;
  };

  function paint() {
    const row = campaign();
    body.replaceChildren();
    if (!row) return setSurfaceState(surface.el, 'empty', t('campaign_view.none_selected', 'No Campaign selected.'));
    setSurfaceState(surface.el, null, '');
    const desk = row.desk || {};

    // PRESETS — pills, one Apply. The pill that matches the record's provenance is marked.
    const presets = el('div', 'cv-presets');
    presets.append(el('span', 'cv-eyebrow', t('campaign_view.presets', 'Presets')));
    const pills = el('div', 'cv-pills');
    for (const p of deskProfiles()) {
      const b = el('button', 'cv-pill', p.label || p.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', String((picked || row.desk_profile) === p.name));
      if (p.name === row.desk_profile && !picked) b.append(el('small', 'cv-pill-tag', t('campaign_view.applied_tag', 'applied')));
      b.title = p.blurb || '';
      b.addEventListener('click', () => { picked = p.name === row.desk_profile ? '' : p.name; paint(); });
      pills.append(b);
    }
    const go = el('button', 'cv-button', t('campaign_view.apply', 'Apply'));
    go.type = 'button'; go.dataset.primary = 'true'; go.disabled = !picked;
    go.addEventListener('click', () => void apply());
    pills.append(go);
    presets.append(pills, el('p', 'cv-note', t('campaign_view.presets_help', 'A preset copies all of its components into this Campaign. Change any one of them afterwards; the preset is not consulted again.')));
    body.append(presets);

    body.append(
      choice(t('campaign_view.skin', 'Skin'), skins.map((s) => ({ value: s.name, label: s.label || s.name })), desk.skin || '',
        t('campaign_view.skin_help', 'The look — colours, corners, faces. The page wears it now.'), (v) => void setDesk({ skin: v })),
      choice(t('campaign_view.theme', 'Theme'), THEMES(), desk.theme || 'automatic',
        t('campaign_view.theme_help', 'Light or dark, or whatever the device prefers.'), (v) => void setDesk({ theme: v })),
      choice(t('campaign_view.output', 'Output'), OUTPUTS(), desk.rireki_view || '',
        t('campaign_view.output_help', 'What an Agent’s tile shows. Terminal Mirror is the one that ships; Detailed, Condensed and Cherry Pick arrive with Ronin Services.'), (v) => void setDesk({ rireki_view: v })),
      choice(t('campaign_view.kind', 'Kind'), KINDS(), desk.campaign_kind || '',
        t('campaign_view.kind_help', 'The default kind of work for a new Cowork or project here. Nothing reads it yet.'), (v) => void setDesk({ campaign_kind: v })),
      choice(t('campaign_view.lexicon', 'Lexicon'), [{ value: desk.lexicon || '', label: desk.lexicon || t('settei.none_set', '— none set —') }], desk.lexicon || '',
        t('campaign_view.lexicon_help', 'The words. Held to one lexicon for now, so nothing on this page is offered.'), null),
      // team_arrangement is in the record but not offered: the Workbench remembers its own
      // arrangement per route now, so a profile-level default is vestigial (owner, 2026-08-30).
      notice.el,
    );
  }

  return {
    el: surface.el,
    enter: () => {
      paint();
      if (!skins.length) void listSkins().then((rows) => { skins = rows; paint(); });
    },
  };
}
