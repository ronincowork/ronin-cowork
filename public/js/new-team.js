/* part of the ronin-cowork client — see js/README.md */

/**
 * NEW TEAM — one Surface, two stages, and a transaction region beneath them.
 *
 * It hosts NO Tile: a proposed seat has no session, so there is nothing rendering session
 * output and nothing to attach to. Seats become Tiles only after birth, and only in other
 * Surfaces (the Team workbench, Sessions). It hosts no Channel services of its own.
 *
 * ONE TRANSACTION handles both valid shapes: zero seats commits the durable Team; one or
 * many seats commits it and then launches them in order. Membership itself is never copied
 * into the roster — the born session carries its Team tags and remains the live record.
 *
 * NOTHING IS REQUIRED EXCEPT A NAME, AND ONLY AT THE MOMENT OF CREATION. A blank
 * `team_role` is an unclassified Team; an empty objective, no root, no repos, no branch,
 * NO SEATS and no lead are all valid, and a Team defined with a name and nothing else is a
 * complete outcome of this Surface. No control here gates anything the server does not.
 */
import { request } from './request.js';
import {
  canCreateTeam,
  committedTeam,
  createSeat,
  createDraft,
  finalizeTeamName,
  isValidTeamName,
  sanitizeTeamName,
} from './new-team-draft.js';
import { capacityNote, preflight, teamNotes } from './new-team-preflight.js';
import { registerTeamDraft, selectDraftSeat, subscribeTeamDraft } from './team-draft-controller.js';
import { launchDraft } from './new-team-launch.js';
import { t } from './lexicon.js';

const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

/** Debounced, because every keystroke in the name field changes the adoption answer and
 *  the answer costs a resolver run per seat. */
const debounce = (fn, ms) => {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
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

  const definition = createSurface({ className: 'nt-definition', label: t('new_team.define', 'Define the Team') });
  const eyebrow = node('span', 'nt-eyebrow', t('new_team.define_eyebrow', '1 · Define the Team'));
  const heading = node('h2', null, t('new_team.definition', 'Team definition'));
  const form = createForm({ onSubmit: (e) => e.preventDefault() });

  const nameInput = node('input');
  nameInput.type = 'text';
  nameInput.autocapitalize = 'off';
  nameInput.spellcheck = false;
  nameInput.placeholder = 'product-launch';
  const nameField = createField({
    label: t('new_team.name', 'Team name'),
    control: nameInput,
    description: t('new_team.name_desc', 'Lowercase letters, digits, _ and - . This is also the tag its sessions carry.'),
  });

  // A combobox, not a select: `GET /api/team-roles` legitimately answers EMPTY — the house
  // ships no team_role definitions, by design, because a team_role is the owner's own
  // vocabulary and a stock guess would be furniture. So the control must be complete and
  // useful with zero options, and must accept a label that will never have a file.
  const roleInput = node('input');
  roleInput.type = 'text';
  roleInput.setAttribute('list', 'nt-team-roles');
  roleInput.placeholder = t('new_team.role_placeholder', 'development — or leave blank');
  const roleList = node('datalist');
  roleList.id = 'nt-team-roles';
  const roleField = createField({
    label: t('team.team_role', 'Team role'),
    control: roleInput,
    description: t('new_team.role_desc', 'Optional. Blank is an unclassified Team, which is a valid state.'),
  });
  roleField.el.append(roleList);

  const objectiveInput = node('textarea');
  objectiveInput.rows = 3;
  const objectiveField = createField({
    label: t('team.objective', 'Objective'),
    control: objectiveInput,
    description: t('new_team.objective_desc', 'Optional. Rides the brief of every session born onto this Team.'),
  });

  const rootSelect = node('select');
  const rootField = createField({
    label: t('new_team.root', 'Default project root'),
    control: rootSelect,
    description: t('new_team.root_desc', 'Optional. Seeds where sessions are born; a launch may override it.'),
  });

  const reposInput = node('input');
  reposInput.type = 'text';
  reposInput.placeholder = 'ronin-cowork, ronin-services';
  const reposField = createField({
    label: t('team.repos', 'Repositories'),
    control: reposInput,
    description: t('new_team.repos_desc', 'Optional, comma-separated.'),
  });

  const branchInput = node('input');
  branchInput.type = 'text';
  branchInput.placeholder = 'dev';
  const branchField = createField({ label: t('team.branch', 'Branch'), control: branchInput, description: t('new_team.optional', 'Optional.') });

  const boardInput = node('input');
  boardInput.type = 'text';
  const boardField = createField({
    label: t('team.wipeboard', 'Wipeboard'),
    control: boardInput,
    description: t('new_team.wipeboard_desc', 'Optional. Blank uses the Team’s own name.'),
  });

  form.fields.append(
    nameField.el, roleField.el, objectiveField.el, rootField.el,
    reposField.el, branchField.el, boardField.el,
  );
  const adoption = node('div', 'nt-notes');
  definition.content.append(eyebrow, heading, form.el, adoption);

  /* ---------------- stage 2 — the roster ---------------- */

  const roster = createSurface({ className: 'nt-roster', label: t('new_team.build_roster', 'Build the roster') });
  const rosterEyebrow = node('span', 'nt-eyebrow', t('new_team.build_roster_eyebrow', '2 · Build the roster'));
  const rosterHeading = node('h2', null, t('new_team.sessions_heading', 'Sessions · one or many'));
  const rosterBody_ = node('div', 'nt-roster-body');
  const rosterNotice = createNotice({
    kind: 'info',
    message:
      t('new_team.roster_notice', 'A Team with no sessions is complete and valid. Add one or more proposed sessions, check them against the real launch resolver, then raise them in order.'),
  });
  roster.content.append(rosterEyebrow, rosterHeading, rosterNotice.el, rosterBody_);
  const addSeat = createAction({ label: t('new_team.add_seat', 'Add proposed session') });
  const checkSeats = createAction({ label: t('new_team.check_seats', 'Check seats') });
  const launchSeats = createAction({ label: t('new_team.create_and_raise', 'Create Team and raise sessions'), kind: 'primary' });
  const rosterActions = createActionBar({ label: t('new_team.roster_actions', 'Roster actions'), actions: [addSeat, checkSeats, launchSeats] });
  roster.content.append(rosterActions.el);

  /* ---------------- the transaction region ---------------- */

  const transaction = createSurface({ className: 'nt-transaction', label: t('new_team.transaction', 'Team transaction') });
  const txNotice = createNotice();
  const receipt = node('div', 'nt-receipt');
  const openTeam = createAction({ label: t('new_team.open_team', 'Open Team') });
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
    const teamReading = committedTeam(draft) && lastPreflight?.team
      ? { ...lastPreflight.team, name_available: true }
      : lastPreflight?.team;
    const notes = [...teamNotes(teamReading), capacityNote(lastPreflight?.capacity)].filter(Boolean);
    for (const n of notes) {
      adoption.append(createNotice({ kind: n.kind, message: n.text }).el);
    }
  };

  const paintRoster = () => {
    rosterBody_.replaceChildren();
    for (const seat of draft.seats) {
      const outcome = seat.outcome;
      const verdict = lastPreflight?.seats?.find((candidate) => candidate.seat_id === seat.seat_id);
      const card = createCard({
        heading: seat.name || seat.session_role || t('new_team.proposed_session', 'Proposed session'),
        summary: seat.prompt || t('new_team.no_brief', 'No brief yet.'),
        metadata: [seat.mode, verdict ? t('new_team.preflight', 'preflight {verdict}', { verdict: verdict.verdict }) : null, outcome?.status].filter(Boolean),
        warning: verdict?.verdict === 'refuse' || outcome?.status === 'refused' || outcome?.status === 'skipped',
      });
      if (verdict?.reasons?.length) {
        card.el.append(node('p', 'nt-seat-reasons', verdict.reasons.map((reason) => reason.message).join(' ')));
      } else if (verdict?.resolved) {
        const reading = createMetadata({ rows: [
          [t('new_team.resolved_name', 'Resolved name'), verdict.resolved.name], [t('team.project_root', 'Project root'), verdict.resolved.project_root],
          [t('team.command', 'Command'), verdict.resolved.cmd], [t('team.control', 'Control'), verdict.resolved.dial],
          [t('team.mcp', 'MCP'), String(verdict.resolved.mcp)],
        ] });
        card.el.append(reading.el);
      }
      const edit = createAction({ label: t('new_team.edit_session', 'Edit session') });
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
      lead.append(radio, document.createTextNode(' ' + t('new_team.designate_lead', 'Designate as lead')));
      const clearLead = createAction({ label: t('new_team.no_lead', 'No lead') });
      clearLead.el.addEventListener('click', (event) => {
        event.stopPropagation();
        draft.lead_seat_id = null;
        saveDraft();
        paintRoster();
      });
      const remove = createAction({ label: t('new_team.remove_proposal', 'Remove proposal'), kind: 'danger' });
      remove.el.disabled = outcome?.status === 'born';
      remove.el.addEventListener('click', () => {
        draft.seats = draft.seats.filter((candidate) => candidate.seat_id !== seat.seat_id);
        if (draft.lead_seat_id === seat.seat_id) draft.lead_seat_id = null;
        saveDraft();
        paintRoster();
        paintReceipt();
      });
      const actions = createActionBar({ label: t('new_team.seat_actions', 'Proposed session actions'), actions: [edit, remove] });
      card.el.append(lead);
      if (draft.lead_seat_id === seat.seat_id) card.el.append(clearLead.el);
      card.el.append(actions.el);
      rosterBody_.append(card.el);
    }
    const committed = committedTeam(draft);
    launchSeats.el.textContent = committed
      ? t('new_team.retry_unresolved', 'Retry unresolved sessions')
      : draft.seats.length ? t('new_team.create_and_raise', 'Create Team and raise sessions') : t('new_team.create', 'Create Team');
    launchSeats.setDisabled(busy || (!committed && !canCreateTeam(draft)));
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
      [t('team.team', 'Team'), committedTeam(draft) || draft.team.name],
      [t('team.roster', 'Roster'), tx?.roster?.status],
      [t('new_team.completed', 'Completed'), tx?.completed_at],
      [t('new_team.error', 'Error'), tx?.error || tx?.roster?.error],
    ] });
    receipt.append(summary.el);
    for (const seat of draft.seats) {
      const outcome = seat.outcome;
      if (!outcome) continue;
      const row = node('article', 'nt-receipt-seat');
      row.dataset.status = outcome.status;
      row.append(node('h3', null, outcome.session_name || seat.name || seat.session_role || t('new_team.proposed_session', 'Proposed session')));
      const meta = createMetadata({ rows: [
        [t('team.status', 'Status'), outcome.status], [t('team.mode', 'Mode'), outcome.receipt?.mode],
        [t('team.role', 'Role'), outcome.receipt?.session_role], [t('team.project_root', 'Project root'), outcome.receipt?.project_root],
        [t('team.command', 'Command'), outcome.receipt?.cmd], [t('team.control', 'Control'), outcome.receipt?.dial],
        [t('team.mcp', 'MCP'), outcome.receipt ? String(outcome.receipt.mcp) : null], [t('new_team.reason', 'Reason'), outcome.error],
      ] });
      row.append(meta.el);
      if (outcome.status !== 'born') {
        const retry = createAction({ label: t('new_team.retry_seat', 'Retry this seat') });
        retry.el.addEventListener('click', () => void runLaunch([seat.seat_id]));
        row.append(retry.el);
      }
      receipt.append(row);
    }
    const lead = tx?.lead;
    if (lead) receipt.append(node('p', 'nt-lead-receipt',
      t('new_team.lead_line', 'Lead: {status}', { status: lead.status }) + `${lead.session_name ? ` · ${lead.session_name}` : ''}${lead.delivery ? ` · ${lead.delivery}` : ''}${lead.error ? ` · ${lead.error}` : ''}`));
    openTeam.el.hidden = !committedTeam(draft);
  };

  const paintName = () => {
    const name = draft.team.name;
    if (!name) return nameField.setValidation('', '');
    if (!isValidTeamName(name)) return nameField.setValidation('invalid', t('new_team.name_invalid', 'Lowercase letters, digits, _ and - only.'));
    if (!committedTeam(draft) && lastPreflight?.team && !lastPreflight.team.name_available) {
      return nameField.setValidation('invalid', t('new_team.name_taken', '"{name}" already has a roster.', { name }));
    }
    nameField.setValidation('valid', '');
  };

  const refresh = async () => {
    readTeam();
    // The button follows exactly ONE condition, because exactly one thing is enforced at
    // creation. Everything else on this form is advisory, and a disabled button is a gate.
    if (!draft.team.name) {
      lastPreflight = null;
      paintName();
      paintNotes();
      return;
    }
    const result = await preflight(draft);
    if (result.broken) {
      // The tool failed, not the draft. Say which — and do not disable anything over it.
      txNotice.set('failed', t('new_team.preflight_unreachable', 'The dry run could not be reached — {message}', { message: result.message }));
      transaction.el.hidden = false;
      return;
    }
    lastPreflight = result;
    for (const verdict of result.seats ?? []) {
      draft.seats = draft.seats.map((seat) => seat.seat_id === verdict.seat_id ? { ...seat, resolved: verdict.resolved } : seat);
    }
    saveDraft();
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
    if (busy || (!committedTeam(draft) && !canCreateTeam(draft))) return;
    busy = true;
    paintRoster();
    transaction.el.hidden = false;
    txNotice.set('info', t('new_team.raising', 'Checking the roster, then raising sessions in order…'));
    await launchDraft(draft, {
      seatIds,
      persist: () => { saveDraft(); paintRoster(); paintReceipt(); },
    });
    busy = false;
    txNotice.set('', '');
    paintRoster();
    paintReceipt();
  };
  launchSeats.el.addEventListener('click', () => void runLaunch());
  openTeam.el.addEventListener('click', () => navigateWorkspace(context, workspaceTarget('team', committedTeam(draft))));

  const loadOptions = async () => {
    const [roots, roles] = await Promise.all([
      request('/api/project-roots'),
      request('/api/team-roles'),
    ]);
    rootSelect.replaceChildren();
    rootSelect.append(new Option(t('new_team.root_default', '— the box’s default —'), ''));
    if (roots.ok) for (const r of roots.data) rootSelect.append(new Option(r.name, r.name));
    roleList.replaceChildren();
    // Zero options is the ordinary answer here and the field still works: free text is
    // accepted, and a roster may name a team_role that has no definition at all.
    if (roles.ok) for (const r of roles.data) roleList.append(new Option(r.label || r.name, r.name));
  };

  return {
    el,
    title: () => t('new_team.title', 'New Team'),
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
