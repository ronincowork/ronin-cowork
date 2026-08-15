/* part of the tmux-ronin client — see js/README.md */

/**
 * the commons' ⚙ System pane — what this install is, and the update buttons.
 *
 * TWO MECHANICAL BUTTONS AND NOTHING AUTOMATIC. "Check for updates" is the one
 * moment this client causes an outbound ask (the server asks the release feed —
 * never on a timer, never at boot); "Update to vX" runs the same bin/ronin-update a
 * terminal would. The dial doctrine, applied to the install: show what changed,
 * never act unasked.
 *
 * THE UPDATE'S COMPLETION SIGNAL IS /api/version CHANGING. The updater gates the
 * candidate, swaps a symlink and restarts the operator (docs/release.md); this page
 * simply polls until a new release string answers — the restart drops the poll for a
 * few seconds and that is the swap happening, not a failure. Sessions live in a unit
 * the update never touches.
 *
 * On a CHECKOUT (release:null) the run button stays off: a source tree is updated by
 * git, not by unpacking a release over it — the readout says so instead of guessing.
 */
export function buildSystem(pane) {
  const wrap = document.createElement('div');
  wrap.className = 'sys';

  const idBlock = document.createElement('div');
  idBlock.className = 'sys-id';

  const row = document.createElement('div');
  row.className = 'sys-actions';
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.textContent = 'Check for updates';
  checkBtn.title = 'Ask the release feed what the latest version is (only when pressed)';
  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'sys-run';
  runBtn.textContent = 'Update';
  runBtn.disabled = true;
  runBtn.hidden = true;
  row.append(checkBtn, runBtn);

  const msg = document.createElement('div');
  msg.className = 'sys-msg';

  wrap.append(idBlock, row, msg);
  pane.appendChild(wrap);

  let version = null; // the operator's /api/version answer, fetched on enter
  let latest = null;

  const say = (text, bad) => {
    msg.textContent = text || '';
    msg.classList.toggle('bad', !!bad);
  };

  const renderId = () => {
    idBlock.innerHTML = '';
    const name = document.createElement('div');
    name.className = 'sys-release';
    const detail = document.createElement('small');
    if (!version) {
      name.textContent = 'unreachable';
      detail.textContent = 'the operator did not answer /api/version';
    } else if (version.release) {
      name.textContent = version.release;
      detail.textContent = `release · built from ${version.commit} · contract ${version.contract} · started ${version.startedAt}`;
    } else {
      name.textContent = version.commit + (version.dirty ? ' (dirty)' : '');
      detail.textContent = `a dev checkout, not a release — updated by git, not by the button · started ${version.startedAt}`;
    }
    idBlock.append(name, detail);
  };

  const check = async () => {
    checkBtn.disabled = true;
    say('asking the release feed…');
    try {
      const r = await fetch('/api/update/check');
      if (r.status === 404) throw new Error('this operator predates the updater — its next restart carries the routes');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      latest = d.latest;
      if (!d.latest) {
        say('the feed named no release yet (a private repo needs gh auth on the host)');
      } else if (d.upToDate) {
        say(`✓ up to date — ${d.installed} is the latest release`);
      } else if (version && !version.release) {
        say(`latest release is ${d.latest} — this box runs a checkout, so the button stays off`);
      } else {
        runBtn.textContent = `Update to ${d.latest}`;
        runBtn.hidden = false;
        runBtn.disabled = false;
        say(`${d.latest} is available (installed: ${d.installed || 'none'})`);
      }
    } catch (e) {
      say(e.message, true);
    }
    checkBtn.disabled = false;
  };

  /** After /run: the new operator answering a different release IS completion. */
  const watch = async () => {
    const was = version?.release;
    for (let i = 0; i < 100; i++) {
      await new Promise((ok) => setTimeout(ok, 3000));
      try {
        const v = await (await fetch('/api/version', { cache: 'no-store' })).json();
        if (v.release && v.release !== was) {
          say(`✓ updated to ${v.release} — reloading`);
          setTimeout(() => location.reload(), 1200);
          return;
        }
      } catch (_) {
        /* the restart itself — keep polling */
      }
    }
    say('no new version answered after 5 minutes — journalctl --user -u "ronin-update-*" has the transcript', true);
    runBtn.disabled = false;
  };

  const run = async () => {
    runBtn.disabled = true;
    checkBtn.disabled = true;
    say(`updating to ${latest} — fetch, verify, gate the candidate, swap. The page blinks at the swap; sessions are untouched…`);
    try {
      const r = await fetch('/api/update/run', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      watch();
    } catch (e) {
      say(e.message, true);
      runBtn.disabled = false;
    }
    checkBtn.disabled = false;
  };

  checkBtn.addEventListener('click', check);
  runBtn.addEventListener('click', run);

  const enter = async () => {
    try {
      version = await (await fetch('/api/version', { cache: 'no-store' })).json();
    } catch (_) {
      version = null;
    }
    renderId();
  };

  return { enter };
}
