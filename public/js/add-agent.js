/* part of the ronin-cowork client — see js/README.md */
/**
 * ADD AGENT TO TEAM — the in-Team quick launch, on the Workspace Kit.
 *
 * This is the Team page's shortcut: always a Cowork Agent, with the Team supplying kind,
 * place and Routines. Terminal and bare-metal choices live on the full launch page.
 *
 * WHY IT IS NOT NEW AGENT. You are already in the Team, so the Team has answered most of
 * the form: its name, its project_root, and — once the cascade records exist — its
 * routines, its behaviours and its Agent defaults. This surface asks only what is
 * genuinely this one Agent's, and states the rest at the foot where it cannot be edited.
 * The drawn contract is ronin-lab `concepts/add-agent-to-team.html`; the object shape is
 * `wip/buildouts/NEW_AGENT.md` § 7.3 and § 7.4.
 *
 * WHAT IS DELIBERATELY MISSING, and it is not an oversight:
 *   - no team picker — you are in the Team;
 *   - no project_root picker — the roster's root is the default and is read;
 *   - no gbrain toggle — that is a Routine, and Routines are the Team's;
 *   - no optional drawer (seed paths / inject / reference): no scenario was named for it;
 *   - no shelf of roles standing between the press and the form.
 *
 * WHERE THE ANSWERS COME FROM. `GET /api/launch-seed?team=<name>` — the frozen contract
 * at `CASCADE.md` § 5.1: per-field `{ value, stated_by }`, a routines preview, and the
 * `still_asked` residue. The forms never reconstruct the cascade client-side, and the
 * door serves this surface and New Agent identically (the quick launch just always
 * passes `team`). **The door is frozen but not yet built**, so a 404 is an ordinary
 * answer here: the surface falls back to the roster's own project_root and draws nothing
 * it cannot prove. It gains the rest as the records land, without another edit.
 */
import { launchSpecData, projectData } from './home.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { dialRow, dialRowMulti } from './form-steps.js';
import { swapTeamLead } from './team-lead-swap.js';

const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
const OUTPUT = ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team', 'no code'];

/**
 * @param {object} kit  the Workspace Kit
 * @param {object} options
 *   `team()` the Team this page shows · `roster()` its durable record or null ·
 *   `members()` its live members for an exclusive leadership handoff ·
 *   `connect(name)` seats the born Agent in the workspace that made it.
 */
export function createAddAgentView(kit, { team, roster, members, connect, fullLaunch } = {}) {
  const { createSurface, createAction, createActionBar, createField, createNotice } = kit.primitives;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  const draft = {
    name: '', instruction: '', provider: '', model: '', template: '', behaviours: [],
    reach: 'open', recruit: 'open', output: ['open'], teamLead: false,
  };
  let busy = false;
  let templates = [];
  /** The seed door's answer, or null while it does not exist yet. */
  let seed = null;
  const seeded = (field) => seed?.seeds?.[field]?.value ?? '';
  const statedBy = (field) => seed?.seeds?.[field]?.stated_by?.[0]?.layer || '';

  const surface = createSurface({ label: t('add_agent.title', 'Add Agent to Team'), className: 'aa-surface' });
  const form = el('div', 'aa-form');
  const notice = createNotice();

  const teamName = () => (typeof team === 'function' ? team() : team) || '';
  const rosterRow = () => (typeof roster === 'function' ? roster() : roster) || null;
  // The door first, the roster second, the top active root last — each is a real answer
  // and the fallbacks exist because the door lands after this surface does.
  const rootOf = () => seeded('project_root') || rosterRow()?.project_root || projectData?.[0]?.name || '';
  const kindOf = () => seeded('kind') || rosterRow()?.kind || '';

  /* ---- this Agent's choices ---- */
  const nameInput = el('input');
  nameInput.type = 'text';
  nameInput.autocapitalize = 'off';
  nameInput.autocomplete = 'off';
  nameInput.spellcheck = false;
  nameInput.maxLength = 40;
  nameInput.placeholder = t('add_agent.name_placeholder', 'name');
  // Character-for-character, so the caret never jumps — the same transform the server
  // applies (`sanitizeName`, src/spawn.ts). Length is preserved, so mid-string edits hold.
  nameInput.addEventListener('input', () => {
    const clean = nameInput.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (clean !== nameInput.value) {
      const at = nameInput.selectionStart;
      nameInput.value = clean;
      nameInput.setSelectionRange(at, at);
    }
    draft.name = nameInput.value;
  });
  const nameField = createField({ label: t('add_agent.name', 'name'), control: nameInput });

  const instruction = el('textarea');
  instruction.rows = 3;
  instruction.autocapitalize = 'off';
  instruction.spellcheck = false;
  instruction.placeholder = t('add_agent.instruction_placeholder', 'what this Agent should do');
  instruction.addEventListener('input', () => { draft.instruction = instruction.value; });
  const instructionField = createField({ label: t('add_agent.instruction', 'instruction'), control: instruction });

  // This shortcut offers an EXCLUSIVE handoff. The system still permits several leaders
  // through Team configuration; here "Make Team Lead" means the newborn replaces whoever
  // currently carries this Team's mark.
  const leadChoice = el('label', 'aa-lead-choice');
  const leadInput = el('input');
  leadInput.type = 'checkbox';
  leadInput.addEventListener('change', () => { draft.teamLead = leadInput.checked; });
  const leadWords = el('span');
  leadWords.append(
    el('b', null, t('add_agent.make_team_lead', 'Make Team Lead')),
    el('small', null, t('add_agent.make_team_lead_sub', 'Replace the current Team Lead when this Agent launches.')),
  );
  leadChoice.append(leadInput, leadWords);

  /* Optional shortcut only. The full form owns browsing and saving templates; here one
     selected agent template simply overlays the Team defaults before the owner's hand. */
  const templateSelect = el('select');
  const templateField = createField({ label: t('add_agent.template', 'template'), control: templateSelect });
  function resetTemplateAnswers() {
    const value = (field) => seeded(field);
    draft.instruction = '';
    instruction.value = '';
    draft.behaviours = Array.isArray(value('behaviours')) ? [...value('behaviours')] : [];
    draft.reach = value('reach') || 'open';
    draft.recruit = value('recruit') || 'open';
    draft.output = [value('output') || 'open'].flat().filter(Boolean);
  }
  function applyTemplate() {
    draft.template = templateSelect.value;
    resetTemplateAnswers();
    const row = templates.find((entry) => entry.name === draft.template);
    if (row) {
      draft.instruction = row.brief || '';
      instruction.value = draft.instruction;
      if (row.mandate) {
        draft.reach = row.mandate.reach;
        draft.recruit = row.mandate.recruit;
        draft.output = [row.mandate.output].flat().filter(Boolean);
      }
      if (row.behaviours.length) draft.behaviours = [...row.behaviours];
    }
    paintMandate();
  }
  templateSelect.addEventListener('change', applyTemplate);
  function paintTemplates() {
    const kind = kindOf();
    const offered = !kind || kind === 'open' ? templates : templates.filter((row) => row.kinds.includes(kind));
    templateSelect.replaceChildren(new Option(t('add_agent.no_template', 'No template'), ''));
    for (const row of offered) templateSelect.add(new Option(row.label, row.name));
    if (!offered.some((row) => row.name === draft.template)) draft.template = '';
    templateSelect.value = draft.template;
  }

  // TWO PICKS, AND EITHER MAY STAND ALONE. Naming the provider and no model gets that
  // provider's preferred model, server-side; both blank is the install default. The
  // model select is disabled until a provider names its table — there is nothing to
  // pick FROM before that.
  const providerSelect = el('select');
  const modelSelect = el('select');
  const providerField = createField({ label: t('add_agent.provider', 'model provider'), control: providerSelect });
  const modelField = createField({ label: t('add_agent.model', 'model'), control: modelSelect });
  providerSelect.addEventListener('change', () => {
    draft.provider = providerSelect.value;
    draft.model = '';
    paintModels();
  });
  modelSelect.addEventListener('change', () => { draft.model = modelSelect.value; });

  function paintModels() {
    const rows = Array.isArray(launchSpecData) ? launchSpecData : [];
    modelSelect.replaceChildren();
    modelSelect.add(new Option(t('add_agent.default', 'default'), ''));
    for (const row of rows) if (row.provider === draft.provider) modelSelect.add(new Option(row.model, row.model));
    modelSelect.value = draft.model;
    modelSelect.disabled = !draft.provider;
  }
  function paintProviders() {
    const rows = Array.isArray(launchSpecData) ? launchSpecData : [];
    const seen = [...new Set(rows.map((row) => row.provider).filter(Boolean))];
    providerSelect.replaceChildren();
    providerSelect.add(new Option(t('add_agent.default', 'default'), ''));
    for (const name of seen) providerSelect.add(new Option(name, name));
    providerSelect.value = seen.includes(draft.provider) ? draft.provider : '';
    draft.provider = providerSelect.value;
    paintModels();
  }

  const mandateHead = el('p', 'aa-head', t('mandate', 'Mandate'));
  const mandateHost = el('div', 'aa-mandate');
  function paintMandate() {
    mandateHost.replaceChildren(
      dialRow(t('reach', 'Reach'), REACH, draft.reach, (value) => { draft.reach = value; paintMandate(); }),
      dialRow(t('recruit', 'Recruit'), RECRUIT, draft.recruit, (value) => { draft.recruit = value; paintMandate(); }),
      dialRowMulti(t('output', 'Output'), OUTPUT, draft.output, (value, on) => {
        draft.output = on ? [...draft.output, value] : draft.output.filter((entry) => entry !== value);
        paintMandate();
      }),
    );
  }

  /* ---- THE DESK IS NOT AN ASKED QUESTION (owner, 2026-08-31, folding the earlier
     control): the routine selection IS the decision, so this row is a CONSEQUENCE LINE —
     it says which of the two states the resolved routines give, and offers no switch.
     Allocation stays lazy either way: the Routine is the Agent-side capability, while
     each Project Root independently allows Worktrees or requires the checkout.
     `desk: own | none` survives on the launch body as an unadvertised escape hatch; no
     form surfaces it, and this one no longer sends it. ---- */
  const deskLine = el('div', 'aa-deskline');
  const deskWhy = el('small');
  deskLine.append(deskWhy);
  /** Is `ronin_worktrees` on for this birth? The resolved map's answer, never this
   *  form's — and null while the seed door is not there to ask. */
  const controlled = () => {
    const rows = seed?.routines;
    if (!Array.isArray(rows)) return null;
    return rows.some((r) => r.on && r.name === 'ronin_worktrees');
  };
  function paintDesk() {
    const control = controlled();
    // Nothing is claimed before the resolved map has answered.
    deskLine.hidden = control === null;
    if (control === null) return;
    deskWhy.textContent = control
      ? t('add_agent.desk_line_control', 'Ronin Worktrees is on for this Team. In each Project Root that also allows Worktrees, this Agent gets a private branch and worktree and can hand work in; other roots use their checkout.')
      : t('add_agent.desk_line_plain', 'Ronin Worktrees is off for this Team. This Agent uses each repository checkout even when that Project Root allows Worktrees.');
  }

  /* ---- what the Team fixed: at the FOOT, because none of it is changeable here ---- */
  const fixed = el('dl', 'aa-fixed');
  function paintFixed() {
    fixed.replaceChildren();
    const dash = t('add_agent.none', '—');
    const row = (key, value, from) => {
      fixed.append(el('dt', null, key));
      const dd = el('dd', null, value || dash);
      // The layer that answered, when the door says. Provenance is the server's; this
      // only renders it (CASCADE § 5.1).
      if (from) dd.append(el('span', 'aa-from', from));
      fixed.append(dd);
    };
    row(t('add_agent.team', 'team'), teamName());
    row(t('add_agent.place', 'place'), rootOf(), statedBy('project_root'));
    if (kindOf()) row(t('kind', 'Kind'), kindOf(), statedBy('kind'));
    // ROUTINES ARE A PREVIEW AND NEVER EDITABLE HERE (CASCADE § 5.1). They are the
    // Team's, resolved; this surface shows what was resolved and offers no switch.
    const on = (seed?.routines || []).filter((r) => r.on).map((r) => r.name);
    if (on.length) row(t('routines', 'Routines'), on.join(' · '));
    if (Array.isArray(seed?.still_asked) && seed.still_asked.length) {
      row(t('add_agent.still_asked', 'still asked'), seed.still_asked.join(' · '));
    }
  }

  const reset = () => {
    draft.name = '';
    draft.template = '';
    draft.teamLead = false;
    nameInput.value = '';
    leadInput.checked = false;
    resetTemplateAnswers();
    paintTemplates();
    paintMandate();
    paintDesk();
  };
  // createAction takes its handler at construction — there is no setAction — so the
  // actions are built after `reset` and `launch` exist.
  const launch = async () => {
    if (busy) return;
    busy = true;
    start.setDisabled(true);
    notice.set('info', t('add_agent.starting', 'Starting…'));
    // This Team shortcut births a Cowork Agent only. Terminal and bare-metal launches
    // belong on the full launch page; the Team supplies kind, routines and place here.
    const result = await request('/api/launch', {
      method: 'POST',
      json: {
        session_type: 'cowork_agent',
        behaviours: [...draft.behaviours],
        team: teamName(),
        instructions: draft.instruction.trim(),
        name: draft.name.trim(),
        project_root: rootOf(),
        provider: draft.provider,
        model: draft.model,
        kind: kindOf(),
        team_lead: draft.teamLead,
        mandate: { reach: draft.reach, recruit: draft.recruit, output: [...draft.output] },
        ...(draft.template ? { template: draft.template } : {}),
      },
    });
    if (!result.ok) {
      busy = false;
      start.setDisabled(false);
      notice.set('failed', result.message);
      return;
    }
    const born = result.data?.name || draft.name.trim();
    const handoff = draft.teamLead
      ? await swapTeamLead(request, teamName(), born, typeof members === 'function' ? members() : members || [])
      : { ok: true, failed: [] };
    busy = false;
    start.setDisabled(false);
    // WHY A DESK REQUEST PRODUCED NOTHING, in the receipt's own line — rendered so the
    // worktree control cannot quietly do nothing ("off by absence" is never silent,
    // owner 2026-08-29). Empty means a desk was opened, or none was asked for.
    const deskNote = result.data?.receipt?.desk_note || '';
    const leadNote = handoff.ok ? '' : t('add_agent.lead_swap_failed', 'Started {name} as Team Lead, but could not clear Team Lead from: {names}.', {
      name: born,
      names: handoff.failed.join(', '),
    });
    if (leadNote) notice.set('warning', leadNote);
    else if (deskNote) notice.set('warning', t('add_agent.started_note', 'Started {name} — {note}', { name: born, note: deskNote }));
    else notice.set('success', t('add_agent.started', 'Started {name}', { name: born }));
    reset();
    // THE LOOP: the Agent appears in the workspace that made it — EXCEPT when the
    // receipt carries a desk note. Connecting swaps this surface for the tile in the
    // same breath, which would take the one line explaining the missing desk with it;
    // so the note holds the surface, and the newborn is on the roster one click away.
    if (born && !deskNote && !leadNote) connect?.(born);
  };

  const start = createAction({ label: t('add_agent.start', 'Start'), kind: 'primary', action: () => void launch() });
  const cancel = createAction({ label: t('add_agent.cancel', 'Cancel'), action: () => { reset(); notice.set('', ''); } });
  const actions = createActionBar({ label: t('add_agent.actions', 'Launch actions'), actions: [cancel, start] });
  const alternative = el('p', 'aa-alternative');
  alternative.append(`${t('add_agent.full_alternative', 'Alternative: for full new Agent controls, use the')} `);
  const fullLink = el('a', '', t('add_agent.full_link', 'detailed launch page'));
  fullLink.href = '#/launch';
  fullLink.addEventListener('click', (event) => {
    if (!fullLaunch) return;
    event.preventDefault();
    fullLaunch();
  });
  alternative.append(fullLink, '.');

  // NAME LEFT, MODELS RIGHT; this Team shortcut is always a Cowork Agent.
  const top = el('div', 'aa-top');
  const left = el('div', 'aa-col');
  left.append(nameField.el, templateField.el, leadChoice);
  const right = el('div', 'aa-col');
  right.append(providerField.el, modelField.el);
  top.append(left, right);
  form.append(top, instructionField.el, mandateHead, mandateHost, deskLine);
  paintMandate();
  surface.content.append(form, alternative, actions.el, notice.el, fixed);

  return {
    el: surface.el,
    /** Called whenever the surface is shown: the catalogs and the roster may have moved. */
    enter: async () => {
      paintProviders();
      paintDesk();
      paintFixed();
      // A 404 is ordinary: the door is frozen, not built. Everything above already
      // painted from what exists, so a missing door costs the seeds and nothing else.
      const [answer, tray] = await Promise.all([
        request(`/api/launch-seed?team=${encodeURIComponent(teamName())}`),
        request('/api/templates/agents'),
      ]);
      templates = tray.ok && Array.isArray(tray.data) ? tray.data : [];
      if (!answer.ok) return;
      seed = answer.data || null;
      if (!draft.provider) draft.provider = seeded('provider');
      if (!draft.model) draft.model = seeded('model');
      if (!draft.template) resetTemplateAnswers();
      paintProviders();
      paintTemplates();
      paintMandate();
      paintDesk();
      paintFixed();
    },
  };
}
