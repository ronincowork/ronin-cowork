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
import { listSkins, setSkin } from './skin-catalog.js';
import { applyTheme, setCampaignTheme } from './theme.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

/** One choice: its name and pills on the left, what it does on the right. Shared by the desk and roots surfaces. */
export const choice = (name, options, current, why, onPick) => {
  const row = el('div', 'cv-choice');
  const left = el('div', 'cv-choice-pick');
  left.append(el('span', 'cv-choice-name', name));
  const pills = el('div', 'cv-pills');
  for (const o of options) {
    const b = el('button', 'cv-pill', o.label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(o.value === current));
    if (o.services) { b.disabled = true; b.append(el('small', 'cv-pill-tag', t('campaign_view.with_services', 'Ronin Services'))); b.title = t('campaign_view.services_title', 'Arrives with Ronin Services.'); }
    // The row marks its own pick in place — callers stage drafts and must not need a
    // whole-surface repaint just to show which pill is down.
    if (onPick && !o.services) b.addEventListener('click', () => { for (const sib of pills.children) sib.setAttribute('aria-pressed', String(sib === b)); onPick(o.value); });
    if (!onPick) b.disabled = true;
    pills.append(b);
  }
  left.append(pills);
  row.append(left, el('p', 'cv-choice-why', why));
  return row;
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
  const { createSurface, createNotice, setSurfaceState, createAction } = WorkspaceKit.primitives;
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
  // ONE Apply, in the surface header (owner, 2026-09-01) — the buried in-body button is
  // gone. Revert beside it drops the draft. Both act on closures defined below.
  const applyAct = createAction({ label: t('campaign_view.apply', 'Apply'), kind: 'primary', disabled: true, action: () => void apply() });
  const revertAct = createAction({ label: t('campaign_view.revert', 'Revert'), disabled: true, action: () => revert() });
  const surface = createSurface({ label, className: 'cv-surface', actions: [revertAct, applyAct] });
  const body = el('div', 'cv-body');
  surface.content.append(body);
  let skins = [];

  /* THE WHOLE SURFACE IS STAGED (owner, 2026-09-01: "step back and think about this
     holistically… it should be much cleaner than it is"). Two models on one surface was
     the smell: preset pills staged-then-Apply while every settings row saved instantly,
     wearing and repainting mid-edit — the screen flipped theme and the pills jumped
     before Apply was ever pressed. Now ONE draft is seeded from the record; every
     control, preset pills included, edits the draft only; nothing saves or wears
     mid-edit. One Apply in the surface header commits it all in one write; Revert
     drops the draft. */
  let picked = ''; // the preset staged into the draft, not yet applied
  let draft = {}; // the staged desk — what every control below edits
  const FIELDS = ['skin', 'theme', 'theme_mobile', 'rireki_view', 'lexicon'];
  // 'automatic' and '' both mean the house default; records written before the staged
  // surface may carry either spelling, so the draft and the dirt test speak ''.
  const norm = (v) => (v === 'automatic' ? '' : v || '');
  const seed = () => { const d = campaign()?.desk || {}; draft = Object.fromEntries(FIELDS.map((f) => [f, norm(d[f])])); picked = ''; };
  const isDirty = () => { const d = campaign()?.desk || {}; return !!picked || FIELDS.some((f) => norm(draft[f]) !== norm(d[f])); };
  /** Apply sits opaque while clean and goes bright kiiro the moment the draft moves. */
  const arm = () => { const dirty = isDirty(); applyAct.setDisabled(!dirty); revertAct.setDisabled(!dirty); applyAct.el.dataset.attention = String(dirty); };

  const notice = createNotice();
  const apply = async () => {
    const row = campaign();
    if (!row || !isDirty()) return;
    notice.set('info', t('campaign.saving', 'saving…'));
    // ONE write: the server applies the staged preset's template first, then the draft
    // on top (campaign-config.writeCampaign), so provenance and the owner's explicit
    // rows land together.
    const r = await saveCampaign(row.id, { ...(picked ? { desk_profile: picked } : {}), desk: { ...draft } });
    notice.set(r.ok ? 'success' : 'failed', r.ok ? t('campaign_view.applied', 'applied — every component below is now this Campaign’s own') : r.message);
    if (!r.ok) return;
    seed();
    wear(campaign()?.desk);
    arm();
    paint();
  };
  const revert = () => { seed(); arm(); paint(); };
  /** The page wears the Campaign's desk when Apply lands — never mid-edit. */
  const wear = (desk) => {
    if (desk?.skin) setSkin(desk.skin);
    // The saved themes become the system's word (both surfaces), and this page repaints
    // under it — theme.js resolves the right one for the surface it is on, and its
    // storage listener carries the save to pages already open. Known one-time flicker:
    // a first visit with an empty tmuxgrid.theme.system* cache paints light and
    // corrects here when the served value arrives; boot-pending covers full boots.
    setCampaignTheme(desk || null);
    applyTheme();
  };


  function paint() {
    const row = campaign();
    body.replaceChildren();
    if (!row) return setSurfaceState(surface.el, 'empty', t('campaign_view.none_selected', 'No Campaign selected.'));
    setSurfaceState(surface.el, null, '');
    const desk = row.desk || {};

    // PRESETS — pills that STAGE. Pressing one fills the draft with the preset's
    // components so the rows below preview it; nothing saves until the header's Apply.
    const presets = el('div', 'cv-presets');
    presets.append(el('span', 'cv-eyebrow', t('campaign_view.presets', 'Presets')));
    const pills = el('div', 'cv-pills');
    for (const p of deskProfiles()) {
      const b = el('button', 'cv-pill', p.label || p.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', String((picked || row.desk_profile) === p.name));
      if (p.name === row.desk_profile && !picked) b.append(el('small', 'cv-pill-tag', t('campaign_view.applied_tag', 'applied')));
      b.title = p.blurb || '';
      b.addEventListener('click', () => {
        picked = picked === p.name ? '' : p.name;
        if (picked) { for (const f of FIELDS) draft[f] = p[f] || ''; } else seed();
        arm();
        paint(); // calm now: staging wears nothing, so the repaint only re-marks rows
      });
      pills.append(b);
    }
    presets.append(pills, el('p', 'cv-note', t('campaign_view.presets_help', 'A preset copies all of its components into this Campaign. Change any one of them afterwards; the preset is not consulted again.')));
    body.append(presets);

    // The rows read and edit the DRAFT. A tap marks its own row and arms Apply — no
    // repaint, no save, no mid-edit wear (the flash @mobile measured on the iPad).
    body.append(
      choice(t('campaign_view.skin', 'Skin'), skins.map((s) => ({ value: s.name, label: s.label || s.name })), draft.skin || '',
        t('campaign_view.skin_help', 'The look — colours, corners, faces.'), (v) => { draft.skin = v; arm(); }),
      choice(t('campaign_view.theme', 'Theme'), THEMES(), draft.theme || 'automatic',
        t('campaign_view.theme_help', 'Light or dark for pointer surfaces; Automatic is the house default — light.'), (v) => { draft.theme = v === 'automatic' ? '' : v; arm(); }),
      // The touch surfaces' own answer (owner, 2026-09-01): an iPad can be light while
      // the desktop is dark, and both are the Campaign's word — no per-device fiddling.
      choice(t('campaign_view.theme_mobile', 'Theme (mobile)'), THEMES(), draft.theme_mobile || 'automatic',
        t('campaign_view.theme_mobile_help', 'Light or dark for touch surfaces — iPad and phone; Automatic is the house default — light.'), (v) => { draft.theme_mobile = v === 'automatic' ? '' : v; arm(); }),
      choice(t('campaign_view.output', 'Output'), OUTPUTS(), draft.rireki_view || '',
        t('campaign_view.output_help', 'What an Agent’s tile shows. Terminal Mirror is the one that ships; Detailed, Condensed and Cherry Pick arrive with Ronin Services.'), (v) => { draft.rireki_view = v; arm(); }),
      choice(t('campaign_view.lexicon', 'Lexicon'), [{ value: draft.lexicon || '', label: draft.lexicon || t('settei.none_set', '— none set —') }], draft.lexicon || '',
        t('campaign_view.lexicon_help', 'The words. Held to one lexicon for now, so nothing on this page is offered.'), null),
      // team_arrangement is in the record but not offered: the Workbench remembers its own
      // arrangement per route now, so a profile-level default is vestigial (owner, 2026-08-30).
      notice.el,
    );
  }

  return {
    el: surface.el,
    enter: () => {
      seed();
      arm();
      paint();
      if (!skins.length) void listSkins().then((rows) => { skins = rows; paint(); });
    },
  };
}
