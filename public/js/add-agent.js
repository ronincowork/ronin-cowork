/* part of the ronin-cowork client — see js/README.md */
/**
 * ADD AGENT TO TEAM — the in-Team quick launch, on the Workspace Kit.
 *
 * STAGED, NOT LIVE (owner, 2026-08-31). This is registered as its own Workbench surface
 * beside the existing New Agent card. `js/launcher.js` has since been retired; it mounted
 * the `.ks-*` board on the same page, and the owner decides when one replaces the other.
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

/** The tasks a Team of each kind is offered. Hardcoded HERE and nowhere else, because
 *  `session_role` is on its way to becoming a behaviour and this list is what the ways
 *  shelf will answer once it carries a `kinds:` field (NEW_AGENT.md § 4.5). */
const TASKS_BY_KIND = Object.freeze({
  coding: ['QuarterBack', 'RiffOnIt', 'DraftPlan', 'CutCode', 'ChaseBug', 'CheckWork'],
  work: ['RiffOnIt', 'DraftPlan', 'CheckWork', 'PersonalAssistant', 'OddJob'],
  personal: ['PersonalAssistant', 'RiffOnIt', 'OddJob'],
  household: ['PersonalAssistant', 'RiffOnIt', 'OddJob'],
});
const DEFAULT_TASKS = TASKS_BY_KIND.coding;

const readable = (role) => role.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/**
 * @param {object} kit  the Workspace Kit
 * @param {object} options
 *   `team()` the Team this page shows · `roster()` its durable record or null ·
 *   `connect(name)` seats the born Agent in the workspace that made it.
 */
export function createAddAgentView(kit, { team, roster, connect } = {}) {
  const { createSurface, createAction, createActionBar, createField, createNotice } = kit.primitives;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  const draft = { name: '', instruction: '', provider: '', model: '', task: '', shell: false };
  let busy = false;
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
  const tasks = () => TASKS_BY_KIND[kindOf()] || DEFAULT_TASKS;

  /* ---- the four fields ---- */
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

  /* ---- shell or Agent (owner, 2026-08-31): the one thing the retired New Agent card
     offered here that this surface did not. Ticked, the form drops to the name and the
     place — a raw pane, nothing is sent to it — and Start opens the terminal. ---- */
  const shellRow = el('button', 'aa-desk aa-shell');
  shellRow.type = 'button';
  const shellBox = el('span', 'aa-box');
  const shellText = el('span', 'aa-desk-text');
  const shellTitle = el('b', null, t('add_agent.shell', 'Open a shell, not an Agent'));
  const shellWhy = el('small', null, t('add_agent.shell_why', 'A raw terminal in this Team — no Agent is launched and nothing is sent to it.'));
  shellText.append(shellTitle, shellWhy);
  shellRow.append(shellBox, shellText);
  shellRow.addEventListener('click', () => { draft.shell = !draft.shell; paintShape(); });
  function paintShape() {
    shellRow.setAttribute('aria-pressed', String(draft.shell));
    form.dataset.shell = String(draft.shell);
  }

  const instruction = el('textarea');
  instruction.rows = 3;
  instruction.autocapitalize = 'off';
  instruction.spellcheck = false;
  instruction.placeholder = t('add_agent.instruction_placeholder', 'what this Agent should do');
  instruction.addEventListener('input', () => { draft.instruction = instruction.value; });
  const instructionField = createField({ label: t('add_agent.instruction', 'instruction'), control: instruction });

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

  /* ---- the task row: optional, and open by default ---- */
  const taskHead = el('p', 'aa-head', t('add_agent.task', 'task  (optional)'));
  const taskRow = el('div', 'aa-tasks');
  function paintTasks() {
    taskRow.replaceChildren();
    const offer = [{ name: '', label: t('add_agent.task_open', 'open'), open: true }, ...tasks().map((name) => ({ name, label: readable(name) }))];
    for (const item of offer) {
      const chip = el('button', 'aa-chip');
      chip.type = 'button';
      chip.textContent = item.label;
      if (item.open) chip.dataset.open = 'true';
      chip.setAttribute('aria-pressed', String(draft.task === item.name));
      chip.addEventListener('click', () => {
        draft.task = item.name;
        paintTasks();
      });
      taskRow.append(chip);
    }
  }

  /* ---- THE DESK IS NOT AN ASKED QUESTION (owner, 2026-08-31, folding the earlier
     control): the routine selection IS the decision, so this row is a CONSEQUENCE LINE —
     it says which of the two states the resolved routines give, and offers no switch.
     Allocation stays lazy either way: managed file coordination is the contract, and a
     worktree is cut when the work needs it (`docs/routines.md` § Four different facts).
     `desk: own | none` survives on the launch body as an unadvertised escape hatch; no
     form surfaces it, and this one no longer sends it. ---- */
  const deskLine = el('div', 'aa-deskline');
  const deskWhy = el('small');
  deskLine.append(deskWhy);
  /** Is `ronin_control` on for this birth? The resolved map's answer, never this
   *  form's — and null while the seed door is not there to ask. */
  const controlled = () => {
    const rows = seed?.routines;
    if (!Array.isArray(rows)) return null;
    return rows.some((r) => r.on && /control/i.test(r.name || ''));
  };
  function paintDesk() {
    const control = controlled();
    // Nothing is claimed before the resolved map has answered.
    deskLine.hidden = control === null;
    if (control === null) return;
    deskWhy.textContent = control
      ? t('add_agent.desk_line_control', 'Managed file coordination is on for this Team: the desk contract applies, and a worktree is cut when the work needs it.')
      : t('add_agent.desk_line_plain', 'Managed file coordination is off for this Team: this Agent works in the shared checkout and reports to you.');
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
    draft.instruction = '';
    draft.task = '';
    draft.shell = false;
    nameInput.value = '';
    instruction.value = '';
    paintTasks();
    paintDesk();
    paintShape();
  };
  // createAction takes its handler at construction — there is no setAction — so the
  // actions are built after `reset` and `launch` exist.
  const launch = async () => {
    if (busy) return;
    busy = true;
    start.setDisabled(true);
    notice.set('info', t('add_agent.starting', 'Starting…'));
    // ONLY WHAT THE ROUTE ACCEPTS TODAY. `session_type` is stated explicitly — the birth
    // type is never inferred from session_role, team, or agent-shaped fields. A shell is
    // a `terminal`: a pane, its name, its team and its place, and nothing an Agent would
    // take (the route refuses the rest by name). Nothing about routines is sent either
    // way: they are resolved server-side, and a caller that states one is guessing at
    // the server's job (NEW_AGENT.md § 7.4).
    const result = await request('/api/launch', {
      method: 'POST',
      json: draft.shell
        ? {
          session_type: 'terminal',
          team: teamName(),
          name: draft.name.trim(),
          project_root: rootOf(),
        }
        : {
          session_type: 'cowork_agent',
          session_role: draft.task,
          team: teamName(),
          instructions: draft.instruction.trim(),
          name: draft.name.trim(),
          project_root: rootOf(),
          provider: draft.provider,
          model: draft.model,
        },
    });
    busy = false;
    start.setDisabled(false);
    if (!result.ok) {
      notice.set('failed', result.message);
      return;
    }
    const born = result.data?.name || draft.name.trim();
    // WHY A DESK REQUEST PRODUCED NOTHING, in the receipt's own line — rendered so the
    // worktree control cannot quietly do nothing ("off by absence" is never silent,
    // owner 2026-08-29). Empty means a desk was opened, or none was asked for.
    const deskNote = result.data?.receipt?.desk_note || '';
    if (deskNote) notice.set('warning', t('add_agent.started_note', 'Started {name} — {note}', { name: born, note: deskNote }));
    else notice.set('success', t('add_agent.started', 'Started {name}', { name: born }));
    reset();
    // THE LOOP: the Agent appears in the workspace that made it — EXCEPT when the
    // receipt carries a desk note. Connecting swaps this surface for the tile in the
    // same breath, which would take the one line explaining the missing desk with it;
    // so the note holds the surface, and the newborn is on the roster one click away.
    if (born && !deskNote) connect?.(born);
  };

  const start = createAction({ label: t('add_agent.start', 'Start'), kind: 'primary', action: () => void launch() });
  const cancel = createAction({ label: t('add_agent.cancel', 'Cancel'), action: () => { reset(); notice.set('', ''); } });
  const actions = createActionBar({ label: t('add_agent.actions', 'Launch actions'), actions: [cancel, start] });

  // NAME LEFT, MODELS RIGHT (owner, 2026-08-31: full-width rows "looked pretty
  // horrible"). The shell tick sits under the name; everything only an Agent takes is
  // marked `aa-agent-only` and folds away when the tick is on.
  const top = el('div', 'aa-top');
  const left = el('div', 'aa-col');
  left.append(nameField.el, shellRow);
  const right = el('div', 'aa-col aa-agent-only');
  right.append(providerField.el, modelField.el);
  top.append(left, right);
  instructionField.el.classList.add('aa-agent-only');
  taskHead.classList.add('aa-agent-only');
  taskRow.classList.add('aa-agent-only');
  deskLine.classList.add('aa-agent-only');
  form.append(top, instructionField.el, taskHead, taskRow, deskLine);
  paintShape();
  surface.content.append(form, actions.el, notice.el, fixed);

  return {
    el: surface.el,
    /** Called whenever the surface is shown: the catalogs and the roster may have moved. */
    enter: async () => {
      paintProviders();
      paintTasks();
      paintDesk();
      paintFixed();
      // A 404 is ordinary: the door is frozen, not built. Everything above already
      // painted from what exists, so a missing door costs the seeds and nothing else.
      const answer = await request(`/api/launch-seed?team=${encodeURIComponent(teamName())}`);
      if (!answer.ok) return;
      seed = answer.data || null;
      if (!draft.provider) draft.provider = seeded('provider');
      if (!draft.model) draft.model = seeded('model');
      paintProviders();
      paintDesk();
      paintFixed();
    },
  };
}
