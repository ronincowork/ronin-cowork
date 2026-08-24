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
import { refreshTeams, subscribe } from './team-controller.js';

const STYLE_ID = 'league-css';

/** Link the feature sheet once. League owns its own CSS; the global sheet is not edited. */
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = 'css/league.css'; // relative, so this page also works under /staging/
  document.head.append(link);
}

export function createLeagueView() {
  const host = document.createElement('main');
  host.id = 'league';
  let board = null;
  let unsubscribe = () => {};

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
      ensureStyle();
      board = createBoard({
        context,
        rostersVisible: visible(context),
      });
      host.append(board.el);
      // Controller notifications are repaint signals only. Refresh ownership stays at
      // the view boundary below; a subscription never fetches or opens another socket.
      unsubscribe = subscribe(() => draw(context));
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
      draw(context);
      // The durable half and the live half, then one redraw. A failed fetch keeps the
      // last good board and says so through the Surface's stale state.
      await refreshTeams();
      draw(context);
    },

    destroy() {
      unsubscribe();
      unsubscribe = () => {};
      host.replaceChildren();
      board = null;
    },
  };
}
