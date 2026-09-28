/* Work Items: Project stones and their reading inside the standard Phalanx. */
import { WorkspaceKit } from './workspace-kit.js';
import { createPhalanx } from './phalanx.js';
import { appendProjectReading } from './project-reading.js';
import { PROJECT_STAGES, taskManagerScope, projectsForScope, kanbanAvailability, definedTargets, holderOf, moveMessage, waitingOn } from './team-kanban.js';
import { subscribe } from './team-controller.js';
import { request } from './request.js';
import { t } from './lexicon.js';

export const WORK_ITEMS_TYPE = 'work-items';
const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag); out.className = cls; out.textContent = text; return out;
};

export function createWorkItemsSurface(options = {}) {
  const { createSurface, createAction, createActionBar } = WorkspaceKit.primitives;
  let projects = [], entered = false, read = null, full = false;
  const asked = new Map();
  const holder = (project) => holderOf(project, options.lead?.(project) || '');
  const refreshAction = createAction({ label: t('work_items.refresh', 'Refresh Work Items'), action: () => void refresh() });
  const density = createAction({ label: t('work_items.details', 'Show stone details'), selected: false, action: () => {
    full = !full;
    density.el.setAttribute('aria-pressed', String(full));
    phalanx.setDensity(full ? 'full' : 'compact');
  } });
  const surface = createSurface({ label: t('work_items.title', 'Work Items'), className: 'work-items-surface', actions: [refreshAction, density] });
  const notice = el('p', 'wi-notice'); notice.setAttribute('role', 'status');

  const clearDrag = () => {
    for (const group of phalanx.el.querySelectorAll('[data-sws-group]')) {
      group.classList.remove('means', 'over');
      group.querySelector('.sws-group-hint').textContent = '';
    }
  };
  const sendMove = async (project, stage) => {
    const move = moveMessage(project, stage, options.lead?.(project) || '');
    if (!move.target) { notice.textContent = t('team_kanban.no_target', 'This project has no live holder to ask.'); return; }
    notice.textContent = t('team_kanban.sending', 'Sending move request to @{name}…', { name: move.target });
    const result = await request('/api/messages', { method: 'POST', json: { target: move.target, text: move.text } });
    if (!result.ok) { notice.textContent = t('team_kanban.send_failed', 'The move request could not be sent.'); return; }
    asked.set(project.id, { stage: project.stage, target: move.target });
    notice.textContent = result.data.delivered
      ? t('team_kanban.delivered', 'Move request delivered to @{name}. The card moves when its record moves.', { name: move.target })
      : t('team_kanban.queued', 'Move request queued for @{name}. The card moves when its record moves.', { name: move.target });
    paint();
  };
  const groups = PROJECT_STAGES.map((stage) => ({
    id: stage.key, label: stage.label, secondary: stage.worker,
    empty: t('team_kanban.empty', 'nothing here'),
    events: {
      dragover: (event) => { event.preventDefault(); event.currentTarget.classList.add('over'); },
      dragleave: (event) => event.currentTarget.classList.remove('over'),
      drop: (event) => {
        event.preventDefault(); clearDrag();
        const project = projects.find((item) => item.id === event.dataTransfer?.getData('text/plain'));
        if (project && project.stage !== stage.key) void sendMove(project, stage.key);
      },
    },
  }));
  const phalanx = createPhalanx({ grouped: { groups }, density: 'compact', className: 'wi-phalanx', renderDetail: (item, host) => {
    const project = item.project;
    appendProjectReading(host, project, { holder: holder(project), stage: PROJECT_STAGES.find((stage) => stage.key === project.stage).label });
    const owner = holder(project);
    if (owner) host.append(createActionBar({ actions: [createAction({
      label: t('team_kanban.open_owner', 'Open @{name}', { name: owner }), action: () => options.openOwner?.(owner),
    })] }).el);
  } });
  phalanx.mount(surface.content, { after: [notice] });
  const paint = () => phalanx.setItems(projects.map((project) => {
    const pending = asked.get(project.id);
    if (pending && pending.stage !== project.stage) asked.delete(project.id);
    const wait = waitingOn(project), owner = holder(project);
    return {
      id: project.id, group: project.stage, project, label: project.title, secondary: project.objective,
      state: [owner ? `@${owner}` : '', wait ? `${t('team_kanban.waiting', 'waiting on')} ${wait}` : '', pending?.stage === project.stage ? `${t('team_kanban.asked', 'asked')} @${pending.target}` : ''].filter(Boolean).join(' · '),
      className: project.stage === 'DONE' ? '' : `wi-project-${project.status}`,
      attrs: { 'data-project': project.id }, draggable: true,
      events: {
        dragstart: (event) => {
          event.dataTransfer?.setData('text/plain', project.id);
          const targets = definedTargets(project);
          for (const group of phalanx.el.querySelectorAll('[data-sws-group]')) {
            const defined = targets.has(group.dataset.swsGroup); group.classList.toggle('means', defined);
            const meaning = defined ? moveMessage(project, group.dataset.swsGroup, options.lead?.(project) || '').text.split('meaning: ')[1]?.split('\n')[0] || '' : '';
            group.querySelector('.sws-group-hint').textContent = meaning;
          }
        },
        dragend: clearDrag,
      },
    };
  }));
  async function refresh() {
    read?.abort();
    const controller = new AbortController(); read = controller;
    const scope = taskManagerScope(options.scope());
    notice.textContent = t('work_items.loading', 'Loading Work Items…');
    const [installed, ...results] = await Promise.all([
      request('/api/installed', { cache: 'no-store', signal: controller.signal }),
      ...scope.teams.map((team) => request(`/api/work-items?team=${encodeURIComponent(team)}`, { cache: 'no-store', signal: controller.signal })),
    ]);
    if (controller.signal.aborted) return;
    if (!installed.ok || results.some((result) => !result.ok)) {
      notice.textContent = t('work_items.failed', 'Could not load Work Items.'); return;
    }
    const availability = kanbanAvailability(installed.data);
    if (!availability.available) { projects = []; paint(); notice.textContent = availability.message; return; }
    projects = projectsForScope(results.flatMap((result, index) => (result.data.items || []).map((project) => ({ ...project, team: result.data.team || scope.teams[index] }))), scope);
    paint(); notice.textContent = '';
  }
  const stop = subscribe(() => { if (entered) void refresh(); });
  return {
    el: surface.el,
    show: () => { entered = true; void refresh(); },
    leave: () => { entered = false; read?.abort(); },
    destroy: () => { entered = false; read?.abort(); stop(); phalanx.destroy(); },
  };
}
