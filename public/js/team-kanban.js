/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { t } from './lexicon.js';
import { createPhalanx } from './phalanx.js';

const COLUMNS = [
  { key: 'IDEAS', label: 'Ideas', worker: 'lead' },
  { key: 'PLANNING', label: 'Planning', worker: 'Agent with the owner' },
  { key: 'BUILDING', label: 'Building', worker: 'Agent' },
  { key: 'LANDING', label: 'Landing', worker: 'lead, then user' },
  { key: 'DONE', label: 'Done', worker: '' },
];
const INDEX = Object.fromEntries(COLUMNS.map((column, index) => [column.key, index]));
let nextHeaderId = 0;
export const KANBAN_NOT_INSTALLED = 'Unavailable.';
const KANBAN_CAMPAIGN_OFF = 'Unavailable.';

export const taskManagerScope = (value = {}) => {
  const kind = ['desk', 'team', 'agent'].includes(value.kind) ? value.kind : 'team';
  const teams = [...new Set((typeof value.teams === 'function' ? value.teams() : value.teams || [value.team]).map(String).filter(Boolean))];
  return { kind, teams, agent: kind === 'agent' ? String(value.agent || '') : '' };
};
export const projectsForScope = (rows, scope) => {
  const seen = new Set();
  return rows.map(normalizedProject)
    .filter((project) => (!scope.agent || project.holder === scope.agent) && !seen.has(project.id) && seen.add(project.id));
};

export function kanbanAvailability(installed) {
  const services = installed?.services || {};
  const capabilities = services.capabilities;
  if (capabilities?.desired && Array.isArray(capabilities.running)) {
    const available = capabilities.desired.task_manager === true && capabilities.running.includes('task_manager');
    return { available, message: available ? '' : KANBAN_CAMPAIGN_OFF };
  }
  if (Array.isArray(services.loaded) && services.loaded.includes('kanban')) return { available: true, message: '' };
  const parked = Array.isArray(services.parked) && services.parked.some((part) => part?.name === 'kanban');
  return { available: false, message: parked ? KANBAN_CAMPAIGN_OFF : KANBAN_NOT_INSTALLED };
}

const node = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};
const stageLabel = (key) => COLUMNS[INDEX[key]]?.label || key;
const normalizedProject = (value) => ({
  ...value,
  id: String(value?.id || ''),
  title: String(value?.title || value?.id || 'Untitled project'),
  objective: String(value?.objective || ''),
  evidence: Array.isArray(value?.evidence) ? value.evidence.map(String) : [],
  holder: String(value?.holder || 'lead'),
  stage: INDEX[value?.stage] == null ? 'IDEAS' : value.stage,
  exit: String(value?.exit || 'none'),
  status: ['green', 'yellow', 'red'].includes(value?.status) ? value.status : 'yellow',
});

export const waitingOn = (project) => project.stage !== 'DONE'
  && project.status === 'green'
  && ['lead', 'user'].includes(project.exit) ? project.exit : '';

export function definedTargets(project) {
  const targets = new Set();
  if (project.stage === 'DONE') return targets;
  if (project.status === 'green' && COLUMNS[INDEX[project.stage] + 1]) targets.add(COLUMNS[INDEX[project.stage] + 1].key);
  if (project.stage === 'PLANNING') targets.add('IDEAS');
  return targets;
}

const meaningLine = (move) => move.text.split('meaning: ')[1]?.split('\n')[0] || '';

/** The exact one-message write path described by the Team Kanban concept. */
export function moveMessage(project, toStage, leadName, now = new Date()) {
  const fromIndex = INDEX[project.stage];
  const toIndex = INDEX[toStage];
  const forward = toIndex === fromIndex + 1;
  const holder = project.holder === 'lead' ? leadName : project.holder;
  const n = project.id.split('/').at(-1);
  const at = now.toISOString().slice(0, 16) + 'Z';
  const head = `from @kanban (the Team Task Manager, moved by the user at ${at}):`;
  const line = `MOVE ${project.id} "${project.title}" from ${stageLabel(project.stage)} (${project.status}, exit: ${project.exit}) to ${stageLabel(toStage)}`;
  const byNote = project.exit !== 'user' && project.exit !== 'none' ? ` (exit named the ${project.exit}; the user dragged it)` : '';
  const result = (target, meaning, next) => ({ target, text: `${head}\n${line}\n  meaning: ${meaning}\n  next: ${next}` });

  if (project.stage === 'PLANNING' && toStage === 'IDEAS') {
    return result(leadName, 'return it to Ideas; the house moves it back to the roster.', `work-record project return ${n}   (end @${project.holder} if this was its only project)`);
  }
  if (!forward) return { target: holder, text: `${head}\n${line}\n  meaning: no defined move; delivered as a plain request.` };
  if (project.status !== 'green') {
    return result(holder, `a request to move on, not an approval; the card is ${project.status === 'red' ? 'blocked' : 'being worked'}.`, 'your call — say why not, or set it green when it is ready.');
  }
  if (project.stage === 'IDEAS') return result(leadName, 'engage — the user wants this started.', `assign it to an Agent, or raise one for it (project ${n} lands in that Agent's work record)`);
  if (project.stage === 'PLANNING') return result(holder, `the plan is agreed${byNote}; build.`, `work-record project write ${n} --stage BUILDING`);
  if (project.stage === 'BUILDING') return result(holder, `show approved${byNote}; hand in.`, `worktree-desk hand-in, then work-record project write ${n} --stage LANDING`);
  if (project.stage === 'LANDING') {
    const release = project.exit === 'user';
    return result(leadName, `${release ? 'release — merge the dev → master pull request' : 'promote'}${byNote}.`, release ? 'open or merge the pull request' : `bin/ronin-promote ${project.id.split('/')[0]}`);
  }
  return { target: holder, text: `${head}\n${line}\n  meaning: delivered as a plain request.` };
}

export function createTeamKanban(options = {}) {
  const root = node('div', 'tk-kanban');
  const header = node('div', 'tk-header');
  const headerRow = node('div', 'tk-header-row');
  const beta = node('strong', 'tk-beta', t('team_kanban.beta', 'Beta'));
  const headerToggle = node('button', 'tk-header-toggle');
  headerToggle.type = 'button';
  const headerMessage = node('p', 'tk-header-message', t('team_kanban.beta_message', 'Task Manager is in beta. Follow Projects from ideas to done using Tools and the Work Record. We’re making it easier for Agents to keep them current without forcing upkeep.'));
  headerMessage.id = `tk-header-message-${++nextHeaderId}`;
  headerToggle.setAttribute('aria-controls', headerMessage.id);
  headerRow.append(beta, headerToggle);
  header.append(headerRow, headerMessage);
  const setHeaderExpanded = (expanded) => {
    header.dataset.expanded = String(expanded);
    headerToggle.setAttribute('aria-expanded', String(expanded));
    headerToggle.textContent = expanded
      ? t('team_kanban.header_collapse', 'Collapse')
      : t('team_kanban.header_expand', 'Expand');
    headerMessage.hidden = !expanded;
  };
  headerToggle.addEventListener('click', () => setHeaderExpanded(header.dataset.expanded !== 'true'));
  setHeaderExpanded(true);
  const legend = node('div', 'tk-legend');
  for (const [status, label] of [['green', 'ready to move'], ['yellow', 'working'], ['red', 'blocked']]) {
    const item = node('span'); item.append(node('i', `tk-dot ${status}`), document.createTextNode(label)); legend.append(item);
  }
  const notice = node('p', 'tk-notice');
  notice.setAttribute('role', 'status');
  const controls = node('div', 'tk-controls');
  const refreshButton = node('button', 'tk-refresh', '↻');
  refreshButton.type = 'button';
  refreshButton.setAttribute('aria-label', 'Refresh Task Manager');
  const foldButton = node('button', 'tw-agent-density tk-fold');
  foldButton.type = 'button';
  const foldLines = node('span', 'tw-agent-density-lines');
  foldLines.append(node('i'), node('i'));
  foldButton.append(foldLines);
  controls.append(refreshButton, foldButton);
  const topline = node('div', 'tk-topline');
  topline.append(controls, notice, legend);
  const board = node('div', 'tk-board');
  root.append(header, topline, board);

  let team = '';
  let scope = options.scope || {};
  let view = options.view || 'overview';
  let viewKey = String(options.detail?.stage || options.detail?.project || '');
  let projects = [];
  let entered = false;
  let loading = null;
  let seat = null;
  let availability = { available: false, message: KANBAN_NOT_INSTALLED };
  let allOpen = false;
  const asked = new Map(); // id -> { stage, target }; never written to the project record
  let phalanx = null;
  const leadName = (project) => String(options.lead?.(project) || '');
  const holderName = (project) => project.holder === 'lead' ? leadName(project) : project.holder;
  const effectiveScope = () => scope.kind === 'team' && team ? taskManagerScope({ kind: 'team', team }) : taskManagerScope(scope);
  const navigate = (nextView, key = '') => {
    const detail = { scope: effectiveScope(), ...(nextView === 'status' ? { stage: key } : { project: key }) };
    if (nextView !== 'overview' && options.openSurface?.(nextView, detail)) return;
    view = nextView; viewKey = key; render();
  };

  const paintFold = () => {
    foldButton.dataset.lines = allOpen ? 'one' : 'two';
    foldButton.setAttribute('aria-pressed', String(allOpen));
    foldButton.setAttribute('aria-label', allOpen ? 'Show card titles only' : 'Show full cards');
  };

  const render = () => {
    phalanx?.destroy(); phalanx = null;
    board.replaceChildren();
    topline.hidden = !availability.available;
    if (!availability.available) {
      board.append(node('p', 'tk-unavailable', KANBAN_NOT_INSTALLED));
      return;
    }
    if (view === 'project') {
      const project = projects.find((item) => item.id === viewKey);
      const detail = node('article', 'tk-project-detail');
      const back = node('button', 'tk-back', t('team_kanban.back', 'Back to Task Manager')); back.type = 'button'; back.addEventListener('click', () => navigate('overview'));
      detail.append(back);
      if (!project) detail.append(node('p', 'tk-empty', t('team_kanban.project_missing', 'This Project is not in the current scope.')));
      else {
        detail.append(node('h2', '', project.title), node('p', 'tk-project-id', project.id), node('p', 'tk-outcome', project.objective));
        const facts = node('dl', 'tk-project-facts');
        for (const [label, value] of [[t('team_kanban.stage', 'Status'), stageLabel(project.stage)], [t('team_kanban.holder', 'Holder'), `@${holderName(project)}`], [t('team_kanban.progress', 'Progress'), project.status], [t('team_kanban.next', 'Next'), project.exit]]) facts.append(node('dt', '', label), node('dd', '', value));
        detail.append(facts);
        const owner = holderName(project);
        if (owner) {
          const openOwner = node('button', 'tk-owner', t('team_kanban.open_owner', 'Open @{name}', { name: owner }));
          openOwner.type = 'button'; openOwner.addEventListener('click', () => options.openOwner?.(owner)); detail.append(openOwner);
        }
        if (project.evidence.length) detail.append(node('h3', '', t('team_kanban.evidence', 'Evidence')), node('p', 'tk-evidence', project.evidence.join(' · ')));
      }
      board.append(detail); return;
    }
    const shownColumns = view === 'status' ? COLUMNS.filter((column) => column.key === viewKey) : COLUMNS;
    if (view === 'status') {
      const back = node('button', 'tk-back', t('team_kanban.back', 'Back to Task Manager')); back.type = 'button'; back.addEventListener('click', () => navigate('overview')); board.append(back);
    }
    const clearDrag = () => {
      board.classList.remove('dragging');
      for (const group of board.querySelectorAll('[data-sws-group]')) {
        group.classList.remove('means', 'over');
        const hint = group.querySelector('.sws-group-hint'); if (hint) hint.textContent = '';
      }
    };
    const groups = shownColumns.map((column) => ({
      id: column.key, label: column.label, secondary: column.worker,
      empty: t('team_kanban.empty', 'nothing here'),
      action: () => navigate('status', column.key),
      events: {
        dragover: (event) => { event.preventDefault(); event.currentTarget.classList.add('over'); },
        dragleave: (event) => event.currentTarget.classList.remove('over'),
        drop: (event) => {
          event.preventDefault(); clearDrag();
          const project = projects.find((item) => item.id === (event.dataTransfer?.getData('text/plain') || ''));
          if (project && project.stage !== column.key) void sendMove(project, column.key);
        },
      },
    }));
    const items = projects.filter((project) => shownColumns.some((column) => column.key === project.stage)).map((project) => {
      const owner = holderName(project);
      const wait = waitingOn(project);
      const pending = asked.get(project.id);
      if (pending && pending.stage !== project.stage) asked.delete(project.id);
      return {
        id: project.id, group: project.stage, label: project.title, secondary: project.objective,
        state: [owner ? `@${owner}` : '', wait ? `${t('team_kanban.waiting', 'waiting on')} ${wait}` : '', pending?.stage === project.stage ? `${t('team_kanban.asked', 'asked')} @${pending.target}` : ''].filter(Boolean).join(' · '),
        className: `tk-project-stone${project.stage === 'DONE' ? '' : ` tk-project-${project.status}`}`,
        attrs: { 'data-project': project.id },
        draggable: true, action: () => navigate('project', project.id),
        events: {
          dragstart: (event) => {
            event.dataTransfer?.setData('text/plain', project.id); board.classList.add('dragging');
            const targets = definedTargets(project);
            for (const target of board.querySelectorAll('[data-sws-group]')) {
              const defined = targets.has(target.dataset.swsGroup); target.classList.toggle('means', defined);
              const hint = target.querySelector('.sws-group-hint');
              if (hint) hint.textContent = defined ? `drop here: ${meaningLine(moveMessage(project, target.dataset.swsGroup, leadName(project)))}` : '';
            }
          },
          dragend: clearDrag,
        },
      };
    });
    phalanx = createPhalanx({ grouped: { groups }, items, density: allOpen ? 'full' : 'compact', className: 'tk-phalanx' });
    board.append(phalanx.el);
  };

  const sendMove = async (project, toStage) => {
    const move = moveMessage(project, toStage, leadName(project));
    if (!move.target) { notice.textContent = t('team_kanban.no_target', 'This project has no live holder to ask.'); return; }
    notice.textContent = t('team_kanban.sending', 'Sending move request to @{name}…', { name: move.target });
    const result = await request('/api/messages', { method: 'POST', json: { target: move.target, text: move.text } });
    if (!result.ok) {
      notice.textContent = t('team_kanban.send_failed', 'The move request could not be sent.');
      return;
    }
    asked.set(project.id, { stage: project.stage, target: move.target });
    notice.textContent = result.data.delivered
      ? t('team_kanban.delivered', 'Move request delivered to @{name}. The card moves when its record moves.', { name: move.target })
      : t('team_kanban.queued', 'Move request queued for @{name}. The card moves when its record moves.', { name: move.target });
    render();
  };

  const refresh = async () => {
    if (!effectiveScope().teams.length || loading || (seat && seat.hidden)) return loading;
    if (!availability.available) {
      projects = [];
      notice.textContent = availability.message;
      render();
      return;
    }
    const requestedScope = effectiveScope();
    notice.textContent = t('team_kanban.loading', 'Loading Task Manager…');
    loading = Promise.all(requestedScope.teams.map((name) => request(`/api/teams/${encodeURIComponent(name)}/kanban`, { cache: 'no-store' })));
    const results = await loading;
    loading = null;
    if (JSON.stringify(effectiveScope()) !== JSON.stringify(requestedScope)) { if (entered) void refresh(); return; }
    const failures = results.filter((result) => !result.ok);
    if (!failures.length) {
      projects = projectsForScope(results.flatMap((result, index) => (Array.isArray(result.data.projects) ? result.data.projects : [])
        .map((project) => ({ ...project, team: String(result.data.team || requestedScope.teams[index] || '') }))), requestedScope);
      notice.textContent = '';
    } else if (failures.some((result) => result.status === 404)) {
      availability = { available: false, message: KANBAN_CAMPAIGN_OFF };
      projects = [];
      notice.textContent = availability.message;
      options.unavailable?.(availability.message);
    } else {
      notice.textContent = t('team_kanban.failed', 'Could not load Task Manager.');
    }
    render();
  };

  refreshButton.addEventListener('click', () => void refresh());
  foldButton.addEventListener('click', () => {
    allOpen = !allOpen;
    paintFold(); phalanx?.setDensity(allOpen ? 'full' : 'compact');
  });
  paintFold();

  return {
    el: root,
    mount: (host) => { seat = host; },
    enter: () => {
      entered = true;
      void refresh();
    },
    leave: () => { entered = false; },
    destroy: () => { entered = false; phalanx?.destroy(); },
    setTeam: (name) => {
      if (taskManagerScope(scope).kind !== 'team') return;
      const next = String(name || '');
      if (team === next) return;
      team = next; projects = []; asked.clear(); allOpen = false; paintFold(); render();
      if (entered) void refresh();
    },
    setScope: (next) => { scope = next || {}; team = ''; projects = []; if (entered) void refresh(); },
    setAvailability: (next) => {
      availability = next?.available === true
        ? { available: true, message: '' }
        : { available: false, message: String(next?.message || KANBAN_NOT_INSTALLED) };
      if (!availability.available) { projects = []; notice.textContent = availability.message; render(); }
      if (entered && availability.available) void refresh();
    },
    refresh,
  };
}
