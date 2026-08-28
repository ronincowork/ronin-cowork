/* part of the ronin-cowork client — see js/README.md */

/**
 * THE SEAT'S EDITABLE FIELDS — eleven controls, and the law that absence is a value.
 *
 * Every control here edits a field `POST /api/launch` already accepts. Nothing on this
 * Surface invents a launch field: the owner's v1 ruling is that agent configuration edits
 * launch-time fields and nothing else, and everything the cascade computes is shown
 * read-only beside it (`agent-config-resolved.js`).
 *
 * ABSENCE IS A VALUE, AND ONLY ABSENCE. Four fields distinguish *unset* from *stated* —
 * `NULLABLE_SEAT_FIELDS`, imported rather than restated, because the one place that list
 * may live is New Team's draft (Gate E). For those four, `null` means "whatever the
 * resolved profile says" and the wire body simply omits the key (`bodyOf`). Everywhere
 * else an empty string or an empty array is a STATED value: `session_role: ''` is a real
 * blank-role launch, not "not picked yet", and `mode` is always stated because the wire
 * defaults an absent mode to `assisted` while the launcher's honest default is `manual`.
 *
 * SO NO CONTROL MAY MATERIALISE A DEFAULT. A `<select>` needs a selected option and a
 * toggle has two positions; both would turn a silent seat into a stated one, and the
 * draft would change merely by being looked at. Every control that edits a nullable field
 * is therefore a TRI-STATE with an explicit inherit position, and every field carries a
 * clear affordance — the only way back to unset once a value is typed.
 *
 * TWO CONTROLS ARE DERIVED, NEVER ASSERTED, and both come from `resolved.agent`:
 *   cmd     an `agent: none` seat (OpenShell) is REFUSED a command by the resolver
 *           (`src/spawn.ts:331`), so the control disables itself rather than offering a
 *           value whose only outcome is a refusal.
 *   prompt  the launch demands one only when an agent is launched
 *           (`src/routes/launch.ts:113`), so an OpenShell seat is valid with an empty
 *           prompt. Requiredness is read off the resolution, never hard-coded here.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { NULLABLE_SEAT_FIELDS, createSeat, clearSeatField } from './new-team-draft.js';
import { t } from './lexicon.js';


/** The eleven, in the order the owner meets them. `team` is NOT here: it lives once on
 *  the TeamDefinition, because one draft is one Team. */
// A function, not a frozen table: the lexicon loads after this module is evaluated, so
// the words are read when the form is built.
function seatFields() {
  return [
    { key: 'session_role', label: t('seat.session_role', 'Session role'), kind: 'text',
      description: t('seat.session_role_desc', 'What this session is doing. Blank is a real launch — no reading, no mark.') },
    { key: 'name', label: t('seat.name', 'Name'), kind: 'text',
      description: t('seat.name_desc', 'Left unset, the server derives it from the role and the prompt.') },
    { key: 'mode', label: t('team.mode', 'Mode'), kind: 'mode',
      description: t('seat.mode_desc', 'Manual sends your words untouched. Assisted composes the brief.') },
    { key: 'prompt', label: t('seat.prompt', 'What it is for'), kind: 'textarea',
      description: t('seat.prompt_desc', "The agent's first message.") },
    { key: 'project_root', label: t('team.project_root', 'Project root'), kind: 'text',
      description: t('seat.project_root_desc', "Unset falls to the Team's root, then the top active root.") },
    { key: 'cmd', label: t('seat.cmd', 'Launch command'), kind: 'text',
      description: t('seat.cmd_desc', 'Unset falls to the role’s model bias, then the install default.') },
    { key: 'mcp', label: t('seat.mcp', 'gbrain'), kind: 'tristate',
      description: t('seat.mcp_desc', 'Unset means whatever the resolved profile says.') },
    { key: 'seed', label: t('seat.seed', 'Read first'), kind: 'list',
      description: t('seat.seed_desc', 'Paths read before anything else. Assisted mode only.') },
    { key: 'inject', label: t('seat.inject', 'Extra instruction'), kind: 'text',
      description: t('seat.inject_desc', 'Appended verbatim. Assisted mode only.') },
    { key: 'reference', label: t('seat.reference', 'Pointed at'), kind: 'text',
      description: t('seat.reference_desc', 'One session this one is aimed at.') },
  ];
}

const isNullable = (key) => NULLABLE_SEAT_FIELDS.includes(key);

/** Read a control back into the seat's own vocabulary. Empty stays empty where empty is
 *  a stated value; only a nullable field may report unset. */
function readControl(spec, control) {
  if (spec.kind === 'tristate') return control.value === '' ? null : control.value === 'on';
  if (spec.kind === 'list') {
    return control.value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (spec.kind === 'mode') return control.value === 'manual' ? 'manual' : 'assisted';
  const raw = control.value;
  if (isNullable(spec.key)) return raw === '' ? null : raw;
  return raw;
}

/** Paint a seat's value into a control WITHOUT inventing one. A null nullable field
 *  selects the inherit position; it never falls through to a default. */
function writeControl(spec, control, value) {
  if (spec.kind === 'tristate') {
    control.value = value === null || value === undefined ? '' : value ? 'on' : 'off';
    return;
  }
  if (spec.kind === 'list') {
    control.value = (value ?? []).join(', ');
    return;
  }
  if (spec.kind === 'mode') {
    control.value = value === 'manual' ? 'manual' : 'assisted';
    return;
  }
  control.value = value ?? '';
}

function controlFor(spec) {
  if (spec.kind === 'tristate') {
    const sel = document.createElement('select');
    // The inherit position is FIRST and is a real option, not a placeholder — a seat that
    // says nothing about gbrain must be selectable, not merely the absence of a choice.
    for (const [v, label] of [['', t('seat.inherit', 'inherit')], ['on', t('seat.on', 'on')], ['off', t('seat.off', 'off')]]) {
      sel.add(new Option(label, v));
    }
    return sel;
  }
  if (spec.kind === 'mode') {
    const sel = document.createElement('select');
    for (const [v, label] of [['manual', t('seat.manual', 'manual')], ['assisted', t('seat.assisted', 'assisted')]]) sel.add(new Option(label, v));
    return sel;
  }
  if (spec.kind === 'textarea') {
    const ta = document.createElement('textarea');
    ta.rows = 3;
    return ta;
  }
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.autocapitalize = 'off';
  inp.spellcheck = false;
  return inp;
}

/**
 * Build the editing half of the Agent Configuration Surface.
 *
 * `onChange` receives the whole seat after every edit; the caller owns when that reaches
 * the draft. Nothing here writes `seat_id`, `presented_family`, `resolved` or `outcome` —
 * those are New Team's and pass through untouched.
 */
export function createSeatFields({ seat, onChange } = {}) {
  // Resolved at CALL time, never at import time: a module that reaches into another
  // module's value while the graph is still loading is load-order fragility, and the
  // gate is right to refuse it.
  const { createField, createForm } = WorkspaceKit.primitives;
  const form = createForm({ noValidate: true });
  form.el.classList.add('ac-form');
  form.fields.classList.add('ac-fields');
  let current = seat ?? createSeat();
  const fields = new Map();

  const emit = () => onChange?.(current);

  for (const spec of seatFields()) {
    const control = controlFor(spec);
    const field = createField({ label: spec.label, description: spec.description, control });
    field.el.classList.add('ac-field', `ac-field-${spec.key.replaceAll('_', '-')}`);
    control.classList.add('ac-control');
    writeControl(spec, control, current[spec.key]);

    // The clear affordance — the ONLY way back to unset, and offered only where an unset
    // state exists. On a non-nullable field there is nothing to return to: '' is stated.
    if (isNullable(spec.key)) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'ac-field-clear';
      clear.textContent = t('seat.inherit', 'inherit');
      clear.title = t('seat.inherit_title', 'Return {field} to unset — the resolved profile answers it', { field: spec.label });
      clear.addEventListener('click', () => {
        current = clearSeatField(current, spec.key);
        writeControl(spec, control, current[spec.key]);
        emit();
      });
      field.el.append(clear);
    }

    control.addEventListener('change', () => {
      current = { ...current, [spec.key]: readControl(spec, control) };
      emit();
    });

    fields.set(spec.key, { spec, control, field });
    form.fields.append(field.el);
  }

  /**
   * Apply one preflight seat verdict. `reasons[]` carries `{code, field, message}` and the
   * message is the SERVER'S own words — the cascade names the file it refused from, and
   * that sentence is shown verbatim under the control that is wrong rather than
   * paraphrased into a banner.
   */
  const showVerdict = (verdict) => {
    for (const { field } of fields.values()) field.setValidation('', '');
    form.notice.set('', '');
    if (!verdict) return;
    for (const reason of verdict.reasons ?? []) {
      const target = fields.get(reason.field);
      const kind = verdict.verdict === 'warn' ? 'warning' : 'invalid';
      if (target) target.field.setValidation(kind, reason.message);
      // A reason naming no control still has to be seen: it goes to the form's own notice
      // rather than being dropped because it had nowhere to sit.
      else form.notice.set(verdict.verdict === 'warn' ? 'warning' : 'failed', reason.message);
    }
  };

  /**
   * Derived enablement, read off the resolution and never asserted here. An agentless
   * seat cannot carry a command, and does not need a prompt.
   */
  const applyResolved = (resolved) => {
    const agent = resolved?.agent !== false;
    const cmd = fields.get('cmd');
    cmd.control.disabled = !agent;
    cmd.field.description.textContent = agent
      ? t('seat.cmd_desc', 'Unset falls to the role’s model bias, then the install default.')
      : t('seat.cmd_no_agent', 'This seat launches no agent, so it cannot carry a command.');
    const prompt = fields.get('prompt');
    prompt.field.description.textContent = agent
      ? t('seat.prompt_desc', "The agent's first message.")
      : t('seat.prompt_no_agent', 'A plain terminal has nobody to tell — an empty prompt is valid here.');
  };

  /** Repaint from a seat without emitting: opening a seat must not edit it. */
  const setSeat = (next) => {
    current = next;
    for (const { spec, control } of fields.values()) writeControl(spec, control, current[spec.key]);
  };

  return { el: form.el, form, fields, setSeat, showVerdict, applyResolved, get seat() { return current; } };
}
