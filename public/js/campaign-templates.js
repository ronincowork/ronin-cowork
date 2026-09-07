/* part of the ronin-cowork client — see js/README.md */
import { t } from './lexicon.js';
import { request } from './request.js';
import { WorkspaceKit } from './workspace-kit.js';
import { templateBox } from './form-steps.js';
import { createStoneWorkSurface } from './stone-work-surface.js';

const el = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

export const CAMPAIGN_TEMPLATES_TYPE = 'campaign.templates';

export function campaignTemplatesDefinition() {
  return {
    type: CAMPAIGN_TEMPLATES_TYPE,
    header: 'surface',
    label: () => t('league.templates', 'Templates'),
    summary: () => t('campaign_view.templates_summary', 'Team casts, agent loadouts, and the library to download more from.'),
    create: () => {
      const surface = createTemplatesSurface();
      return { el: surface.el, show: () => surface.enter() };
    },
  };
}

/** `{ teams: 2, sops: 1 }` → "2 teams · 1 SOP" in the person's words. Every key is spelled
 *  out so check-lexicon can see it; a templated key would be invisible to the floor check. */
function holdsWords(holds) {
  const word = {
    teams: (n) => (n === 1 ? t('campaign_view.library_hold_team', 'team') : t('campaign_view.library_hold_teams', 'teams')),
    agents: (n) => (n === 1 ? t('campaign_view.library_hold_agent', 'agent') : t('campaign_view.library_hold_agents', 'agents')),
    routines: (n) => (n === 1 ? t('campaign_view.library_hold_routine', 'Routine') : t('campaign_view.library_hold_routines', 'Routines')),
    sops: (n) => (n === 1 ? t('campaign_view.library_hold_sop', 'SOP') : t('campaign_view.library_hold_sops', 'SOPs')),
    ways: (n) => (n === 1 ? t('campaign_view.library_hold_way', 'way of working') : t('campaign_view.library_hold_ways', 'ways of working')),
    library: (n) => (n === 1 ? t('campaign_view.library_hold_page', 'reference page') : t('campaign_view.library_hold_pages', 'reference pages')),
    macros: (n) => (n === 1 ? t('campaign_view.library_hold_macro', 'macro') : t('campaign_view.library_hold_macros', 'macros')),
    actions: (n) => (n === 1 ? t('campaign_view.library_hold_action', 'action') : t('campaign_view.library_hold_actions', 'actions')),
    tools: (n) => (n === 1 ? t('campaign_view.library_hold_tool', 'tool') : t('campaign_view.library_hold_tools', 'tools')),
  };
  const parts = [];
  for (const [key, say] of Object.entries(word)) {
    const n = holds?.[key];
    if (n) parts.push(`${n} ${say(n)}`);
  }
  return parts.join(' · ');
}

/** A plan verdict (src/bundles.ts) in the person's words. */
function verdictWord(v) {
  switch (v) {
    case 'new': return t('campaign_view.verdict_new', 'new — will be added');
    case 'shadows-shipped': return t('campaign_view.verdict_shadows', 'yours will replace the shipped one');
    case 'replaces-yours': return t('campaign_view.verdict_replaces', 'you already have your own — kept unless you say replace');
    case 'same-as-shipped': return t('campaign_view.verdict_same_shipped', 'already shipped — skipped');
    case 'same-as-yours': return t('campaign_view.verdict_same_yours', 'already yours — skipped');
    case 'refused': return t('campaign_view.verdict_refused', 'refused — a bundle never replaces one of Ronin’s tools');
    default: return String(v || '');
  }
}

export function createTemplatesSurface() {
  const { createSurface, createAction, createActionBar, createNotice } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('league.templates', 'Templates'), className: 'cv-surface' });
  const body = el('div', 'cv-body');
  surface.content.append(body);
  let kind = 'open';
  let shape = 'all'; // all · team · agent — the second axis, beside kind (owner, 2026-09-03)
  let teams = [];
  let agents = [];
  let library = null; // { source, bundles } after the press; null before
  let picked = '';    // the box whose detail is open: `library:<name>` · `team:<name>` · `agent:<name>`
  const kindHost = el('div');
  const libraryRoom = el('div', 'cv-body');
  const libraryNotice = createNotice({});
  const libraryGrid = el('div', 'fs-tmplgrid');
  const installedHead = el('div', 'cv-body');
  installedHead.append(
    el('span', 'cv-eyebrow', t('campaign_view.templates_on_system', 'On your system')),
    el('p', 'cv-note', t('campaign_view.templates_on_system_help', 'Templates available to New Team and New Agent, shipped with Ronin, installed, or saved by you.')),
    kindHost,
  );
  const stoneSurface = createStoneWorkSurface({
    renderDetail: (item, host) => {
      if (item.templateType === 'team') showTeam(item.row, host);
      else if (item.templateType === 'agent') showAgent(item.row, host);
      else if (item.templateType === 'library') void showPlan(item.row, host);
      else host.append(el('p', 'cv-note', item.message));
    },
    onSelectionChange: (id) => { picked = id || ''; paintLibrary(); },
  });
  stoneSurface.mount(body, { before: [installedHead], after: [libraryRoom] });

  const byKind = (rows) => (kind === 'open' ? rows : rows.filter((row) => (row.kinds || []).includes(kind)));
  const originWord = (row) => (row.origin === 'user' ? (row.shadowed ? t('campaign_view.templates_yours_over', 'yours, replacing ours') : t('campaign_view.templates_yours', 'yours')) : t('campaign_view.templates_shipped', 'shipped'));
  const filterGroup = (label, choices, current, pick) => {
    const group = el('span');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    group.append(el('span', 'cv-eyebrow', label));
    for (const [key, word] of choices) {
      const box = el('button', 'cv-button', word);
      box.type = 'button';
      box.setAttribute('aria-pressed', String(key === current));
      box.addEventListener('click', () => pick(key));
      group.append(box);
    }
    return group;
  };
  const paintKinds = () => {
    const row = createActionBar({ label: t('campaign_view.templates_filter', 'Filter templates') });
    row.el.setAttribute('aria-label', t('campaign_view.templates_filter', 'Filter templates'));
    row.el.append(
      filterGroup(t('campaign_view.shape', 'Show'), [['all', t('campaign_view.shape_all', 'All')], ['team', t('campaign_view.shape_team', 'Teams')], ['agent', t('campaign_view.shape_agent', 'Agents')]], shape, (key) => { shape = key; paintKinds(); paintLibrary(); paintShelves(); }),
      filterGroup(t('kind', 'Kind'), [['open', t('kind.open', 'open')], ['coding', t('kind.coding', 'coding')], ['work', t('kind.work', 'work')], ['personal', t('kind.personal', 'personal')], ['household', t('kind.household', 'household')], ['social', t('kind.social', 'social')], ['school', t('kind.school', 'school')]], kind, (key) => { kind = key; paintKinds(); paintLibrary(); paintShelves(); }),
    );
    kindHost.replaceChildren(row.el);
  };
  const isTeamCard = (card) => !!card.holds?.teams;
  const byShape = (rows, isTeam) => (shape === 'all' ? rows : rows.filter((row) => (shape === 'team') === isTeam(row)));

  /* ---- a picked box opens its detail under the grids ---- */
  /** One of the owner's boxes can go again; the second press is the yes. */
  const removeAction = (shelf, row, detail) => {
    if (row.origin !== 'user') return null;
    const b = createAction({ label: t('campaign_view.templates_remove', 'Remove from my system'), kind: 'danger' });
    let armed = false;
    b.el.addEventListener('click', async () => {
      if (!armed) { armed = true; b.el.textContent = t('campaign_view.templates_remove_sure', 'Remove — press again to confirm'); return; }
      b.setDisabled(true);
      const r = await request(`/api/templates/${shelf}/${encodeURIComponent(row.name)}`, { method: 'DELETE' });
      if (!r.ok) { b.setDisabled(false); armed = false; b.el.textContent = r.message; return; }
      picked = '';
      const message = r.data?.shipped_back ? t('campaign_view.templates_removed_back', 'Removed {name}; the shipped one is back.', { name: row.label || row.name }) : t('campaign_view.templates_removed', 'Removed {name} from your system. It is still on the library.', { name: row.label || row.name });
      await readShelves();
      stoneSurface.openDetail({ templateType: 'notice', message });
    });
    return b.el;
  };
  const showTeam = (row, detail) => {
    detail.replaceChildren(el('span', 'cv-eyebrow', `${row.art ? `${row.art} ` : ''}${row.label || row.name} · ${originWord(row)}`));
    if (row.objective) detail.append(el('p', 'cv-note', row.objective));
    const table = el('table', 'cv-table');
    const head = el('tr');
    head.append(el('th', null, t('campaign_view.templates_cast', 'Cast')), el('th', null, t('campaign_view.templates_instructions', 'Instructions')));
    table.append(head);
    for (const a of row.agents || []) {
      const tr = el('tr');
      const name = el('td'); name.append(el('b', null, a.team_lead ? `人 ${a.name}` : a.name));
      tr.append(name, el('td', null, a.instructions || ''));
      table.append(tr);
    }
    detail.append(table);
    if (row.behaviours?.length) detail.append(el('p', 'cv-note', `${t('campaign_view.templates_books', 'Reads')}: ${row.behaviours.join(', ')}`));
    const link = el('a', 'cv-button', t('campaign_view.templates_download', 'Download as a bundle'));
    link.href = `/api/library/pack/${encodeURIComponent(row.name)}`;
    link.download = `${row.name}.json`;
    link.title = t('campaign_view.templates_download_help', 'This template, with your copies of the books and Routines it names, as one file you could put on a library.');
    const actions = el('div', 'cv-actions');
    const remove = removeAction('teams', row, detail);
    if (remove) actions.append(remove);
    actions.append(link);
    detail.append(actions);
  };
  const showAgent = (row, detail) => {
    detail.replaceChildren(el('span', 'cv-eyebrow', `${row.art ? `${row.art} ` : ''}${row.label || row.name} · ${originWord(row)}`));
    if (row.brief) detail.append(el('p', 'cv-note', row.brief));
    if (row.behaviours?.length) detail.append(el('p', 'cv-note', `${t('campaign_view.templates_books', 'Reads')}: ${row.behaviours.join(', ')}`));
    const remove = removeAction('agents', row, detail);
    if (remove) { const actions = el('div', 'cv-actions'); actions.append(remove); detail.append(actions); }
  };

  const showPlan = async (card, detail) => {
    detail.replaceChildren(el('p', 'cv-note', t('campaign_view.library_reading', 'Reading {name} from the library…', { name: card.label || card.name })));
    const r = await request(`/api/library/bundles/${encodeURIComponent(card.name)}`, { cache: 'no-store' });
    if (picked !== `library:${card.name}`) return;
    detail.replaceChildren();
    if (!r.ok) { detail.append(el('p', 'cv-note', r.message)); return; }
    const plan = Array.isArray(r.data?.plan) ? r.data.plan : [];
    const bundle = r.data?.bundle || null;
    detail.append(el('span', 'cv-eyebrow', `${card.art ? `${card.art} ` : ''}${card.label || card.name} · ${holdsWords(card.holds)}`));
    if (card.blurb) detail.append(el('p', 'cv-note', card.blurb));
    detail.append(el('p', 'cv-note', t('campaign_view.library_plan_help', 'What installing this bundle writes into your stores, and what it leaves alone.')));
    const table = el('table', 'cv-table');
    const head = el('tr');
    head.append(el('th', null, t('campaign_view.library_plan_store', 'Shelf')), el('th', null, t('campaign_view.library_plan_item', 'Item')), el('th', null, t('campaign_view.library_plan_verdict', 'Outcome')));
    table.append(head);
    for (const item of plan) {
      const tr = el('tr');
      const name = el('td'); name.append(el('b', null, item.path));
      tr.append(el('td', null, item.store), name, el('td', null, `${verdictWord(item.verdict)}${item.why ? ` — ${item.why}` : ''}`));
      table.append(tr);
    }
    detail.append(table);
    const executables = plan.filter((i) => i.executable && i.verdict !== 'refused').length;
    if (executables) detail.append(el('p', 'cv-note', t('campaign_view.library_executables', 'This bundle installs {n} executable tools onto your Agents’ PATH. Read them before you rely on them.', { n: executables })));
    // EVERYTHING IT HOLDS, before Install (owner, 2026-09-03): the site shows descriptions;
    // the documents themselves are read here, file by file, as they will land.
    if (bundle) {
      const show = createAction({ label: t('campaign_view.library_show_all', 'Show everything it holds') });
      const contents = el('div', 'cv-body');
      contents.hidden = true;
      show.el.addEventListener('click', () => { contents.hidden = !contents.hidden; show.el.textContent = contents.hidden ? t('campaign_view.library_show_all', 'Show everything it holds') : t('campaign_view.library_hide_all', 'Hide the contents'); });
      for (const f of bundle.files || []) { contents.append(el('span', 'cv-eyebrow', `${f.store}/${f.path}${f.executable ? ' · executable' : ''}`), el('pre', 'cv-pre', f.text)); }
      for (const e of bundle.entries || []) { contents.append(el('span', 'cv-eyebrow', `${e.catalog} · ${e.name}`), el('pre', 'cv-pre', e.text)); }
      detail.append(createActionBar({ actions: [show] }).el, contents);
    }
    const writes = plan.filter((i) => i.verdict === 'new' || i.verdict === 'shadows-shipped').length;
    const replaces = plan.filter((i) => i.verdict === 'replaces-yours').length;
    const result = createNotice({});
    const install = async (replace) => {
      result.set('info', t('campaign_view.library_installing', 'Installing…'));
      const w = await request('/api/library/install', { method: 'POST', json: { name: card.name, replace } });
      if (!w.ok) { result.set('failed', w.message); return; }
      const receipt = w.data?.receipt || {};
      result.set('success', t('campaign_view.library_installed', 'Installed {label}: {written} written · {skipped} left alone · {refused} refused.', { label: card.label || card.name, written: (receipt.written || []).length, skipped: (receipt.skipped || []).length, refused: (receipt.refused || []).length }));
      void readShelves();
    };
    const bar = createActionBar({ label: t('campaign_view.library_install', 'Install') });
    bar.append(createAction({ label: writes ? t('campaign_view.library_install_n', 'Install ({n})', { n: writes }) : t('campaign_view.library_nothing_to_write', 'Nothing new to install'), kind: 'primary', disabled: !writes, action: () => install(false) }));
    if (replaces) bar.append(createAction({ label: t('campaign_view.library_install_replace', 'Install, replacing my {n}', { n: replaces }), action: () => install(true) }));
    detail.append(bar.el, result.el);
  };

  /* ---- the library, first ---- */
  const paintLibrary = () => {
    libraryGrid.replaceChildren();
    if (!library) return;
    const rows = byShape(byKind(library.bundles), isTeamCard);
    if (!rows.length) { libraryNotice.set('info', library.bundles.length ? t('campaign_view.library_none_kind', 'Nothing of this kind on the library.') : t('campaign_view.library_none', 'The library lists no bundles yet.')); return; }
    for (const card of rows) {
      libraryGrid.append(templateBox(card.art || '▤', card.label || card.name, card.blurb || '', picked === `library:${card.name}`, () => {
        picked = `library:${card.name}`;
        stoneSurface.openDetail({ id: picked, templateType: 'library', row: card });
        paintLibrary();
      }));
    }
  };
  const check = createAction({
    label: t('campaign_view.library_check', 'Check the library'),
    kind: 'primary',
    action: async () => {
      check.setDisabled(true);
      libraryNotice.set('info', t('campaign_view.library_checking', 'Asking Ronin HQ for the library…'));
      const r = await request('/api/library', { cache: 'no-store' });
      check.setDisabled(false);
      if (!r.ok) {
        library = null;
        // Services off: the shelf is there and opaque; say so, and say where the switch is.
        // The server's sentence is the truth in the three facts' own words (installed ·
        // activated · switched); it names Ronin Desk → Installed. Never "off" from here.
        libraryNotice.set(r.data?.services_off ? 'warning' : 'failed', r.message);
        paintLibrary();
        return;
      }
      library = { source: r.data?.source || '', bundles: Array.isArray(r.data?.bundles) ? r.data.bundles : [] };
      libraryNotice.set('success', t('campaign_view.library_source', '{n} bundles on the library', { n: library.bundles.length }));
      paintLibrary();
    },
  });
  const libraryAbout = el('details');
  libraryAbout.append(
    el('summary', null, t('campaign_view.library_about', 'About the Ronin Library')),
    el('p', 'cv-note', t('campaign_view.library_help', 'The shelf Ronin keeps and grows, a Ronin Services feature: a team, its people, and the books, macros and tools they read. Nothing is fetched until you press; everything a bundle holds is shown before anything is written.')),
  );
  libraryRoom.append(
    el('span', 'cv-eyebrow', t('campaign_view.library', 'Ronin Library')),
    createActionBar({ actions: [check] }).el,
    libraryNotice.el,
    libraryAbout,
    libraryGrid,
  );
  libraryNotice.set('', '');

  /* ---- the shelves on this machine, first ---- */
  const paintShelves = () => {
    const items = [];
    const add = (rows, templateType) => {
      for (const row of byKind(rows)) items.push({
        id: `${templateType}:${row.name}`,
        label: row.label || row.name,
        glyph: row.art || (templateType === 'team' ? '人人' : '人'),
        secondary: templateType === 'team' ? t('campaign_view.templates_team', 'Team') : t('campaign_view.templates_agent', 'Agent'),
        state: originWord(row),
        templateType,
        row,
      });
    };
    if (shape !== 'agent') add(teams, 'team');
    if (shape !== 'team') add(agents, 'agent');
    stoneSurface.setItems(items);
  };
  const readShelves = async () => {
    const [tm, ag] = await Promise.all([request('/api/templates/teams'), request('/api/templates/agents')]);
    teams = tm.ok && Array.isArray(tm.data) ? tm.data : [];
    agents = ag.ok && Array.isArray(ag.data) ? ag.data : [];
    paintShelves();
  };

  return {
    el: surface.el,
    enter: () => { paintKinds(); paintLibrary(); paintShelves(); void readShelves(); },
  };
}
