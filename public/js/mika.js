/* part of the ronin-cowork client — see js/README.md */
import { fetchSessions } from './api.js';
import { request } from './request.js';
import { showFailure } from './errors.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createWarmTerminalPool } from './team-terminal-pool.js';
import { mikaShowHandlers } from './events.js';

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

const MIKA = 'mika_agent';

/* ---------- which browser tab — the id wheres_waldo and show address ----------
 * One id per browser tab, minted once and kept in sessionStorage so a reload keeps it.
 * Help reports this tab's view under it; Mika is told the id at birth. */
const TAB_KEY = 'ronin-mika-tab';
export function mikaTab() {
  try {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
  } catch (_) {
    return `tab-${Math.random().toString(16).slice(2, 14)}`;
  }
}

/** What this tab shows, for `wheres_waldo`: best effort, never blocking Help. */
export async function reportMikaView(view) {
  if (!view) return;
  try { await request(`/api/mika/context/${encodeURIComponent(mikaTab())}`, { method: 'PUT', json: { view } }); } catch (_) { /* Help does not wait on it */ }
}

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

/* ---------- ミ Help — Mika takes over the selector column ----------
 *
 * One panel, one implementation, used by every workbench that has a selector: the cards
 * step aside, Mika's ordinary tile is BORROWED into the column (no second viewer, no
 * placement change in any workspace), and Close hands the tile back and shows the cards
 * again. The greeting is painted by the page so the column is never blank while the
 * server reports her as starting.
 *
 * `ready()` is the caller's readiness check (it returns truthy when she may be shown),
 * `borrow()` returns her tile's element, `release()` gives it back.
 */
export function createMikaHelpPanel({ selector, header, refreshHeader, createAction, t, ready, borrow, release, helpButton, view, place }) {
  const cards = selector?.querySelector('.wk-workbench-selector-cards') || null;
  // The column is hers alone: no bar, no greeting, and the borrowed tile's head and
  // composer are hidden by the panel's own CSS. The selector HEADER carries the
  // conversation's title and its Close, where ミ Help was (owner, 2026-09-09).
  const panel = document.createElement('section');
  panel.className = 'setup-mika-panel';
  panel.hidden = true;
  const stage = document.createElement('div');
  stage.className = 'setup-mika-stage';
  const loading = document.createElement('p');
  loading.className = 'setup-mika-loading';
  panel.append(stage);
  selector?.append(panel);
  const close = createAction({ label: t('mika.close', 'Close'), size: 'compact' });
  close.el.hidden = true;
  header?.actions?.append(close.el);
  let open = false;
  const closeHelp = () => {
    if (!open) return;
    open = false;
    release();
    panel.hidden = true;
    if (cards) cards.hidden = false;
    close.el.hidden = true;
    if (helpButton) helpButton.hidden = false;
    refreshHeader?.(); // the roster's own title comes back
    helpButton?.focus();
  };
  const openHelp = async () => {
    if (open) return;
    open = true;
    if (cards) cards.hidden = true;
    panel.hidden = false;
    if (header?.title) header.title.textContent = t('mika.header', 'Mika, your helpful assistant');
    if (helpButton) helpButton.hidden = true;
    close.el.hidden = false;
    loading.textContent = t('mika.starting', '人 Starting Mika…');
    stage.replaceChildren(loading);
    if (view) void reportMikaView(view());
    let ok = false;
    try { ok = await ready(); } catch (_) { ok = false; }
    if (!open) return; // closed while she was starting
    // A roster repaint while she started may have restored the roster's own title.
    if (header?.title) header.title.textContent = t('mika.header', 'Mika, your helpful assistant');
    if (!ok) { loading.textContent = t('mika.start_refused', 'Mika couldn’t start. Try again.'); return; }
    const host = borrow();
    if (host) stage.replaceChildren(host);
    else loading.textContent = t('mika.start_refused', 'Mika couldn’t start. Try again.');
  };
  close.el.addEventListener('click', closeHelp);
  panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeHelp(); });
  // `show <tab> <surface>` from Mika: the operator names the workspace; only this tab answers.
  const onShow = (m) => { if (place && m.tab === mikaTab() && m.surface) place(m.workspace, m.surface); };
  mikaShowHandlers.add(onShow);
  return { el: panel, open: openHelp, close: closeHelp, isOpen: () => open, destroy: () => { mikaShowHandlers.delete(onShow); close.el.remove(); } };
}

/** Mika's one ordinary tile on a workbench that has no team pools (Setup): a surface and a
 *  one-stream warm pool over the shared terminal tile host. Help borrows from it and the
 *  Mika card shows it as a normal Workspace tile. */
export function createMikaTilePool() {
  const surface = WorkspaceKit.primitives.createSurface({ label: 'Mika', className: 'tw-terminal', flush: true, header: false });
  const pool = createWarmTerminalPool({
    createHost: (options) => WorkspaceKit.adapters.createTerminalTileHost(options), container: surface.content, streamCap: 1,
  });
  return { surface, pool };
}
