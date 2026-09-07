/* part of the ronin-cowork client — see js/README.md */
import { t } from './lexicon.js';
import { createStep, dialRowMulti, el, mandateSelect } from './form-steps.js';
import { finalizeTeamName, sanitizeTeamName } from './new-team-draft.js';

const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
const OUTPUT = ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team', 'no code'];

/** A fresh row. `open` is the screen's business; everything else is the Agent's. */
export const agentRow = ({ lead = false, assignment = '' } = {}) => ({
  name: '', assignment, lead,
  reach: lead ? 'plan' : 'open', recruit: lead ? 'staff agents' : 'open',
  output: lead ? ['the team'] : ['open'], routinesOn: [], routinesOff: [], open: false,
});

export function agentPicks(rows) {
  return rows
    .filter((row) => finalizeTeamName(row.name))
    .map((row) => ({
      name: finalizeTeamName(row.name),
      instructions: row.assignment.trim(),
      mandate: { reach: row.reach, recruit: row.recruit, output: [...row.output] },
      team_lead: !!row.lead,
      // The row's OWN Routine switches, laid in by a template (a cast row's
      // through untouched and the launch's agent layer applies them.
      routines_on: [...(row.routinesOn || [])],
      routines_off: [...(row.routinesOff || [])],
    }));
}

export function createAgentRows({ n, key, rows, changed, onToggle, leadAssignment = () => '' }) {
  const step = createStep({ n, key, title: t('new_team.agents', 'Agents'), onToggle });
  const host = el('div');

  function paint() {
    host.replaceChildren();
    const buttons = el('div', 'ntf-agent-adds');
    const addLead = el('button', 'fs-door', t('new_team.lead_add', '＋ Add Lead Agent'));
    addLead.type = 'button';
    addLead.addEventListener('click', () => {
      for (const other of rows()) other.lead = false;
      rows().push(agentRow({ lead: true, assignment: leadAssignment() }));
      paint(); changed();
    });
    const add = el('button', 'fs-door', t('new_team.agent_add', '＋ Add Team Agent'));
    add.type = 'button';
    add.addEventListener('click', () => { rows().push(agentRow()); paint(); changed(); });
    buttons.append(addLead, add);
    host.append(buttons);
    rows().forEach((row, index) => {
      const box = el('div', 'ntf-agent');
      box.dataset.open = String(row.open);
      const head = el('div', 'ntf-agent-head');

      const role = el('span', 'ntf-agent-role', row.lead ? t('new_team.lead_agent', 'Lead Agent') : t('new_team.agent', 'Agent'));

      const name = el(row.open ? 'textarea' : 'input', 'ntf-agent-name');
      if (row.open) name.rows = 2;
      else name.type = 'text';
      name.spellcheck = false;
      name.autocapitalize = 'off';
      name.value = row.name;
      name.placeholder = t('new_team.agent_name', 'name');
      name.addEventListener('input', () => {
        // Sanitised as you type, like the Team's own name: a session name IS a tag.
        const at = name.selectionStart;
        const clean = sanitizeTeamName(name.value);
        if (clean !== name.value) { name.value = clean; name.setSelectionRange(at, at); }
        row.name = name.value;
        changed();
      });

      const assignment = el(row.open ? 'textarea' : 'input', 'ntf-agent-what');
      if (row.open) assignment.rows = 4;
      else assignment.type = 'text';
      assignment.value = row.assignment;
      assignment.placeholder = t('new_team.agent_assignment', 'what this Agent does');
      assignment.addEventListener('input', () => { row.assignment = assignment.value; changed(); });

      const more = el('button', 'ntf-agent-more', row.open ? '▾' : '▸');
      more.type = 'button';
      more.title = t('new_team.agent_more', 'Its mandate');
      more.addEventListener('click', () => { row.open = !row.open; paint(); });

      const drop = el('button', 'ntf-agent-drop', '✕');
      drop.type = 'button';
      drop.title = t('new_team.agent_drop', 'Remove this Agent');
      drop.addEventListener('click', () => { rows().splice(index, 1); paint(); changed(); });

      head.append(role, name, assignment, more, drop);
      box.append(head);

      if (row.open) {
        const detail = el('div', 'ntf-agent-detail');
        const pair = el('div', 'fs-pair');
        for (const [label, values, field] of [[t('reach', 'Reach'), REACH, 'reach'], [t('recruit', 'Recruit'), RECRUIT, 'recruit']]) {
          const wrap = el('label', 'tw-config-field');
          wrap.append(el('span', null, label), mandateSelect(values, row[field], (value) => { row[field] = value; changed(); }));
          pair.append(wrap);
        }
        detail.append(pair, dialRowMulti(t('output', 'Output'), OUTPUT, row.output, (value, on) => {
          row.output = on ? [...row.output, value] : row.output.filter((entry) => entry !== value);
          paint();
          changed();
        }));
        box.append(detail);
      }
      host.append(box);
    });
  }

  step.body.append(host);
  return { step, paint };
}
