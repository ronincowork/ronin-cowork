/* part of the tmux-ronin client — see js/README.md */
import { request } from './request.js';
import { status } from './ui.js';
import { currentTheme, setTheme } from './theme.js';

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

  const msg = status('sys-msg');

  // LOG OUT — only drawn when a login exists (/api/health `login`), because a button
  // that answers "you were never logged in" is furniture. Clearing the cookie sends
  // the next navigation through /login; the reload makes that immediate and visible.
  const outBtn = document.createElement('button');
  outBtn.type = 'button';
  outBtn.className = 'sys-logout';
  outBtn.textContent = 'Log out';
  outBtn.title = 'End this device\u2019s session — the next visit asks for the password';
  outBtn.hidden = true;
  outBtn.addEventListener('click', async () => {
    outBtn.disabled = true;
    await request('/api/logout', { method: 'POST' });
    location.reload();
  });
  row.append(outBtn);

  // APPEARANCE — dark or light, this device's own choice (js/theme.js). It sits in
  // ⚙ System because it is a fact about the install as YOU see it, beside the release
  // identity. Two buttons, one lit: a dropdown for a two-value choice is ceremony.
  // Terminal panes stay dark either way — the light theme is the shell's, on purpose.
  const appRow = document.createElement('div');
  appRow.className = 'sys-theme';
  const appLab = document.createElement('span');
  appLab.className = 'sys-theme-lbl';
  appLab.textContent = 'appearance';
  const mkTheme = (v, label, hint) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.theme = v;
    b.textContent = label;
    b.title = hint;
    b.addEventListener('click', () => {
      setTheme(v);
      appRow.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.theme === v));
    });
    return b;
  };
  const darkBtn = mkTheme('dark', '● dark', 'The dark shell — the default');
  const lightBtn = mkTheme('light', '○ light', 'A light shell. Terminal panes stay dark — that is the design, not a gap.');
  (currentTheme() === 'light' ? lightBtn : darkBtn).classList.add('on');
  appRow.append(appLab, darkBtn, lightBtn);

  wrap.append(idBlock, appRow, row, msg.el);
  pane.appendChild(wrap);

  let version = null; // the operator's /api/version answer, fetched on enter
  let latest = null;

  const say = (text, bad) => msg.say(text, bad ? 'bad' : '');

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
    const res = await request('/api/update/check');
    if (!res.ok) {
      say(res.status === 404 ? 'this operator predates the updater — its next restart carries the routes' : res.message, true);
      checkBtn.disabled = false;
      return;
    }
    {
      const d = res.data;
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
    }
    checkBtn.disabled = false;
  };

  /** After /run: the new operator answering a different release IS completion. */
  const watch = async () => {
    const was = version?.release;
    for (let i = 0; i < 100; i++) {
      await new Promise((ok) => setTimeout(ok, 3000));
      const rv = await request('/api/version', { cache: 'no-store' });
      // A failed read is the restart itself — keep polling.
      if (rv.ok && rv.data.release && rv.data.release !== was) {
        say(`✓ updated to ${rv.data.release} — reloading`);
        setTimeout(() => location.reload(), 1200);
        return;
      }
    }
    say('no new version answered after 5 minutes — journalctl --user -u "ronin-update-*" has the transcript', true);
    runBtn.disabled = false;
  };

  const run = async () => {
    runBtn.disabled = true;
    checkBtn.disabled = true;
    say(`updating to ${latest} — fetch, verify, gate the candidate, swap. The page blinks at the swap; sessions are untouched…`);
    const r = await request('/api/update/run', { method: 'POST' });
    if (!r.ok) {
      say(r.message, true);
      runBtn.disabled = false;
    } else watch();
    checkBtn.disabled = false;
  };

  checkBtn.addEventListener('click', check);
  runBtn.addEventListener('click', run);

  const enter = async () => {
    const r = await request('/api/version', { cache: 'no-store' });
    version = r.ok ? r.data : null;
    renderId();
    const h = await request('/api/health', { cache: 'no-store' });
    outBtn.hidden = !(h.ok && h.data.login);
  };

  return { enter };
}
