/* part of the tmux-ronin client — see js/README.md */
import { request } from './request.js';
import { button, sheet, status } from './ui.js';
import { resolvedTheme, setTheme } from './theme.js';
import { S } from './state.js';

/**
 * ⚙ SYSTEM — what this install is, in ONE sheet off the bar's gear.
 *
 * It was a Commons room, which meant four copies — one per tile — for facts that are
 * the INSTALL's, not a tile's. The owner's ruling (2026-08-16): a gear per tile makes
 * no sense. So it is a page-level ui.sheet now, opened by the one ⚙ in the bar
 * (relocated into the ニ sheet on touch like the other bar verbs), and the Commons
 * keeps only the rooms that are actually about work.
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
export function buildSystemSheet() {
  const dlg = sheet({ id: 'syssheet', cls: 'sys-card', label: 'System' });
  const wrap = document.createElement('div');
  wrap.className = 'sys';
  dlg.card.appendChild(wrap);

  const idBlock = document.createElement('div');
  idBlock.className = 'sys-id';

  // APPEARANCE — one flip button, and following the device is the default. The
  // button shows the shell's CURRENT mode; pressing it flips. Flipping away from
  // what the Mac prefers pins the shell; flipping back to match re-arms following
  // (js/theme.js setTheme) — so "make it match" and "follow it" stay one act and
  // no third control exists. Terminal panes stay dark either way, by design.
  const appRow = document.createElement('div');
  appRow.className = 'sys-theme';
  const appLab = document.createElement('span');
  appLab.className = 'sys-theme-lbl';
  appLab.textContent = 'appearance';
  const flip = button('', {
    cls: 'sys-flip',
    title: "The shell's mode — tap to flip. Ronin follows this device until you flip away; flip back to match and it follows again.",
  });
  const paintFlip = () => {
    flip.textContent = resolvedTheme() === 'dark' ? '● dark' : '○ light';
  };
  flip.addEventListener('click', () => {
    setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
    paintFlip();
  });
  paintFlip();
  appRow.append(appLab, flip);

  const row = document.createElement('div');
  row.className = 'sys-actions';
  const checkBtn = button('Check for updates', {
    title: 'Ask the release feeds what the latest versions are — both packages, only when pressed',
  });
  const runBtn = button('Update', { cls: 'sys-run' });
  runBtn.disabled = true;
  runBtn.hidden = true;
  // THE SERVICES BUTTON — the owner's ruling (2026-08-16): ungated, click it and it
  // does it. Same updater underneath (--services): fetch, verify, CONTRACT CHECK
  // against the running cowork, into the store, into the tree, restart. It appears
  // only when the check names an installable services release.
  const svcBtn = button('Install services', { cls: 'sys-run' });
  svcBtn.disabled = true;
  svcBtn.hidden = true;
  // LOG OUT — only drawn when a login exists (/api/health `login`), because a button
  // that answers "you were never logged in" is furniture. Clearing the cookie sends
  // the next navigation through /login; the reload makes that immediate and visible.
  const outBtn = button('Log out', {
    cls: 'sys-logout',
    title: 'End this device’s session — the next visit asks for the password',
  });
  outBtn.hidden = true;
  outBtn.addEventListener('click', async () => {
    outBtn.disabled = true;
    await request('/api/logout', { method: 'POST' });
    location.reload();
  });
  row.append(checkBtn, runBtn, svcBtn, outBtn);

  const msg = status('sys-msg');
  wrap.append(idBlock, appRow, row, msg.el);

  let version = null; // the operator's /api/version answer, fetched on open
  let latest = null;
  let svcLatest = null;

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
    // The roster line: which services this operator discovered at start. The honest
    // absence reads as the free build, not as an error.
    const svc = document.createElement('small');
    svc.className = 'sys-services';
    const roster = Array.isArray(version?.services) ? version.services : [];
    svc.textContent = roster.length ? `services: ${roster.join(' · ')}` : 'services: none — the free build';
    idBlock.append(svc);
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
      const bits = [];
      if (!d.latest) {
        bits.push('the feed named no cowork release yet (a private repo needs gh auth on the host)');
      } else if (d.upToDate) {
        bits.push(`✓ cowork up to date — ${d.installed}`);
      } else if (version && !version.release) {
        bits.push(`latest cowork release is ${d.latest} — this box runs a checkout, so the button stays off`);
      } else {
        runBtn.textContent = `Update to ${d.latest}`;
        runBtn.hidden = false;
        runBtn.disabled = false;
        bits.push(`cowork ${d.latest} available (installed: ${d.installed || 'none'})`);
      }
      // The services half of the same answer. The button is off on a checkout for
      // the same reason the cowork one is: the updater manages installs, git
      // manages source trees.
      const s = d.services || {};
      if (s.latest && !s.upToDate && version && version.release) {
        svcLatest = s.latest;
        svcBtn.textContent = s.installed ? `Update services to ${s.latest}` : `Install services ${s.latest}`;
        svcBtn.hidden = false;
        svcBtn.disabled = false;
        bits.push(`services ${s.latest} available${s.installed ? ` (installed: ${s.installed})` : ''}`);
      } else if (s.latest && s.upToDate) {
        bits.push(`✓ services up to date — ${s.installed}`);
      }
      say(bits.join(' · '));
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

  /** Services completion: the operator restarts (startedAt moves) and the roster
   *  answers — a filled roster after a fresh start IS the install having landed. */
  const watchSvc = async () => {
    const was = version?.startedAt;
    for (let i = 0; i < 100; i++) {
      await new Promise((ok) => setTimeout(ok, 3000));
      const rv = await request('/api/version', { cache: 'no-store' });
      // A failed read is the restart itself — keep polling.
      if (rv.ok && rv.data.startedAt !== was && (rv.data.services || []).length) {
        say(`✓ services live: ${rv.data.services.join(' · ')} — reloading`);
        setTimeout(() => location.reload(), 1200);
        return;
      }
    }
    say('services did not answer after 5 minutes — journalctl --user -u "ronin-update-*" has the transcript', true);
    svcBtn.disabled = false;
  };

  const runSvc = async () => {
    svcBtn.disabled = true;
    checkBtn.disabled = true;
    say(`installing services ${svcLatest} — fetch, verify, contract check, restart. The page blinks at the restart; sessions are untouched…`);
    const r = await request('/api/update/run', { method: 'POST', json: { package: 'services' } });
    if (!r.ok) {
      say(r.message, true);
      svcBtn.disabled = false;
    } else watchSvc();
    checkBtn.disabled = false;
  };

  checkBtn.addEventListener('click', check);
  runBtn.addEventListener('click', run);
  svcBtn.addEventListener('click', runSvc);

  const open = () => {
    dlg.open();
    paintFlip(); // the Mac may have flipped while the sheet was away
    say('');
    void (async () => {
      const r = await request('/api/version', { cache: 'no-store' });
      version = r.ok ? r.data : null;
      renderId();
      const h = await request('/api/health', { cache: 'no-store' });
      outBtn.hidden = !(h.ok && h.data.login);
    })();
  };

  S.sysPanel = { open, close: dlg.close };
}
