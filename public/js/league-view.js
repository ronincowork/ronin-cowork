/* part of the ronin-cowork client — see js/README.md
 *
 * LEAGUE — the destination. Every Team on this box, and the way into one.
 *
 * IT OWNS ITS OWN ELEMENT AND ITS OWN STYLESHEET, so registering it costs the shell
 * nothing but two lines in js/main.js: the Kit's register() takes the element from the
 * view, and the stylesheet is linked once from here. Nothing in the frozen Kit and
 * nothing in the global sheet is touched.
 *
 * WHAT THIS SLICE DOES NOT DO, by instruction: no membership drag/drop and no
 * membership write. Bubbles are read-only. The Team controller owns refresh and
 * projection; League calls it at the view boundary and subscribes only to repaint.
 */
import { createBoard } from './league-board.js';
import { sessionsHandlers } from './events.js';
import { refreshTeams, subscribe } from './team-controller.js';

export function createLeagueView() {
  const host = document.createElement('main');
  host.id = 'league';
  let board = null;
  let unsubscribe = () => {};
  let entered = false;
  let clock = 0;
  // THE BOARD STAYS CURRENT WHILE IT IS UP. It refreshed on enter only, so a tab left on
  // League drew a team's roster as "Not recorded" long after one was written (owner,
  // 2026-08-26: "why don't I see it on the league page?"). Membership rides the sessions
  // feed; a roster write rides no feed, so a slow clock covers it.
  const refresh = async (context) => {
    if (!entered) return;
    await refreshTeams();
    if (entered) draw(context);
  };
  const onSessions = () => void refresh(lastContext);
  let lastContext = null;

  /** Null is the default and a real answer: rosters start shown. */
  const visible = (context) => context?.viewState?.('league')?.rostersVisible !== false;

  const draw = (context) => {
    if (!board) return;
    board.render(visible(context));
  };

  return {
    el: host,
    title: () => 'League',

    mount(_viewhost, context) {
      board = createBoard({
        context,
        rostersVisible: visible(context),
      });
      host.append(board.el);
      // Controller notifications are repaint signals only. Refresh ownership stays at
      // the view boundary below; a subscription never fetches or opens another socket.
      unsubscribe = subscribe(() => draw(context));
      sessionsHandlers.add(onSessions);
      // ONE delegated handler for the whole board, wired at mount and never at enter,
      // so repeated navigation cannot multiply listeners.
      host.addEventListener('click', (event) => {
        if (!event.target.closest('[data-league-rosters]')) return;
        const next = !visible(context);
        context.patchViewState('league', { rostersVisible: next });
        board.render(next);
      });
    },

    async enter(context) {
      entered = true;
      lastContext = context;
      draw(context);
      // The durable half and the live half, then one redraw. A failed fetch keeps the
      // last good board and says so through the Surface's stale state.
      await refreshTeams();
      draw(context);
      window.clearInterval(clock);
      clock = window.setInterval(() => void refresh(context), 15000);
    },

    leave() {
      entered = false;
      window.clearInterval(clock);
    },

    destroy() {
      entered = false;
      window.clearInterval(clock);
      sessionsHandlers.delete(onSessions);
      unsubscribe();
      unsubscribe = () => {};
      host.replaceChildren();
      board = null;
    },
  };
}
