/* part of the tmux-ronin client — see js/README.md */
import { fetchSessions } from './api.js';
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
 * because /api/launch refuses a name that already exists.
 *
 * NO NEW ENDPOINT. She is born through /api/launch like every session, and the
 * `MikaAssist` entry in SESSION_JOBS.md carries her dial, posture and opening. The only
 * thing about her the server knows is `cap: exempt` in that catalog — she is started
 * even at the session max, because blocking somebody who is asking for help is rude.
 */

const MIKA = 'mika';

/** What she is told when the button starts her and nobody has asked anything yet. */
const OPENED_FROM_BAR =
  'The owner opened you from the header without asking anything yet. ' +
  'Say hello in one line, say what you can do, and wait.';

/**
 * Bring Mika up in `tile`, starting her if she is not running.
 * Returns true if she was started by this call — the caller says so, not us.
 */
export async function askMika(tile) {
  if (!tile) return false;
  let born = false;
  try {
    const live = await fetch('/api/sessions', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : []));
    if (!Array.isArray(live) || !live.some((s) => s && s.name === MIKA)) {
      const r = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_job: 'MikaAssist',
          name: MIKA,
          mode: 'assisted',
          tags: [MIKA],
          prompt: OPENED_FROM_BAR,
        }),
      });
      const d = await r.json().catch(() => ({}));
      // 409 = she appeared between the list and the launch (two taps, two tabs). That is
      // not a failure: what was wanted was her tile, and there it is.
      if (!r.ok && r.status !== 409) throw new Error(d.error || r.statusText);
      born = r.ok;
      if (born) void fetchSessions(); // the roster should show her without waiting for a poll
    }
    tile.connect(MIKA);
    return born;
  } catch (e) {
    showFailure('mika', e);
    return false;
  }
}
