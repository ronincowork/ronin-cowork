/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { t } from './lexicon.js';
import { createSurfaceHeader } from './workspace-primitives.js';

const COLUMNS = [
  { key: 'IDEAS', label: 'Ideas', worker: 'lead' },
  { key: 'PLANNING', label: 'Planning', worker: 'Agent with the owner' },
  { key: 'BUILDING', label: 'Building', worker: 'Agent' },
  { key: 'LANDING', label: 'Landing', worker: 'lead, then user' },
  { key: 'DONE', label: 'Done', worker: '' },
];
const INDEX = Object.fromEntries(COLUMNS.map((column, index) => [column.key, index]));
export const KANBAN_NOT_INSTALLED = 'Unavailable.';
export const KANBAN_CAMPAIGN_OFF = 'Unavailable.';

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
  // Task Manager is still beta. Use the Kit's standard surface header so that warning is
  // part of the surface, above every board state, rather than a one-off badge competing
  // with the cards or disappearing when the board rerenders.
  const beta = createSurfaceHeader({
    label: t('team_kanban.beta', 'Beta'),
  });
  beta.el.classList.add('tk-beta');
  beta.el.setAttribute('aria-label', t('team_kanban.beta_label', 'Task Manager beta'));
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
  const foldButton = node('button', 'tk-fold');
  foldButton.type = 'button';
  const foldLines = node('span', 'wk-density-lines');
  foldLines.append(node('i'), node('i'));
  foldButton.append(foldLines);
  controls.append(refreshButton, foldButton);
  const topline = node('div', 'tk-topline');
  topline.append(controls, notice, legend);
  const board = node('div', 'tk-board');
  root.append(beta.el, topline, board);

  let team = '';
  let projects = [];
  let entered = false;
  let loading = null;
  let seat = null;
  let availability = { available: false, message: KANBAN_NOT_INSTALLED };
  let allOpen = false;
  const openCards = new Set();
  const asked = new Map(); // id -> { stage, target }; never written to the project record
  const leadName = () => String(options.lead?.() || '');
  const holderName = (project) => project.holder === 'lead' ? leadName() : project.holder;

  const paintFold = () => {
    foldButton.dataset.lines = allOpen ? 'one' : 'two';
    foldButton.setAttribute('aria-pressed', String(allOpen));
    foldButton.setAttribute('aria-label', allOpen ? 'Show card titles only' : 'Show full cards');
  };

  const render = () => {
    board.replaceChildren();
    topline.hidden = !availability.available;
    if (!availability.available) {
      board.append(node('p', 'tk-unavailable', KANBAN_NOT_INSTALLED));
      return;
    }
    for (const column of COLUMNS) {
      const columnProjects = projects.filter((project) => project.stage === column.key);
      const section = node('section', 'tk-column');
      section.dataset.stage = column.key;
      const heading = node('h3');
      heading.append(node('span', 'tk-column-title', column.label));
      if (column.worker) heading.append(node('span', 'tk-column-worker', column.worker));
      const hint = node('p', 'tk-drop-hint');
      const cards = node('div', 'tk-cards');
      if (!columnProjects.length) cards.append(node('p', 'tk-empty', t('team_kanban.empty', 'nothing here')));
      for (const project of columnProjects) {
        const card = node('article', 'wk-card tk-card');
        card.draggable = true;
        card.dataset.project = project.id;
        const isOpen = allOpen || openCards.has(project.id);
        card.classList.toggle('open', isOpen);
        if (project.stage !== 'DONE') card.dataset.status = project.status;
        const toggle = node('button', 'tk-card-toggle');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.append(node('span', 'wk-card-heading tk-title', project.title));
        card.append(toggle);
        const details = node('div', 'tk-details');
        details.append(node('p', 'wk-card-summary tk-outcome', project.objective));
        if (project.evidence.length) details.append(node('p', 'tk-evidence', project.evidence.join(' · ')));
        const row = node('div', 'wk-card-meta tk-card-row');
        const wait = waitingOn(project);
        if (wait) row.append(node('span', 'tk-waiting', wait));
        const owner = holderName(project);
        if (owner) {
          const open = node('button', 'tk-owner', `@${owner}`);
          open.type = 'button';
          open.addEventListener('click', (event) => { event.stopPropagation(); options.openOwner?.(owner); });
          row.append(open);
        }
        const pending = asked.get(project.id);
        if (pending?.stage === project.stage) row.append(node('span', 'tk-asked', `asked @${pending.target}`));
        else if (pending) asked.delete(project.id);
        card.append(details, row);
        const toggleOpen = () => {
          if (openCards.has(project.id)) openCards.delete(project.id);
          else openCards.add(project.id);
          allOpen = projects.length > 0 && projects.every((item) => openCards.has(item.id));
          paintFold(); render();
        };
        toggle.addEventListener('click', toggleOpen);
        card.addEventListener('click', (event) => {
          if (!event.target.closest('button')) toggleOpen();
        });
        card.addEventListener('dragstart', (event) => {
          event.dataTransfer?.setData('text/plain', project.id);
          card.classList.add('dragging'); board.classList.add('dragging');
          const targets = definedTargets(project);
          for (const target of board.querySelectorAll('.tk-column')) {
            const defined = targets.has(target.dataset.stage);
            target.classList.toggle('means', defined);
            target.querySelector('.tk-drop-hint').textContent = defined
              ? `drop here: ${meaningLine(moveMessage(project, target.dataset.stage, leadName()))}`
              : '';
          }
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('dragging'); board.classList.remove('dragging');
          for (const item of board.querySelectorAll('.tk-column')) {
            item.classList.remove('means', 'over');
            item.querySelector('.tk-drop-hint').textContent = '';
          }
        });
        cards.append(card);
      }
      section.append(heading, hint, cards);
      section.addEventListener('dragover', (event) => { event.preventDefault(); section.classList.add('over'); });
      section.addEventListener('dragleave', () => section.classList.remove('over'));
      section.addEventListener('drop', (event) => {
        event.preventDefault(); section.classList.remove('over');
        const id = event.dataTransfer?.getData('text/plain') || '';
        const project = projects.find((item) => item.id === id);
        if (project && project.stage !== column.key) void sendMove(project, column.key);
      });
      board.append(section);
    }
  };

  const sendMove = async (project, toStage) => {
    const move = moveMessage(project, toStage, leadName());
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
    if (!team || loading || (seat && seat.hidden)) return loading;
    if (!availability.available) {
      projects = [];
      notice.textContent = availability.message;
      render();
      return;
    }
    const requestedTeam = team;
    notice.textContent = t('team_kanban.loading', 'Loading Task Manager…');
    loading = request(`/api/teams/${encodeURIComponent(requestedTeam)}/kanban`, { cache: 'no-store' });
    const result = await loading;
    loading = null;
    if (team !== requestedTeam) { if (entered) void refresh(); return; }
    if (result.ok && Array.isArray(result.data.projects)) {
      projects = result.data.projects.map(normalizedProject);
      notice.textContent = '';
    } else if (result.status === 404) {
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
    openCards.clear();
    if (allOpen) for (const project of projects) openCards.add(project.id);
    paintFold(); render();
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
    destroy: () => { entered = false; },
    setTeam: (name) => {
      const next = String(name || '');
      if (team === next) return;
      team = next; projects = []; asked.clear(); openCards.clear(); allOpen = false; paintFold(); render();
      if (entered) void refresh();
    },
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
