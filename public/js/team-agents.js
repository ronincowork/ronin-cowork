/* part of the ronin-cowork client — see js/README.md */
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { createStep, el, mandateWord, modelAvailabilityFact, modelLabel, providerCatalog, tierWord } from './form-steps.js';
import { finalizeTeamName, sanitizeTeamName } from './new-team-draft.js';

const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
const OUTPUT = ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team', 'no code'];
let rowId = 0;

export const agentRow = () => ({
  name: '', assignment: '', provider: '', model: '',
  reach: 'open', recruit: 'open', output: ['open'],
});
const copyRow = (row) => ({ ...agentRow(), ...row, output: [...(row.output || ['open'])] });

export function agentPicks(rows) {
  return rows.filter((row) => finalizeTeamName(row.name)).map((row) => ({
    name: finalizeTeamName(row.name), instructions: row.assignment.trim(),
    mandate: { reach: row.reach, recruit: row.recruit, output: [...row.output] },
    ...(row.provider ? { provider: row.provider } : {}),
    ...(row.model ? { model: row.model } : {}),
  }));
}

export function createAgentRows({ n, key, rows, changed, onToggle, createAction, createActionBar }) {
  const step = createStep({ n, key, title: t('new_team.agents', 'Agents'), onToggle });
  const host = el('div'); let editor = null;
  const field = (label, control) => {
    const wrap = el('label', 'ntf-agent-field');
    wrap.append(el('span', 'wk-field-label', label), control); return wrap;
  };
  const openEditor = (row = agentRow(), index = -1) => { editor = { row: copyRow(row), index }; paint(); };

  function paintEditor() {
    const { row, index } = editor; const id = `new-team-agent-${++rowId}`;
    const box = el('fieldset', 'ntf-agent ntf-agent-editor');
    box.append(el('legend', 'ntf-agent-legend', index < 0 ? t('new_team.agent_add_title', 'Add Agent') : t('new_team.agent_edit_title', 'Edit Agent')));
    const name = el('input', 'ntf-agent-name'); name.type = 'text'; name.spellcheck = false; name.autocapitalize = 'off'; name.value = row.name; name.id = `${id}-name`;
    const assignment = el('textarea', 'ntf-agent-what'); assignment.rows = 3; assignment.value = row.assignment; assignment.id = `${id}-assignment`;
    const cancel = createAction({ label: t('cancel', 'Cancel'), size: 'compact', action: () => { editor = null; paint(); } });
    const confirm = createAction({ label: index < 0 ? t('new_team.agent_add_confirm', 'Add') : t('save', 'Save'), kind: 'primary', size: 'compact' });
    const actions = createActionBar({ label: t('new_team.agent_editor_actions', 'Agent actions'), actions: [cancel, confirm], className: 'ntf-agent-editor-actions' });
    name.addEventListener('input', () => {
      const at = name.selectionStart; const clean = sanitizeTeamName(name.value);
      if (clean !== name.value) { name.value = clean; name.setSelectionRange(at, at); }
      row.name = name.value; confirm.setDisabled(!finalizeTeamName(row.name));
    });
    assignment.addEventListener('input', () => { row.assignment = assignment.value; });

    const providerRows = () => providerCatalog().rows
      .filter((item, at, all) => all.findIndex((other) => other.provider === item.provider) === at)
      .map((item) => ({
        v: item.provider, l: item.cli_label || item.provider_label || item.provider,
        off: item.operational ? undefined : item.off ? t('forms.reason_turned_off', 'turned off') : t('forms.reason_not_on_machine', 'not on this machine'),
      }));
    const modelRows = (provider) => providerCatalog().rows.filter((item) => item.provider === provider).map((item) => ({
      v: item.model, l: modelLabel(item), word: tierWord(item.tier), sub: item.cost || '',
      off: !item.operational
        ? (item.off ? t('forms.reason_turned_off', 'turned off') : t('forms.reason_not_on_machine', 'not on this machine'))
      : !item.selectable
        ? modelAvailabilityFact(item)
        : undefined,
    }));
    const mandateRows = (values) => values.map((value) => ({ v: value, l: mandateWord(value) }));
    const questions = ask([
      { group: t('new_agent.model_package', 'Model'), fields: [
        { key: 'provider', label: t('forms.provider', 'Model provider'), blank: t('forms.default', 'Default'), options: providerRows },
        { key: 'model', label: t('forms.model', 'Model'), blank: t('forms.default', 'Default'), after: 'provider', options: (value) => modelRows(value.provider) },
      ] },
      { group: t('mandate', 'Mandate'), fields: [
        { key: 'reach', label: t('reach', 'Reach'), options: mandateRows(REACH) },
        { key: 'recruit', label: t('recruit', 'Recruit'), options: mandateRows(RECRUIT) },
        { key: 'output', label: t('output', 'Output'), many: true, options: mandateRows(OUTPUT) },
      ] },
    ], {
      value: row,
      className: 'ntf-agent-questions',
      density: 'tight',
      onChange: (value) => {
        row.provider = value.provider; row.model = value.model;
        row.reach = value.reach; row.recruit = value.recruit; row.output = value.output;
      },
    });
    confirm.setDisabled(!finalizeTeamName(row.name));
    confirm.el.addEventListener('click', () => {
      if (!finalizeTeamName(row.name)) return;
      const saved = copyRow(row);
      if (index < 0) rows().push(saved); else rows()[index] = saved;
      editor = null; changed(); paint();
    });
    box.append(actions.el, field(t('new_team.agent_name', 'Name'), name), field(t('new_team.agent_assignment_label', 'Instructions'), assignment), questions.el);
    return box;
  }

  function paint() {
    host.replaceChildren();
    rows().forEach((row, index) => {
      const card = el('div', 'ntf-agent-row'); const words = el('div', 'ntf-agent-row-words');
      words.append(el('b', null, row.name || t('new_team.unnamed_agent', 'unnamed Agent')));
      const details = [row.assignment, `${mandateWord(row.reach)} · ${mandateWord(row.recruit)} · ${row.output.map(mandateWord).join(', ')}`, [row.provider, row.model ? modelLabel(row) : ''].filter(Boolean).join(' · ')].filter(Boolean);
      words.append(el('small', null, details.join(' — ')));
      const edit = createAction({ label: t('edit', 'Edit'), size: 'compact', action: () => openEditor(row, index) });
      const drop = createAction({
        label: t('remove', 'Remove'), kind: 'danger', size: 'compact',
        title: t('new_team.agent_drop_named', 'Remove {name}', { name: row.name || t('new_team.unnamed_agent', 'unnamed Agent') }),
        action: () => { rows().splice(index, 1); changed(); paint(); },
      });
      const actions = createActionBar({ label: t('new_team.agent_row_actions', 'Agent row actions'), actions: [edit, drop], className: 'ntf-agent-row-actions' });
      card.append(words, actions.el); host.append(card);
    });
    if (editor) host.append(paintEditor());
    else {
      host.append(createAction({ label: t('new_team.agent_add', '＋ Add Agent'), kind: 'primary', action: () => openEditor() }).el);
    }
  }
  step.body.append(host); return { step, paint };
}
