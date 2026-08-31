/* part of the ronin-cowork client — see js/README.md */
/**
 * LAUNCH — ONE workbench that makes either a Team or an Agent, walked a step at a time.
 *
 * Reached from the root page, and that is who it is for (owner, 2026-08-31: "this is
 * really only accessed from the root page, so this is sort of for the first-time
 * experience. People can kind of play with it, see what they can do."). So it is the LONG
 * form on purpose: every step visible, the consequences of each shown as you go. The fast
 * path lives where the fast loaders already are — the Coworks bench and Add Agent.
 *
 * THREE THINGS THE OWNER ASKED FOR, and they are the whole layout:
 *   · the selector sits on the LEFT, not marooned in the middle with one dead card;
 *   · it holds the FORM'S STEPS — "new session, name and model, instruction, team, blah
 *     blah blah… you could sort of click between steps" — each row carrying that step's
 *     current answer, so the column is the walk and the progress at once;
 *   · WORKSPACE 2 IS THE OUTPUT: the reading that used to sit under the form comes out
 *     from the bottom of workspace 1 and gets a workspace of its own.
 *
 * HOW ONE FORM SERVES MANY CARDS. Every step offer carries the step's key as its resource
 * but resolves to the SAME view, because `create` caches per workspace and hands the same
 * node back. The Workbench then marks exactly one card selected — the step whose key is on
 * the placed node — which is how the outline shows where you are without a second
 * mechanism. Placing a step scrolls the form to it rather than replacing anything.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createNewTeamFormView } from './new-team-form.js';
import { createNewAgentView } from './new-agent.js';
import { refreshTeams } from './team-controller.js';
import { t } from './lexicon.js';

const PROFILE = 'launch';
const TYPES = Object.freeze({ team: 'launch.team', agent: 'launch.agent', born: 'launch.born' });
const MODE_OF = Object.freeze({ [TYPES.team]: 'team', [TYPES.agent]: 'agent' });
const TYPE_OF = Object.freeze({ team: TYPES.team, agent: TYPES.agent });
const node = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

function registerLaunchSurfaces() {
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  // `visible` is read on every refreshSelector, so the toggle governs the selector by
  // answering from the environment rather than by redefining the profile — a profile is
  // frozen once defined, and the mode is a view's state, not the profile's.
  const form = (type, mode, label) => add({
    type,
    header: 'surface',
    label: () => label(),
    visible: (_tenant, environment) => environment.mode() === mode,
    discover: (_tenant, environment) => environment.outline(mode),
    create: ({ environment, workspace }) => environment.form(mode, workspace),
  });
  form(TYPES.team, 'team', () => t('launch.new_team', 'New Team'));
  form(TYPES.agent, 'agent', () => t('launch.new_agent', 'New Agent'));
  add({
    type: TYPES.born,
    header: 'surface',
    label: () => t('launch.born', 'Will be born'),
    summary: () => t('launch.born_summary', 'What the answers above add up to.'),
    variant: 'dotted',
    create: ({ environment, workspace }) => environment.born(workspace),
  });
  profiles.define(PROFILE, [TYPES.team, TYPES.agent, TYPES.born]);
}

export function createLaunchView() {
  registerLaunchSurfaces();
  const { createSurface, createAction } = WorkspaceKit.primitives;
  let ctx = null;
  let bench = null;
  let mode = 'agent';
  const views = { team: {}, agent: {} };   // one form per mode per workspace
  const started = new Set();               // which of those have loaded their catalogs
  const bornSeats = {};                    // one output surface per workspace
  let detach = null;                       // the active form's hold on the output

  const viewOf = (which, workspace) => {
    if (!views[which][workspace]) {
      // `born: false` — the reading is a workspace of its own here, not a form footer.
      views[which][workspace] = which === 'team'
        ? createNewTeamFormView(WorkspaceKit, {
          born: false,
          created: async (name) => { await refreshTeams(); ctx?.navigate('team', { param: name }); },
        })
        : createNewAgentView(WorkspaceKit, { born: false });
      views[which][workspace].watch(() => bench?.refreshSelector());
    }
    return views[which][workspace];
  };
  const activeView = () => {
    const seat = bench?.locations(TYPE_OF[mode])[0];
    return seat ? viewOf(mode, seat) : null;
  };
  /** Point the output at whichever form is on the bench now. */
  const rebind = () => {
    const view = activeView();
    const host = Object.values(bornSeats)[0]?.host;
    detach?.();
    detach = view && host ? view.attachBorn(host) : null;
  };

  const environment = {
    mode: () => mode,
    outline: (which) => {
      const seat = bench?.locations(TYPE_OF[which])[0];
      const view = seat ? views[which][seat] : null;
      const rows = view?.outline?.() || [];
      // Before the form is on the bench there is nothing to enumerate: offer the one card
      // that puts it there, and the steps appear the moment it lands.
      if (!rows.length) return [{ label: which === 'team' ? t('launch.new_team', 'New Team') : t('launch.new_agent', 'New Agent'), summary: which === 'team' ? t('launch.new_team_summary', 'Define a Team, then launch its Agents.') : t('launch.new_agent_summary', 'Start an Agent in a Team or on its own.'), key: '' }];
      // AN OUTLINE ROW IS NOT A CARD MENU. The Workbench places a card into whichever
      // workspace is selected, which for a table of contents means clicking step 5 opens
      // a SECOND form on top of the output. Aiming the selection at the form's own seat
      // on hover turns the click into what it should be: scroll the form where it is.
      // `show` below catches the keyboard path, which never sends a pointer event.
      return rows.map((row) => ({
        key: row.key,
        label: `${row.n}. ${row.label}`,
        summary: row.meta || '',
        onPointerEnter: () => { if (seat) bench.select(seat); },
      }));
    },
    form: (which, workspace) => {
      const view = viewOf(which, workspace);
      return {
        el: view.el,
        show: (detail = {}) => {
          const seats = bench.locations(TYPE_OF[which]);
          const home = seats.find((id) => id !== workspace);
          if (seats.length > 1 && home) {
            // The form landed on a seat it should not have taken (keyboard activation, or
            // a drag onto the output). Give that seat back and do what the row meant.
            bench.place(TYPES.born, workspace);
            bench.place(TYPE_OF[which], home, detail.key ? { key: detail.key } : {});
            return;
          }
          if (!started.has(view)) { started.add(view); void view.enter(); }
          rebind();
          if (detail.key) view.focus(detail.key);
        },
      };
    },
    born: (workspace) => {
      if (!bornSeats[workspace]) {
        const surface = createSurface({ label: t('launch.born', 'Will be born'), className: 'ntf-surface' });
        const host = node('div', 'ntf-foot');
        surface.content.append(host);
        bornSeats[workspace] = { el: surface.el, host };
      }
      return { el: bornSeats[workspace].el, show: () => rebind() };
    },
  };

  const modeAction = (key, label) => createAction({ label, kind: 'quiet', size: 'compact', selected: mode === key, action: () => setMode(key) });
  const teamButton = modeAction('team', t('launch.mode_team', 'Team'));
  const agentButton = modeAction('agent', t('launch.mode_agent', 'Agent'));
  const paintMode = () => {
    teamButton.el.setAttribute('aria-pressed', String(mode === 'team'));
    agentButton.el.setAttribute('aria-pressed', String(mode === 'agent'));
  };
  function setMode(next) {
    if (next === mode || !TYPE_OF[next]) return;
    const leaving = TYPE_OF[mode];
    mode = next;
    paintMode();
    // Every workspace showing the form we toggled away from shows the other one instead.
    for (const id of bench.locations(leaving)) bench.place(TYPE_OF[mode], id);
    rebind();
    bench.refreshSelector();
    save();
  }

  const blank = (id) => {
    const surface = createSurface({ label: id.replace('workspace', 'Workspace '), className: 'lv-blank' });
    surface.content.append(node('p', 'cv-blank-word', t('team.workspace_blank', 'Workspace')));
    return surface.el;
  };
  const save = () => ctx?.patchViewState('launch', { ...bench.snapshot(), mode });
  bench = WorkspaceKit.workbench.create({
    profile: PROFILE,
    tenant: { kind: 'launch' },
    environment,
    defaultNode: blank,
    label: t('campaign_home.launch', 'Launch'),
    title: () => t('campaign_home.launch', 'Launch'),
    actions: [teamButton, agentButton],
    shapeControl: document.getElementById('shapecycle'),
    onStateChange: save,
    onPlacement: save,
  });

  return {
    el: bench.host,
    glyph: '＋',
    arrangement: bench.arrangement,
    title: () => t('campaign_home.launch', 'Launch'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      const stored = context.viewState('launch') || {};
      if (stored.mode === 'team' || stored.mode === 'agent') mode = stored.mode;
      paintMode();
      bench.enter(stored);
      await refreshTeams();
      let placed = false;
      for (const [workspace, held] of Object.entries(stored.seats || {})) {
        const type = typeof held === 'object' ? held.type : held;
        if (!Object.values(TYPES).includes(type)) continue;
        if (MODE_OF[type]) mode = MODE_OF[type];   // the bench comes back as it was left
        bench.place(type, workspace, typeof held === 'object' && held.key ? { key: held.key } : {});
        placed = true;
      }
      // THE OPENING ARRANGEMENT: the walk on the left, the form beside it, the output in
      // workspace 2 — the shape the owner asked for, made without him having to build it.
      if (!placed) {
        bench.place(TYPE_OF[mode], 'workspace1');
        bench.place(TYPES.born, 'workspace2');
      }
      if (!stored.arrangement) bench.arrangement.move('selector', 0);
      paintMode();
      rebind();
      bench.refreshSelector();
      save();
    },
    leave: () => bench.leave(),
    destroy: () => { detach?.(); bench.leave(); ctx = null; },
  };
}
