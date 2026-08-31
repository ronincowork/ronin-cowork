/* part of the ronin-cowork client — see js/README.md */
import { fetchSessions } from './api.js';
import { request } from './request.js';
import { showFailure } from './errors.js';

/* ---------- ミ Mika Assist — the way to the house assistant ----------
 *
 * One button, one job: GET ME TO MIKA. If she is up, her tile comes forward. If she is
 * not, she is started and then her tile comes forward. You talk to her in the tile like
 * any other session — there is no dialog here, no question box, no wizard.
 *
 * That is the whole feature on purpose. The thing a confused owner needs is somewhere to
 * ask, not a form that makes them phrase the question before they have one. A modal
 * asking "what do you need?" before she has even said hello is the form problem again,
 * one surface further out.
 *
 * SHE IS A SINGLETON, and the check is right here rather than server-side: two Mikas
 * both editing PROJECT_ROOTS.md is a real bug, and unlike a ladder marker a catalog
 * write is not recomputed next turn. `ronin_bin/mika` makes the same check for the
 * agent-side path — same decision, two callers, and neither can make a second one
 * because the Mika door refuses a name that already exists.
 *
 * Her dedicated server door owns the house-only mechanics: singleton name, install
 * directory, cap exemption, posture and opening. None of those are public launch fields.
 */

const MIKA = 'mika';

/** What she is told when the button starts her and nobody has asked anything yet. */
const OPENED_FROM_BAR =
  'The owner opened you from the header without asking anything yet. ' +
  'Say hello in one line, say what you can do, and wait.';

/**
 * Bring Mika up in `tile`, starting her if she is not running, and optionally hand her a
 * request on the way in.
 *
 * TWO DELIVERY PATHS, for the same reason `ronin_bin/mika` has two: a session that does
 * not exist yet is TOLD its request as the launch brief, which the boot path guarantees
 * (it waits out a trust dialog and re-types until the text is visibly there). A session
 * already up is sent to. Same request either way — she cannot tell how she got it.
 *
 * Returns true if she was started by this call; the caller says so, not us.
 */
export async function askMika(tile, ask) {
  if (!tile) return false;
  let born = false;
  try {
    const live = await request('/api/sessions', { cache: 'no-store' });
    const up = live.ok && Array.isArray(live.data) && live.data.some((s) => s && s.name === MIKA);
    if (!up) {
      const r = await request('/api/mika', {
        method: 'POST',
        json: {
          prompt: ask || OPENED_FROM_BAR,
        },
      });
      // 409 = she appeared between the list and the launch (two taps, two tabs). Not a
      // failure: what was wanted was her tile, and there it is.
      if (!r.ok && r.status !== 409) throw new Error(r.message);
      born = r.ok;
      if (born) void fetchSessions(); // the roster shows her without waiting for a poll
    } else if (ask) {
      await request('/api/sessions/' + encodeURIComponent(MIKA) + '/send', {
        method: 'POST',
        json: { text: ask },
      });
    }
    tile.connect(MIKA);
    return born;
  } catch (e) {
    showFailure('mika', e);
    return false;
  }
}
