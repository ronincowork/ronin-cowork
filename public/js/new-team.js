/* part of the ronin-cowork client — see js/README.md */

/**
 * NEW TEAM — one Surface, seven fields, one button.
 *
 * It hosts NO Tile and no Channel service: a Team is a durable record, not a session, so
 * there is nothing here rendering output and nothing to attach to.
 *
 * IT CREATES A TEAM AND LEAVES. Staffing is not this surface's job — the New Agent
 * launcher already names the Team a session is born onto (its team selector, including
 * "＋ new team…"), and membership is derived from the tags live sessions carry. A second
 * seat-building path here was a worse copy of that one, so it is gone: create the Team,
 * land in it, and raise Agents from inside it like any other Cowork space.
 *
 * NOTHING IS REQUIRED EXCEPT A NAME. An
 * empty objective, no root, no repos and no branch are all valid. No control here gates
 * anything the server does not.
 *
 * THE DRAFT IS SPENT ON SUCCESS. What the owner typed survives leaving and coming back
 * within the tab, and is dropped the moment the roster exists — so the next time the New
 * Team card is opened the form is empty, ready for the next Team.
 */
import { request } from './request.js';
import {
  canCreateTeam,
  createDraft,
  finalizeTeamName,
  isValidTeamName,
  rosterBody,
  sanitizeTeamName,
} from './new-team-draft.js';
import { t } from './lexicon.js';

const node = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

/**
 * @param kit      the one Workspace Kit
 * @param created  called with the new Team's name once its roster exists. The host
 *                 decides where the owner lands; this surface never navigates itself.
 */
export function createNewTeamView(kit, { created = null } = {}) {
  const { createSurface, createAction, createActionBar, createForm, createField, createNotice } = kit.primitives;
  let draft = createDraft();
  let context = null;
  let busy = false;
  const saveDraft = () => context?.patchViewState('new-team', { draft });

  const definition = createSurface({ className: 'nt-definition', label: t('new_team.define', 'Define the Team') });
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
    nameField.el, objectiveField.el, rootField.el,
    reposField.el, branchField.el, boardField.el,
  );

  const createTeam = createAction({ label: t('new_team.create', 'Create Team'), kind: 'primary' });
  const actions = createActionBar({ label: t('new_team.team_actions', 'Team actions'), actions: [createTeam] });
  // The Kit's notice hides itself when its message is empty; nothing here toggles it.
  const notice = createNotice();
  definition.content.append(heading, form.el, actions.el, notice.el);

  const el = kit.layouts.createNewTeamLayout(definition.el);

  /* ---------------- behaviour ---------------- */

  const readTeam = () => {
    draft.team.name = finalizeTeamName(nameInput.value);
    draft.team.objective = objectiveInput.value.trim();
    draft.team.project_root = rootSelect.value;
    draft.team.repos = reposInput.value.split(',').map((s) => s.trim()).filter(Boolean);
    draft.team.branch = branchInput.value.trim();
    draft.team.wipeboard = boardInput.value.trim();
    saveDraft();
  };

  const say = (kind, message) => notice.set(kind, message);

  const paintName = () => {
    const name = draft.team.name;
    if (!name) return nameField.setValidation('', '');
    if (!isValidTeamName(name)) return nameField.setValidation('invalid', t('new_team.name_invalid', 'Lowercase letters, digits, _ and - only.'));
    nameField.setValidation('valid', '');
  };

  // The button follows exactly ONE condition, because exactly one thing is enforced at
  // creation. Everything else on this form is advisory, and a disabled button is a gate.
  const paintAction = () => createTeam.setDisabled(busy || !canCreateTeam(draft));

  const fill = () => {
    nameInput.value = draft.team.name ?? '';
    objectiveInput.value = draft.team.objective ?? '';
    reposInput.value = (draft.team.repos ?? []).join(', ');
    branchInput.value = draft.team.branch ?? '';
    boardInput.value = draft.team.wipeboard ?? '';
    rootSelect.value = draft.team.project_root ?? '';
    paintName();
    paintAction();
  };

  nameInput.addEventListener('input', () => {
    const caret = nameInput.selectionStart;
    const clean = sanitizeTeamName(nameInput.value);
    if (clean !== nameInput.value) {
      nameInput.value = clean;
      // Character-for-character, so the caret does not jump while the owner types.
      nameInput.setSelectionRange(caret, caret);
    }
    readTeam();
    paintName();
    paintAction();
  });
  // Settle the name when the owner leaves the field: a trailing separator is legal to
  // TYPE (you are on your way to the next word) and wrong to CREATE.
  nameInput.addEventListener('blur', () => {
    const settled = finalizeTeamName(nameInput.value);
    if (settled !== nameInput.value) nameInput.value = settled;
    readTeam();
    paintName();
  });
  for (const control of [objectiveInput, reposInput, branchInput, boardInput]) {
    control.addEventListener('input', () => { readTeam(); });
  }
  rootSelect.addEventListener('change', () => { readTeam(); });

  /**
   * ONE WRITE, AND THE SERVER'S WORD IS THE ANSWER. A name that already has a roster
   * comes back as a refusal from the store rather than being guessed at here; a duplicate
   * is the one collision worth saying out loud, and the store says it.
   */
  const create = async () => {
    if (busy || !canCreateTeam(draft)) return;
    readTeam();
    busy = true;
    paintAction();
    say('info', t('new_team.creating', 'Creating the Team…'));
    const name = finalizeTeamName(draft.team.name);
    const result = await request('/api/team-rosters', { method: 'POST', json: rosterBody(draft.team) });
    busy = false;
    if (!result.ok) {
      say('failed', result.message);
      paintAction();
      return;
    }
    // Spent. The Team is the record now, so the surface goes back to empty and the next
    // Team starts from nothing — no receipt to dismiss and no stale name to retype over.
    draft = createDraft();
    saveDraft();
    fill();
    say('', '');
    await created?.(name);
  };
  createTeam.el.addEventListener('click', () => void create());

  const loadOptions = async () => {
    const roots = await request('/api/project-roots');
    rootSelect.replaceChildren();
    rootSelect.append(new Option(t('new_team.root_default', '— the box’s default —'), ''));
    if (roots.ok) for (const r of roots.data) rootSelect.append(new Option(r.name, r.name));
  };

  return {
    el,
    title: () => t('new_team.title', 'New Team'),
    enter: (nextContext) => {
      context = nextContext;
      const stored = nextContext.viewState('new-team')?.draft;
      draft = stored && typeof stored === 'object' && stored.team ? createDraft(stored) : createDraft();
      fill();
      void loadOptions().then(() => { rootSelect.value = draft.team.project_root ?? ''; });
    },
    /** The typed-and-not-yet-created definition, for the Templates surface. It is the
     *  view's own and per browser-tab: two tabs hold two independent drafts. */
    draft: () => draft,
  };
}
