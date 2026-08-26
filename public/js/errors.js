/* part of the ronin-cowork client — see js/README.md */
import { t } from './lexicon.js';


export let failBar = null;
export const failSeen = new Set();

/** Put a failure on screen. Nothing here may throw — it is the last line of defence. */
export function showFailure(where, err) {
  try {
    const msg = err && err.message ? err.message : String(err);
    console.error(`[ronin] ${where}: ${msg}`, err);
    const key = where + '|' + msg;
    if (failSeen.has(key)) return; // a repainting error must not spam a wall of text
    failSeen.add(key);
    if (!failBar) {
      failBar = document.createElement('div');
      failBar.id = 'failbar';
      // Do NOT promise "the rest of the page still works". It said that while the panes
      // were gone, which is worse than saying nothing: a wrong reassurance costs the
      // reader the one thing they came for. Say what is known and what to try.
      failBar.replaceChildren(Object.assign(document.createElement('span'), {
        className: 'failbar-title',
        textContent: t('errors.title', '⚠ Ronin hit an error. The top bar still works — a pane may not. Reload; if it persists the cause is below.'),
      }));
      const x = document.createElement('button');
      x.className = 'failbar-x';
      x.textContent = '✕';
      x.title = t('errors.dismiss', 'Dismiss');
      x.addEventListener('click', () => failBar.remove());
      failBar.appendChild(x);
      // FIRST child, in normal flow: the page shifts down and the top bar stays
      // reachable. An overlay would hide the controls that still work.
      const host = document.body || document.documentElement;
      host.insertBefore(failBar, host.firstChild);
    }
    const line = document.createElement('div');
    line.className = 'failbar-line';
    line.textContent = `${where}: ${msg}`;
    failBar.appendChild(line);

    /**
     * WHERE it happened, not just what. A message alone is not actionable — "Cannot read
     * properties of undefined (reading 'lockEl')" was reported by a user as a useless
     * error, correctly: it names no file, no line and no call path, so the first move is
     * still a hunt. The top frames of the stack answer it in one glance.
     *
     * Kept to three frames: enough to see the call path, short enough that the banner
     * stays a banner. `err.stack` is absent for a thrown string, hence the guard.
     */
    const frames = String(err?.stack || '')
      .split('\n')
      .slice(1) // line 0 repeats the message
      .map((s) => s.trim().replace(/^at\s+/, ''))
      .filter(Boolean)
      .slice(0, 3);
    if (frames.length) {
      const at = document.createElement('div');
      at.className = 'failbar-at';
      at.textContent = frames.map((f) => '↳ ' + f).join('\n');
      failBar.appendChild(at);
    }
  } catch (_) {
    /* if even this fails, the console.error above is all we get */
  }
}

/** Run fn; on a throw, show it and return fallback instead of taking the page down. */
export function guard(where, fn, fallback) {
  try {
    return fn();
  } catch (e) {
    showFailure(where, e);
    return fallback;
  }
}

/**
 * Anything that escapes a guard still becomes visible rather than silent.
 *
 * An ErrorEvent does not always carry `.error` (no stack then), but it does carry
 * filename/lineno — so synthesise the location rather than reporting a bare message. An
 * error with no "where" sends the next person hunting, which is the complaint this
 * addresses.
 */
/**
 * Benign browser noise that arrives as an `error` event and is not a fault in this app.
 *
 * "ResizeObserver loop completed with undelivered notifications" fires when observers are
 * still settling at the end of a frame — xterm's FitAddon triggers it whenever four tiles
 * resize at once. It is harmless, it has no stack, and putting it in the banner would
 * train the reader to ignore the banner, which costs us the one channel that works.
 */
const BENIGN = [/ResizeObserver loop/i];

window.addEventListener('error', (e) => {
  if (BENIGN.some((re) => re.test(e.message || ''))) return;
  const err = e.error;
  const at = e.filename ? `${String(e.filename).replace(/^.*\//, '')}:${e.lineno}:${e.colno}` : '';
  if (err instanceof Error) showFailure(at ? `uncaught error at ${at}` : 'uncaught error', err);
  else showFailure(at ? `uncaught error at ${at}` : 'uncaught error', e.message);
});
window.addEventListener('unhandledrejection', (e) => showFailure('unhandled promise', e.reason));

/** Placeholder for a tile that failed to build, so the grid keeps its shape. */
export function deadTile(i, err) {
  const el = document.createElement('section');
  el.className = 'tile tile-dead';
  el.innerHTML =
    `<div class="tile-head"><span class="dot off"></span><span class="grow"></span></div>` +
    `<div class="tile-body"><div class="dead-note">tile ${i + 1} failed to build` +
    `<br><span class="dead-why"></span></div></div>`;
  el.querySelector('.dead-why').textContent = err && err.message ? err.message : String(err);
  return el;
}

/* ---------- persistence ---------- */
