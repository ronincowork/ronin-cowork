/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { button, field, status } from './ui.js';
import { currentSkin, listSkins, setSkin } from './skins.js';
import { resolvedTheme, setTheme } from './theme.js';
import { S } from './state.js';

/**
 * ⚙ SYSTEM — what this install is: appearance, the updater, and the way out.
 *
 * IT HAS BEEN IN THREE PLACES, and the third is the one that was right. It began as a
 * Commons room, which meant four copies — one per tile — for facts that are the INSTALL's,
 * not a tile's (owner, 2026-08-16: a gear per tile makes no sense). So it became a
 * page-level `ui.sheet` off the bar's ⚙. That fixed the copies and cost it the room: a
 * sheet is a small box, and this content wants a pane.
 *
 * Since 2026-08-18 it is neither. These three groups hang in the **admin_desk** (js/desk.js)
 * under "This app", below the six rooms about the install — one tile, opened where you ask
 * for it, with a full pane to draw in. The line the 2026-08-16 ruling drew was right; what
 * was missing was a surface on the correct side of it. `buildSystemPanel` returns elements
 * now, not a sheet, and the ⚙ that used to open the sheet opens the desk.
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
/* ---------- passkeys ----------
 * REGISTRATION LIVES BEHIND THE GATE AND THAT IS THE DESIGN, NOT AN ACCIDENT. You add a
 * passkey by first proving you are already the owner; the login page can only SPEND one.
 * An unauthenticated "register a passkey" button would be a public become-the-owner
 * button, which is a worse door than no door at all (src/routes/passkey-api.ts).
 *
 * The two things that can make the button useless are both reported rather than hidden:
 * a non-secure context (the tailnet IP — WebAuthn simply does not exist there), and a
 * credential registered under a different name than the one this page was reached by. A
 * passkey is bound to its domain, so a key made on the MagicDNS name will not be offered
 * on any other address, and saying so beats an owner concluding it was lost.
 */
function buildPasskeyBlock() {
  const el = document.createElement('div');
  el.className = 'sys-passkeys';
  // Hidden until /api/health confirms a login exists — drawing it first and retracting
  // it a moment later is a flash of a control the owner may not even have.
  el.hidden = true;
  const head = document.createElement('div');
  head.className = 'sys-theme-lbl';
  head.textContent = 'passkeys';
  const list = document.createElement('div');
  const msg = status('sys-msg');

  const name = document.createElement('input');
  name.type = 'text';
  name.placeholder = 'this device';
  name.maxLength = 60;
  const nameField = field(name, { label: 'passkey name' });

  const addBtn = button('Add a passkey', {
    cls: 'sys-run',
    title: 'Register this device — Touch ID, Face ID or a security key',
  });
  const row = document.createElement('div');
  row.className = 'sys-actions';
  row.append(addBtn);
  el.append(head, list, nameField.el, row, msg.el);

  const toBuf = (s) => {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u.buffer;
  };
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const b64u = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const render = (d) => {
    list.innerHTML = '';
    const creds = (d && d.credentials) || [];
    if (!creds.length) {
      const none = document.createElement('small');
      none.textContent = 'none registered — this device can be the first.';
      list.append(none);
    }
    for (const c of creds) {
      const line = document.createElement('div');
      line.className = 'sys-theme';
      const lab = document.createElement('small');
      lab.textContent = c.label + (c.usable ? '' : ` (registered on ${c.rpId} — not usable from this address)`);
      const rm = button('Remove', { title: `Remove ${c.label}` });
      rm.addEventListener('click', async () => {
        // No confirm(): removing one of several passkeys is reversible by re-adding,
        // and the destructive-confirm primitive is reserved for work that is not.
        rm.disabled = true;
        const r = await request('/api/passkey/remove', { method: 'POST', json: { id: c.id } });
        msg.say(r.ok ? 'removed' : r.message, r.ok ? 'ok' : 'bad');
        refresh();
      });
      line.append(lab, rm);
      list.append(line);
    }
    if (d && d.recovery) {
      const rec = document.createElement('small');
      rec.textContent = `a recovery code is outstanding until ${new Date(d.recovery.expiresAt).toLocaleTimeString()}`;
      list.append(rec);
    }
  };

  const refresh = async () => {
    const r = await request('/api/passkey/list', { cache: 'no-store' });
    if (!r.ok) {
      // A 404 means this operator predates the routes — the same honest reading the
      // update button gives, rather than an error the owner cannot act on.
      msg.say(r.status === 404 ? 'this operator predates passkeys — its next restart carries the routes' : r.message, 'bad');
      addBtn.disabled = true;
      return;
    }
    render(r.data);
    const secure = window.isSecureContext && !!(window.PublicKeyCredential && navigator.credentials);
    addBtn.disabled = !secure || !r.data.rpId;
    if (!secure) {
      msg.say('Adding a passkey needs the HTTPS address — this one is not a secure context.', 'bad');
    } else if (!r.data.rpId) {
      msg.say(`Passkeys unavailable: ${r.data.why || 'no relying-party name'}`, 'bad');
    }
  };

  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    msg.say('waiting for the authenticator…', 'busy');
    try {
      const o = await request('/api/passkey/register-options', { cache: 'no-store' });
      if (!o.ok) throw new Error(o.message);
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: toBuf(o.data.challenge),
          rp: { id: o.data.rpId, name: 'Ronin' },
          // ONE owner, so one stable user handle: a fixed id means re-registering the
          // same device REPLACES its entry in the keychain instead of littering it.
          user: { id: new TextEncoder().encode('ronin-owner'), name: `ronin@${o.data.rpId}`, displayName: 'Ronin owner' },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256 — what Apple's platform authenticator uses
            { type: 'public-key', alg: -257 }, // RS256 — Windows Hello and older keys
          ],
          // residentKey: the credential lives ON the device, which is what lets the
          // login page omit allowCredentials and never enumerate the owner's devices.
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
          excludeCredentials: (o.data.excludeCredentials || []).map((id) => ({ type: 'public-key', id: toBuf(id) })),
          attestation: 'none', // we do not check it, so we do not collect it
          timeout: 60000,
        },
      });
      // getPublicKey() is why this needs no CBOR parser on the server — see src/passkey.ts.
      const spki = cred.response.getPublicKey && cred.response.getPublicKey();
      const r = await request('/api/passkey/register', {
        method: 'POST',
        json: {
          id: cred.id,
          publicKey: spki ? b64(spki) : '',
          alg: cred.response.getPublicKeyAlgorithm ? cred.response.getPublicKeyAlgorithm() : 0,
          clientDataJSON: b64u(cred.response.clientDataJSON),
          label: name.value.trim(),
        },
      });
      if (!r.ok) throw new Error(r.message);
      name.value = '';
      msg.say('✓ passkey added', 'ok');
      refresh();
      return;
    } catch (ex) {
      const cancelled = ex && (ex.name === 'NotAllowedError' || ex.name === 'AbortError');
      msg.say(cancelled ? 'cancelled' : ex.message, cancelled ? '' : 'bad');
    }
    addBtn.disabled = false;
  });

  return { el, refresh };
}

/**
 * THE APP'S OWN THREE, and they are NOT a sheet any more (2026-08-18).
 *
 * This was `buildSystemSheet()` — one `ui.sheet` holding appearance, the updater and the
 * way out, opened by ⚙ on the bar. It is the same content, returned as three ELEMENTS for
 * the admin_desk to hang in its nav ("This app", under the six install rooms). The owner's
 * reason is the one this file always had: install-level facts do not belong in a tile —
 * and a desk is the tile that is not about a session, so now they have somewhere to sit
 * that is neither a sheet nor four copies.
 *
 * RE-PARENTED, NOT REWRITTEN, on purpose. `check`, `run`, `runSvc` and `renderId` share one
 * closure over `version`/`latest`/`svcLatest`, and the updater and log-out are the two
 * things in this client I can least afford to get subtly wrong. So the elements are grouped
 * differently and every line of logic below is untouched: `row` split into the release's
 * buttons and the account's, and `open()` became `enter()` without its `dlg.open()`.
 */
export function buildSystemPanel() {

  const idBlock = document.createElement('div');
  idBlock.className = 'sys-id';

  // APPEARANCE — one flip button, and following the device is the default. The
  // button shows the shell's CURRENT mode; pressing it flips. Flipping away from
  // what the Mac prefers pins the shell; flipping back to match re-arms following
  // (js/theme.js setTheme) — so "make it match" and "follow it" stay one act and
  // no third control exists. The pane flips with the shell from 2026-08-19 — light
  // means light all the way in, terminal included (docs/ui.md, Theme).
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

  /* THE SKIN PICKER, beside the light/dark flip because they are the same question asked
   * twice — what does this look like — and a person hunting "appearance" should find both
   * in one place rather than learning that one of them is a room of its own.
   *
   * A ROW PER SKIN, NOT A <select>. Each carries its blurb, and a skin of the owner's own
   * says so: `origin` distinguishes something you added from something of ours you
   * replaced, and only the second can silently stop tracking an upgrade (docs/shadowing.md)
   * — which is exactly the thing worth seeing before you wonder why a shipped skin stopped
   * changing. The list is empty on a build whose service cannot answer, and an empty list
   * draws nothing rather than an error: no skins is a legal state, not a fault. */
  const skinBlock = document.createElement('div');
  skinBlock.className = 'sys-skins';
  const skinLab = document.createElement('span');
  skinLab.className = 'sys-theme-lbl';
  skinLab.textContent = 'skin';
  const skinList = document.createElement('div');
  skinList.className = 'sys-skinlist';
  skinBlock.append(skinLab, skinList);

  const paintSkins = (skins) => {
    skinList.innerHTML = '';
    const chosen = currentSkin();
    for (const sk of skins) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'sys-skin' + (sk.name === chosen ? ' on' : '');
      const nm = document.createElement('b');
      nm.textContent = sk.label;
      if (sk.origin === 'user') {
        const mark = document.createElement('i');
        mark.className = 'sys-skin-mine';
        mark.textContent = sk.shadowed ? 'yours (replaces ours)' : 'yours';
        nm.appendChild(mark);
      }
      const why = document.createElement('small');
      why.textContent = sk.blurb;
      row.append(nm, why);
      row.addEventListener('click', () => {
        setSkin(sk);
        skinList.querySelectorAll('.sys-skin').forEach((r) => r.classList.toggle('on', r === row));
      });
      skinList.appendChild(row);
    }
  };

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
  // The release's buttons; `outBtn` leaves this row for the account's — the split that
  // makes three nav rows possible. Nothing about what any of them DO changes.
  row.append(checkBtn, runBtn, svcBtn);
  const outRow = document.createElement('div');
  outRow.className = 'sys-actions';
  outRow.append(outBtn);

  const msg = status('sys-msg');
  const passkeys = buildPasskeyBlock();

  const group = (...kids) => {
    const g = document.createElement('div');
    g.className = 'sys';
    g.append(...kids);
    return g;
  };
  const appearance = group(appRow, skinBlock);
  const release = group(idBlock, row, msg.el);
  const account = group(outRow, passkeys.el);

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

  const enter = () => {
    paintFlip(); // the Mac may have flipped while the desk was away
    // Re-read every time: SKINS.md is parsed per request, so a hand-edit to the file — or
    // an upgrade that ships a new one — is visible on the next visit to this room without
    // a reload. That is the same promise the macro list makes about MACROS.md.
    void listSkins().then(paintSkins);
    say('');
    void (async () => {
      const r = await request('/api/version', { cache: 'no-store' });
      version = r.ok ? r.data : null;
      renderId();
      const h = await request('/api/health', { cache: 'no-store' });
      // Both the logout button and the passkey block hang off the same fact: a login
      // exists on this install. Passkeys mint the SAME session cookie the password does
      // and are signed by the secret stored beside the password record (src/auth.ts), so
      // on a Basic-only box there is nothing for either control to act on.
      outBtn.hidden = !(h.ok && h.data.login);
      passkeys.el.hidden = outBtn.hidden;
      if (!passkeys.el.hidden) passkeys.refresh();
    })();
  };

  return { appearance, release, account, enter };
}
