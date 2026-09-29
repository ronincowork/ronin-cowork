/* The canonical Project reading, shared by Task Manager and Work Items, and the whole
 * work item reading the work-item surfaces open. */
import { t } from './lexicon.js';
import { createStep } from './form-steps.js';

const node = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

export function appendProjectReading(host, project, { holder, stage, prefix = 'wi' }) {
  host.append(node('h2', '', project.title), node('p', `${prefix}-project-id`, project.id), node('p', `${prefix}-outcome`, project.objective));
  const facts = node('dl', `${prefix}-project-facts`);
  for (const [label, value] of [[t('team_kanban.stage', 'Status'), stage], [t('team_kanban.holder', 'Holder'), `@${holder}`], [t('team_kanban.progress', 'Progress'), project.status], [t('team_kanban.next', 'Next'), project.exit]]) facts.append(node('dt', '', label), node('dd', '', value));
  host.append(facts);
  if (project.evidence.length) host.append(node('h3', '', t('team_kanban.evidence', 'Evidence')), node('p', `${prefix}-evidence`, project.evidence.join(' · ')));
}

const list = (className, rows) => {
  const out = node('ul', `wi-lines ${className}`);
  for (const row of rows) out.append(row instanceof Node ? row : node('li', '', row));
  return out;
};
const rungLines = (ladder) => ladder.flatMap((rung) => rung.gate !== undefined
  ? [node('li', 'wi-rung', `${t('work_item.gate', 'Gate')}: ${rung.gate} · ${rung.status || 'PLANNED'}`)]
  : [node('li', 'wi-rung', [rung.phase, rung.status].filter(Boolean).join(' · ')),
    ...(rung.legs || []).map((leg) => node('li', 'wi-leg', `${leg.title} · ${leg.status}`))]);
const trailLine = (line) => [
  String(line.at || '').slice(0, 16).replace('T', ' '), line.by, line.op,
  line.from !== undefined || line.to !== undefined ? `${line.from ?? '—'} → ${line.to ?? '—'}` : '', line.note || '',
].filter(Boolean).join(' · ');

/** The whole work item: title, objective, holder with its stage bar, then its ladder, docs
 * and trail as steps (the trail folded to its count). `bar` is the caller's stage bar
 * (team-kanban's stageBar); `through` is any action row the caller adds under the head. */
export function appendItemReading(host, item, { holder = '', bar = null, through = null } = {}) {
  host.append(node('h2', '', item.title));
  if (item.objective) host.append(node('p', 'wi-outcome', item.objective));
  const facts = node('div', 'wi-item-facts');
  facts.append(node('span', '', holder ? `@${holder}` : t('work_item.held_by_nobody', 'held by nobody')));
  if (bar) facts.append(bar);
  host.append(facts);
  if (through) host.append(through);
  const ladder = item.ladder || [], docs = item.docs || [], trail = item.trail || [];
  const sections = [
    ['ladder', t('work_item.ladder', 'Ladder'), ladder.length ? list('wi-ladder', rungLines(ladder)) : node('p', 'wi-none', t('work_item.no_ladder', 'No ladder yet.')), false],
    ['docs', t('work_item.docs', 'Docs'), docs.length ? list('wi-docs', docs) : node('p', 'wi-none', t('work_item.no_docs', 'No docs listed.')), false],
    ['trail', t('work_item.trail', 'Trail'), list('wi-trail', trail.map(trailLine)), true],
  ];
  const steps = node('div', 'wi-steps');
  sections.forEach(([key, title, body, folded], index) => {
    let collapsed = folded;
    const step = createStep({ n: index + 1, key, title, onToggle: () => { collapsed = !collapsed; paint(); } });
    const summary = key === 'trail' ? t('work_item.trail_count', '{n} lines', { n: trail.length }) : '';
    const paint = () => step.setCollapsed(collapsed, summary);
    step.body.append(body);
    paint();
    steps.append(step.el);
  });
  host.append(steps);
}
