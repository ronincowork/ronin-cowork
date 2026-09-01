/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TEAM'S OWN AGENTS — the rows a Team is raised with.
 *
 * Its own module because New Team crossed the 700-line ceiling the moment this arrived,
 * and because it is genuinely one thing: a list editor with a shared row shape. That shape
 * is agreed across three packages on the `sea_settle` board — this form PRODUCES it,
 * `@team_loader` CONSUMES it, and a team template from `@template_shelves` CARRIES it:
 *
 *     { name, assignment, mandate: { reach, recruit, output }, lead }
 *
 * `open` is this editor's alone and never leaves it: whether the row is expanded is a fact
 * about the screen, not about the Agent.
 *
 * THE LEAD IS A MARK, NOT A SEAT (owner, 2026-09-01): "the new team still shows quick to
 * add a lead, but that's sort of not needed anymore because it's part of the team
 * construction… if someone wants a team lead, then they've got to add an agent and mark
 * them as a lead." Several rows may carry it; a Team may have none.
 *
 * A ROW IS SHORT ON PURPOSE — "a really short version of what the agent is… basically name
 * and assignment" — and opens for its mandate when you want it. If the opened row ever
 * stops fitting, the owner's own fallback is to open it as a full New Agent in the other
 * workspace; the Launch bench already holds two forms, so that is a placement, not new
 * machinery.
 */
import { t } from './lexicon.js';
import { createStep, dialRowMulti, el, mandateSelect } from './form-steps.js';
import { finalizeTeamName, sanitizeTeamName } from './new-team-draft.js';

const REACH = ['open', 'discuss', 'plan', 'execute'];
const RECRUIT = ['open', 'nobody', 'propose agents', 'staff agents'];
const OUTPUT = ['open', 'a plan', 'ideas', 'code', 'an artifact', 'the team', 'no code'];

/** A fresh row. `open` is the screen's business; everything else is the Agent's. */
export const agentRow = () => ({ name: '', assignment: '', lead: false, reach: 'open', recruit: 'open', output: ['open'], open: false });

/**
 * The rows as the loader and a template want them — nested mandate, no screen state.
 *
 * THE WIRE WORDS ARE THE ROUTE'S, NOT THE SCREEN'S (lead, 2026-09-01): `instructions`,
 * because that is the launch's settled word for the first thing an Agent is told (the § 5
 * walk is session type · name · instructions), and `team_lead`, matching the landed launch
 * flag. The row keeps `assignment` and `lead` because those are what a person reads on a
 * line; this function is the one place the two vocabularies meet, which is why the three
 * packages agreed on it rather than on the row.
 *
 * A function declaration, not a const arrow: check-modules refuses an imported binding
 * named at module top level, and this one reaches for `finalizeTeamName`.
 */
export function agentPicks(rows) {
  return rows
    .filter((row) => finalizeTeamName(row.name))
    .map((row) => ({
      name: finalizeTeamName(row.name),
      instructions: row.assignment.trim(),
      mandate: { reach: row.reach, recruit: row.recruit, output: [...row.output] },
      team_lead: !!row.lead,
    }));
}

export function createAgentRows({ n, key, rows, changed, onToggle }) {
  const step = createStep({ n, key, title: t('new_team.agents', 'Agents'), onToggle });
  const host = el('div');

  function paint() {
    host.replaceChildren();
    rows().forEach((row, index) => {
      const box = el('div', 'ntf-agent');
      const head = el('div', 'ntf-agent-head');

      const lead = el('button', 'ntf-agent-lead', '人');
      lead.type = 'button';
      lead.setAttribute('aria-pressed', String(row.lead));
      lead.title = t('new_team.agent_lead_title', 'Mark this Agent as the team lead');
      lead.addEventListener('click', () => { row.lead = !row.lead; paint(); changed(); });

      const name = el('input', 'ntf-agent-name');
      name.type = 'text';
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

      const assignment = el('input', 'ntf-agent-what');
      assignment.type = 'text';
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

      head.append(lead, name, assignment, more, drop);
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
    const add = el('button', 'fs-door', t('new_team.agent_add', '＋ Add an Agent'));
    add.type = 'button';
    add.addEventListener('click', () => { rows().push(agentRow()); paint(); changed(); });
    host.append(add);
  }

  step.body.append(host);
  return { step, paint };
}
