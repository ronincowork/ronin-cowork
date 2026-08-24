/* part of the ronin-cowork client — see js/README.md */

/**
 * NEW TEAM — one Surface, two stages, and a transaction region beneath them.
 *
 * It hosts NO Tile: a proposed seat has no session, so there is nothing rendering session
 * output and nothing to attach to. Seats become Tiles only after birth, and only in other
 * Surfaces (the Team workbench, Sessions). It hosts no Channel services of its own.
 *
 * THIS SLICE IS STAGE 1 AND THE TRANSACTION STATE. Multi-seat launch is deliberately NOT
 * here (owner, 2026-08-23): not until the draft and preflight contracts and the receipts
 * are verified. The roster stage draws what the draft holds and says plainly that raising
 * sessions comes later — a surface that pretended to launch would be the more dishonest
 * of the two options.
 *
 * NOTHING IS REQUIRED EXCEPT A NAME, AND ONLY AT THE MOMENT OF CREATION. A blank
 * `team_role` is an unclassified Team; an empty objective, no root, no repos, no branch,
 * NO SEATS and no lead are all valid, and a Team defined with a name and nothing else is a
 * complete outcome of this Surface. No control here gates anything the server does not.
 */
import { request } from './request.js';
import {
  canCreateTeam,
  createSeat,
  createDraft,
  finalizeTeamName,
  isValidTeamName,
  sanitizeTeamName,
} from './new-team-draft.js';
import { capacityNote, preflight, teamNotes } from './new-team-preflight.js';
import { registerTeamDraft, selectDraftSeat, subscribeTeamDraft } from './team-draft-controller.js';
import { ensureRoster, launchDraft } from './new-team-launch.js';

const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

/** Debounced, because every keystroke in the name field changes the adoption answer and
 *  the answer costs a resolver run per seat. */
const debounce = (fn, ms) => {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export function createNewTeamView(kit) {
  const { createSurface, createCard, createAction, createActionBar, createMetadata, createForm, createField, createNotice } = kit.primitives;
  const { navigateWorkspace, workspaceTarget } = kit.contract;
  let draft = registerTeamDraft(createDraft());
  let lastPreflight = null;
  let context = null;
  let busy = false;
  const saveDraft = () => context?.patchViewState('new-team', { draft });
  subscribeTeamDraft(() => saveDraft());

  /* ---------------- stage 1 — define the Team ---------------- */

  const definition = createSurface({ className: 'nt-definition', label: 'Define the Team' });
  const eyebrow = node('span', 'nt-eyebrow', '1 · Define the Team');
  const heading = node('h2', null, 'Team definition');
  const form = createForm({ onSubmit: (e) => e.preventDefault() });

  const nameInput = node('input');
  nameInput.type = 'text';
  nameInput.autocapitalize = 'off';
  nameInput.spellcheck = false;
  nameInput.placeholder = 'product-launch';
  const nameField = createField({
    label: 'Team name',
    control: nameInput,
    description: 'Lowercase letters, digits, _ and - . This is also the tag its sessions carry.',
  });

  // A combobox, not a select: `GET /api/team-roles` legitimately answers EMPTY — the house
  // ships no team_role definitions, by design, because a team_role is the owner's own
  // vocabulary and a stock guess would be furniture. So the control must be complete and
  // useful with zero options, and must accept a label that will never have a file.
  const roleInput = node('input');
  roleInput.type = 'text';
  roleInput.setAttribute('list', 'nt-team-roles');
  roleInput.placeholder = 'development — or leave blank';
  const roleList = node('datalist');
  roleList.id = 'nt-team-roles';
  const roleField = createField({
    label: 'Team role',
    control: roleInput,
    description: 'Optional. Blank is an unclassified Team, which is a valid state.',
  });
  roleField.el.append(roleList);

  const objectiveInput = node('textarea');
  objectiveInput.rows = 3;
  const objectiveField = createField({
    label: 'Objective',
    control: objectiveInput,
    description: 'Optional. Rides the brief of every session born onto this Team.',
  });

  const rootSelect = node('select');
  const rootField = createField({
    label: 'Default project root',
    control: rootSelect,
    description: 'Optional. Seeds where sessions are born; a launch may override it.',
  });

  const reposInput = node('input');
  reposInput.type = 'text';
  reposInput.placeholder = 'ronin-cowork, ronin-services';
  const reposField = createField({
    label: 'Repositories',
    control: reposInput,
    description: 'Optional, comma-separated.',
  });

  const branchInput = node('input');
  branchInput.type = 'text';
  branchInput.placeholder = 'dev';
  const branchField = createField({ label: 'Branch', control: branchInput, description: 'Optional.' });

  const boardInput = node('input');
  boardInput.type = 'text';
  const boardField = createField({
    label: 'Wipeboard',
    control: boardInput,
    description: 'Optional. Blank uses the Team’s own name.',
  });

  form.fields.append(
    nameField.el, roleField.el, objectiveField.el, rootField.el,
    reposField.el, branchField.el, boardField.el,
  );

  const adoption = node('div', 'nt-notes');
  const createBtn = createAction({ className: 'nt-create', label: 'Create Team', kind: 'primary', disabled: true }).el;
  form.actions.append(createBtn);
  definition.content.append(eyebrow, heading, form.el, adoption);

  /* ---------------- stage 2 — the roster ---------------- */

  const roster = createSurface({ className: 'nt-roster', label: 'Build the roster' });
  const rosterEyebrow = node('span', 'nt-eyebrow', '2 · Build the roster');
  const rosterHeading = node('h2', null, 'Sessions · one or many');
  const rosterBody_ = node('div', 'nt-roster-body');
  const rosterNotice = createNotice({
    kind: 'info',
    message:
      'A Team with no sessions is complete and valid. Add one or more proposed sessions, check them against the real launch resolver, then raise them in order.',
  });
  roster.content.append(rosterEyebrow, rosterHeading, rosterNotice.el, rosterBody_);
  const addSeat = createAction({ label: 'Add proposed session' });
  const checkSeats = createAction({ label: 'Check seats' });
  const launchSeats = createAction({ label: 'Create Team and raise sessions', kind: 'primary' });
  const rosterActions = createActionBar({ label: 'Roster actions', actions: [addSeat, checkSeats, launchSeats] });
  roster.content.append(rosterActions.el);

  /* ---------------- the transaction region ---------------- */

  const transaction = createSurface({ className: 'nt-transaction', label: 'Team transaction' });
  const txNotice = createNotice();
  const receipt = node('div', 'nt-receipt');
  const openTeam = createAction({ label: 'Open Team' });
  openTeam.el.hidden = true;
  transaction.content.append(txNotice.el, receipt, openTeam.el);
  transaction.el.hidden = true;

  const el = kit.layouts.createNewTeamLayout(definition.el, roster.el, transaction.el);

  /* ---------------- behaviour ---------------- */

  const readTeam = () => {
    draft.team.name = finalizeTeamName(nameInput.value);
    draft.team.team_role = roleInput.value.trim();
    draft.team.objective = objectiveInput.value.trim();
    draft.team.project_root = rootSelect.value;
    draft.team.repos = reposInput.value.split(',').map((s) => s.trim()).filter(Boolean);
    draft.team.branch = branchInput.value.trim();
    draft.team.wipeboard = boardInput.value.trim();
    saveDraft();
  };

  const paintNotes = () => {
    adoption.replaceChildren();
    const teamReading = draft.roster_created && lastPreflight?.team
      ? { ...lastPreflight.team, name_available: true }
      : lastPreflight?.team;
    const notes = [...teamNotes(teamReading), capacityNote(lastPreflight?.capacity)].filter(Boolean);
    for (const n of notes) {
      const p = node('p', 'wk-notice', n.text);
      p.dataset.kind = n.kind;
      adoption.append(p);
    }
  };

  const paintRoster = () => {
    rosterBody_.replaceChildren();
    for (const seat of draft.seats) {
      const outcome = seat.outcome;
      const verdict = lastPreflight?.seats?.find((candidate) => candidate.seat_id === seat.seat_id);
      const card = createCard({
        heading: seat.name || seat.session_role || 'Proposed session',
        summary: seat.prompt || 'No brief yet.',
        metadata: [seat.mode, verdict ? `preflight ${verdict.verdict}` : null, outcome?.status].filter(Boolean),
        warning: verdict?.verdict === 'refuse' || outcome?.status === 'refused' || outcome?.status === 'skipped',
      });
      if (verdict?.reasons?.length) {
        card.el.append(node('p', 'nt-seat-reasons', verdict.reasons.map((reason) => reason.message).join(' ')));
      } else if (verdict?.resolved) {
        const reading = createMetadata({ rows: [
          ['Resolved name', verdict.resolved.name], ['Project root', verdict.resolved.project_root],
          ['Command', verdict.resolved.cmd], ['Control', verdict.resolved.dial],
          ['MCP', String(verdict.resolved.mcp)],
        ] });
        card.el.append(reading.el);
      }
      const edit = createAction({ label: 'Edit session' });
      edit.el.addEventListener('click', () => {
          selectDraftSeat(draft, seat.seat_id);
          navigateWorkspace(context, workspaceTarget('agent-config', seat.seat_id));
      });
      const lead = node('label', 'nt-lead-choice');
      const radio = node('input');
      radio.type = 'radio';
      radio.name = 'nt-lead';
      radio.checked = draft.lead_seat_id === seat.seat_id;
      radio.addEventListener('click', (event) => event.stopPropagation());
      radio.addEventListener('change', () => { draft.lead_seat_id = seat.seat_id; saveDraft(); paintRoster(); });
      lead.append(radio, document.createTextNode(' Designate as lead'));
      const clearLead = createAction({ label: 'No lead' });
      clearLead.el.addEventListener('click', (event) => {
        event.stopPropagation();
        draft.lead_seat_id = null;
        saveDraft();
        paintRoster();
      });
      const remove = createAction({ label: 'Remove proposal', kind: 'danger' });
      remove.el.disabled = outcome?.status === 'born';
      remove.el.addEventListener('click', () => {
        draft.seats = draft.seats.filter((candidate) => candidate.seat_id !== seat.seat_id);
        if (draft.lead_seat_id === seat.seat_id) draft.lead_seat_id = null;
        saveDraft();
        paintRoster();
        paintReceipt();
      });
      const actions = createActionBar({ label: 'Proposed session actions', actions: [edit, remove] });
      card.el.append(lead);
      if (draft.lead_seat_id === seat.seat_id) card.el.append(clearLead.el);
      card.el.append(actions.el);
      rosterBody_.append(card.el);
    }
    launchSeats.setDisabled(busy || !draft.seats.length || !canCreateTeam(draft));
    checkSeats.setDisabled(busy || !draft.seats.length);
  };

  const paintReceipt = () => {
    receipt.replaceChildren();
    const tx = draft.transaction;
    if (!tx && !draft.seats.some((seat) => seat.outcome)) {
      transaction.el.hidden = true;
      return;
    }
    transaction.el.hidden = false;
    const summary = createMetadata({ rows: [
      ['Team', draft.team.name],
      ['Roster', tx?.roster?.status],
      ['Completed', tx?.completed_at],
    ] });
    receipt.append(summary.el);
    for (const seat of draft.seats) {
      const outcome = seat.outcome;
      if (!outcome) continue;
      const row = node('article', 'nt-receipt-seat');
      row.dataset.status = outcome.status;
      row.append(node('h3', null, outcome.session_name || seat.name || seat.session_role || 'Proposed session'));
      const meta = createMetadata({ rows: [
        ['Status', outcome.status], ['Mode', outcome.receipt?.mode],
        ['Role', outcome.receipt?.session_role], ['Project root', outcome.receipt?.project_root],
        ['Command', outcome.receipt?.cmd], ['Control', outcome.receipt?.dial],
        ['MCP', outcome.receipt ? String(outcome.receipt.mcp) : null], ['Reason', outcome.error],
      ] });
      row.append(meta.el);
      if (outcome.status !== 'born') {
        const retry = createAction({ label: 'Retry this seat' });
        retry.el.addEventListener('click', () => void runLaunch([seat.seat_id]));
        row.append(retry.el);
      }
      receipt.append(row);
    }
    const lead = tx?.lead;
    if (lead) receipt.append(node('p', 'nt-lead-receipt',
      `Lead: ${lead.status}${lead.session_name ? ` · ${lead.session_name}` : ''}${lead.delivery ? ` · ${lead.delivery}` : ''}${lead.error ? ` · ${lead.error}` : ''}`));
    openTeam.el.hidden = !draft.roster_created;
  };

  const paintName = () => {
    const name = draft.team.name;
    if (!name) return nameField.setValidation('', '');
    if (!isValidTeamName(name)) return nameField.setValidation('invalid', 'Lowercase letters, digits, _ and - only.');
    if (!draft.roster_created && lastPreflight?.team && !lastPreflight.team.name_available) {
      return nameField.setValidation('invalid', `"${name}" already has a roster.`);
    }
    nameField.setValidation('valid', '');
  };

  const refresh = async () => {
    readTeam();
    // The button follows exactly ONE condition, because exactly one thing is enforced at
    // creation. Everything else on this form is advisory, and a disabled button is a gate.
    createBtn.disabled = !canCreateTeam(draft) || draft.roster_created;
    if (!draft.team.name) {
      lastPreflight = null;
      paintName();
      paintNotes();
      return;
    }
    const result = await preflight(draft);
    if (result.broken) {
      // The tool failed, not the draft. Say which — and do not disable anything over it.
      txNotice.set('failed', `The dry run could not be reached — ${result.message}`);
      transaction.el.hidden = false;
      return;
    }
    lastPreflight = result;
    for (const verdict of result.seats ?? []) {
      draft.seats = draft.seats.map((seat) => seat.seat_id === verdict.seat_id ? { ...seat, resolved: verdict.resolved } : seat);
    }
    saveDraft();
    if (!draft.roster_created && !lastPreflight.team.name_available) createBtn.disabled = true;
    createBtn.textContent = lastPreflight.team.adopts_sessions?.length ? 'Adopt Team roster' : 'Create Team';
    createBtn.hidden = draft.roster_created;
    paintName();
    paintNotes();
    paintRoster();
  };

  const refreshSoon = debounce(refresh, 250);

  nameInput.addEventListener('input', () => {
    const caret = nameInput.selectionStart;
    const clean = sanitizeTeamName(nameInput.value);
    if (clean !== nameInput.value) {
      nameInput.value = clean;
      // Character-for-character, so the caret does not jump while the owner types.
      nameInput.setSelectionRange(caret, caret);
    }
    refreshSoon();
  });
  // Settle the name when the owner leaves the field: a trailing separator is legal to
  // TYPE (you are on your way to the next word) and wrong to CREATE.
  nameInput.addEventListener('blur', () => {
    const settled = finalizeTeamName(nameInput.value);
    if (settled !== nameInput.value) { nameInput.value = settled; refreshSoon(); }
  });
  for (const control of [roleInput, objectiveInput, reposInput, branchInput, boardInput]) {
    control.addEventListener('input', () => { readTeam(); });
  }
  rootSelect.addEventListener('change', () => { readTeam(); refreshSoon(); });
  addSeat.el.addEventListener('click', () => { draft.seats.push(createSeat()); saveDraft(); paintRoster(); });
  checkSeats.el.addEventListener('click', () => void refresh());

  const runLaunch = async (seatIds = null) => {
    if (busy || !canCreateTeam(draft)) return;
    busy = true;
    paintRoster();
    transaction.el.hidden = false;
    txNotice.set('info', 'Checking the roster, then raising sessions in order…');
    await launchDraft(draft, { seatIds, persist: () => { saveDraft(); paintRoster(); paintReceipt(); } });
    busy = false;
    txNotice.set('', '');
    paintRoster();
    paintReceipt();
  };
  launchSeats.el.addEventListener('click', () => void runLaunch());
  openTeam.el.addEventListener('click', () => navigateWorkspace(context, workspaceTarget('team', draft.team.name)));

  createBtn.addEventListener('click', async () => {
    readTeam();
    if (!canCreateTeam(draft)) return;
    createBtn.disabled = true;
    transaction.el.hidden = false;
    txNotice.set('info', `Creating "${draft.team.name}"…`);
    const r = await ensureRoster(draft);
    if (!r.ok) {
      txNotice.set('failed', `Could not create the Team — ${r.message}`);
      createBtn.disabled = false;
      return;
    }
    // THE TEAM IS REAL FROM HERE, with zero seats and no lead, and it is visible in League
    // from this moment (owner, 2026-08-23). The draft records that so the transaction
    // survives a re-render and the create cannot be pressed twice.
    draft.transaction = { team: draft.team.name, created_at: new Date().toISOString(), seats: [] };
    saveDraft();
    const adopted = lastPreflight?.team?.adopts_sessions?.length ?? 0;
    txNotice.set(
      'success',
      `Team "${draft.team.name}" exists${adopted ? ` and arrived with ${adopted} member${adopted === 1 ? '' : 's'} already tagged into it` : ' with no members yet, which is a normal state'}. It is in League now.`,
    );
    rosterNotice.set('success', 'The durable Team roster exists. You can raise the proposed sessions now or return later.');
    paintReceipt();
  });

  const loadOptions = async () => {
    const [roots, roles] = await Promise.all([
      request('/api/project-roots'),
      request('/api/team-roles'),
    ]);
    rootSelect.replaceChildren();
    rootSelect.append(new Option('— the box’s default —', ''));
    if (roots.ok) for (const r of roots.data) rootSelect.append(new Option(r.name, r.name));
    roleList.replaceChildren();
    // Zero options is the ordinary answer here and the field still works: free text is
    // accepted, and a roster may name a team_role that has no definition at all.
    if (roles.ok) for (const r of roles.data) roleList.append(new Option(r.label || r.name, r.name));
  };

  return {
    el,
    title: () => 'New Team',
    enter: (nextContext) => {
      context = nextContext;
      const stored = nextContext.viewState('new-team')?.draft;
      if (stored && typeof stored === 'object') draft = registerTeamDraft(stored);
      else registerTeamDraft(draft);
      nameInput.value = draft.team.name ?? '';
      roleInput.value = draft.team.team_role ?? '';
      objectiveInput.value = draft.team.objective ?? '';
      reposInput.value = (draft.team.repos ?? []).join(', ');
      branchInput.value = draft.team.branch ?? '';
      boardInput.value = draft.team.wipeboard ?? '';
      paintRoster();
      paintReceipt();
      void loadOptions().then(() => { rootSelect.value = draft.team.project_root ?? ''; return refresh(); });
    },
    /** The draft is the view's, and it survives leaving and coming back within this tab.
     *  It is NOT shared across browser tabs — the workspace record is per-browser-tab, so
     *  two tabs hold two independent drafts. */
    draft: () => draft,
  };
}
