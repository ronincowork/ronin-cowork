/* part of the ronin-cowork client — see js/README.md */
/**
 * TEMPLATES — the Campaign's two shelves, and the library they grow from.
 *
 * The card on the Campaign page says Templates; until 2026-09-03 what opened was the
 * session roles. This is the surface the word meant: the team shelf (projects — a cast
 * that delivers a task), the agent shelf (people — one session's loadout), and under
 * them the TEMPLATE LIBRARY on ronincowork.com — bundles of a team, its people, and the
 * books, macros and tools they read, downloaded into the owner's own stores.
 *
 * Nothing is fetched from the site until the button is pressed (the update-check rule),
 * and nothing is written until the plan has been shown and Install pressed. The plan is
 * the server's (`/api/library/bundles/:name`); this only draws it. A file of the owner's
 * is written over only by the second, plainly worded button.
 */
import { t } from './lexicon.js';
import { request } from './request.js';
import { WorkspaceKit } from './workspace-kit.js';

const el = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

/** `{ teams: 2, sops: 1 }` → "2 teams · 1 SOP" in the person's words. Every key is spelled
 *  out so check-lexicon can see it; a templated key would be invisible to the floor check. */
export function holdsWords(holds) {
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
  const { createSurface, createCard, createAction, createActionBar, createNotice } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('league.templates', 'Templates'), className: 'cv-surface' });
  const body = el('div', 'cv-body');
  surface.content.append(body);
  let teams = [];
  let agents = [];
  let library = null; // { source, bundles } after the press; null before
  const shelves = el('div', 'cv-body');
  const detail = el('div', 'cv-body');
  const libraryRoom = el('div', 'cv-body');
  const libraryNotice = createNotice({});
  const libraryCards = el('div', 'cv-cards');
  const planRoom = el('div', 'cv-body');
  body.append(el('p', 'cv-note', t('campaign_view.templates_help', 'A template fills a launch form and stops — its answers become yours. Agents are people you assign; teams are projects a cast delivers. Both shelves are plain files: the ones you save, and the ones a bundle installs, live in your own stores.')));
  body.append(shelves, detail, libraryRoom);

  const originWord = (row) => (row.origin === 'user' ? (row.shadowed ? t('campaign_view.templates_yours_over', 'yours, replacing ours') : t('campaign_view.templates_yours', 'yours')) : t('campaign_view.templates_shipped', 'shipped'));

  const showTeam = (row) => {
    detail.replaceChildren();
    detail.append(el('span', 'cv-eyebrow', row.label || row.name));
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
    actions.append(link);
    detail.append(actions);
  };

  const paintShelves = () => {
    shelves.replaceChildren();
    const group = (heading, rows, isTeam) => {
      shelves.append(el('span', 'cv-eyebrow', heading));
      if (!rows.length) { shelves.append(el('p', 'cv-note', t('campaign_view.templates_none', 'Nothing on this shelf.'))); return; }
      const grid = el('div', 'cv-cards');
      for (const row of rows) {
        const metadata = [originWord(row)];
        if (isTeam) metadata.push(t('campaign_view.templates_agents_n', '{n} agents', { n: (row.agents || []).length }));
        if (row.kinds?.length) metadata.push(row.kinds.join(', '));
        grid.append(createCard({ heading: row.label || row.name, summary: row.blurb || '', mark: row.art || null, metadata, action: isTeam ? () => showTeam(row) : undefined }).el);
      }
      shelves.append(grid);
    };
    group(t('campaign_view.templates_teams', 'Teams — projects'), teams, true);
    group(t('campaign_view.templates_agents', 'Agents — people'), agents, false);
  };

  const readShelves = async () => {
    const [tm, ag] = await Promise.all([request('/api/templates/teams'), request('/api/templates/agents')]);
    teams = tm.ok && Array.isArray(tm.data) ? tm.data : [];
    agents = ag.ok && Array.isArray(ag.data) ? ag.data : [];
    paintShelves();
  };

  const showPlan = async (card) => {
    planRoom.replaceChildren(el('p', 'cv-note', t('campaign_view.library_reading', 'Reading {name} from the library…', { name: card.label || card.name })));
    const r = await request(`/api/library/bundles/${encodeURIComponent(card.name)}`, { cache: 'no-store' });
    planRoom.replaceChildren();
    if (!r.ok) { planRoom.append(el('p', 'cv-note', r.message)); return; }
    const plan = Array.isArray(r.data?.plan) ? r.data.plan : [];
    planRoom.append(el('span', 'cv-eyebrow', `${card.art ? `${card.art} ` : ''}${card.label || card.name}`));
    planRoom.append(el('p', 'cv-note', t('campaign_view.library_plan_help', 'What installing this bundle writes into your stores, and what it leaves alone.')));
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
    planRoom.append(table);
    const executables = plan.filter((i) => i.executable && i.verdict !== 'refused').length;
    if (executables) planRoom.append(el('p', 'cv-note', t('campaign_view.library_executables', 'This bundle installs {n} executable tools onto your Agents’ PATH. Read them before you rely on them.', { n: executables })));
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
    planRoom.append(bar.el, result.el);
  };

  const paintLibrary = () => {
    libraryCards.replaceChildren();
    if (!library) return;
    if (!library.bundles.length) { libraryNotice.set('info', t('campaign_view.library_none', 'The library lists no bundles yet.')); return; }
    for (const card of library.bundles) {
      const metadata = [holdsWords(card.holds)];
      if (card.version) metadata.push(card.version);
      if (card.kinds?.length) metadata.push(card.kinds.join(', '));
      libraryCards.append(createCard({ heading: card.label || card.name, summary: card.blurb || '', mark: card.art || null, metadata, action: () => { void showPlan(card); } }).el);
    }
  };

  const check = createAction({
    label: t('campaign_view.library_check', 'Check the library'),
    kind: 'primary',
    action: async () => {
      check.setDisabled(true);
      libraryNotice.set('info', t('campaign_view.library_checking', 'Asking ronincowork.com for its library…'));
      const r = await request('/api/library', { cache: 'no-store' });
      check.setDisabled(false);
      if (!r.ok) { library = null; libraryNotice.set('failed', r.message); paintLibrary(); return; }
      library = { source: r.data?.source || '', bundles: Array.isArray(r.data?.bundles) ? r.data.bundles : [] };
      libraryNotice.set('success', t('campaign_view.library_source', '{n} bundles from {source}', { n: library.bundles.length, source: library.source }));
      paintLibrary();
    },
  });
  libraryRoom.append(
    el('span', 'cv-eyebrow', t('campaign_view.library', 'Template library')),
    el('p', 'cv-note', t('campaign_view.library_help', 'Bundles on ronincowork.com: a team, its people, and the books, macros and tools they read, as one download. Nothing is fetched until you press, and the plan is shown before anything is written.')),
    createActionBar({ actions: [check] }).el,
    libraryNotice.el,
    libraryCards,
    planRoom,
  );
  libraryNotice.set('', '');

  return {
    el: surface.el,
    enter: () => { paintShelves(); void readShelves(); },
  };
}
