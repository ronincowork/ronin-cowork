/* part of the tmux-ronin client — see js/README.md */


/* ---------- Work Louder device programming (WebHID — Chrome/Edge desktop) ---------- */
// "Load our own Ronin keyboard" (Glen): write the layout onto the pad itself, no
// Input app, no manual mapping. The Creator Micro 2's whole config is a JSON file
// (keymap.json) on the device, read/written over its vendor HID channel — usage
// page 0xFF00, which WebHID allows (only *keyboard* usage pages are blocked).
// Protocol facts from egegungordu/micro2-configurator PROTOCOL.md (reverse-
// engineered from Work Louder's Input app, verified on fw v0.6.1); the code here
// is our own. Safety rails: the current keymap.json downloads as a backup before
// every write, and only the 13 key slots of the chosen layer are replaced —
// encoders, joystick, lights, other layers/profiles, unknown fields all pass
// through untouched. Don't run the Input app while writing.
export const WL_VID = 0x303a; // Espressif — the pad is an ESP32-S3
export const WL_PIDS = [0x8297, 0x8298]; // Creator Micro 2
export const WL_REPORT = 0x06; // report ID; 63-byte frames: [channel, len, ...payload]
export const WL_RPC_CH = 2;
// Mirrors PAD_LAYOUT (2/4/4/3): F13–F24 + bottom-right Right Option for Wispr
// push-to-talk — hold-to-talk works because holding the key IS holding ⌥, and the
// right-side modifier is never used alone. Point Wispr's hotkey at Right Option.
// (KI_FP, the firmware's Fn keycode, was tried first and does NOT reach Wispr.)
export const WL_RONIN_KEYMAP = [
  ['KC_F13', 'KC_F19'], // no F14/F15/Pause/ScrollLock — all brightness (see PAD_LAYOUT)
  ['KC_F20', 'KC_F16', 'KC_F17', 'KC_F18'],
  // combo: slots resolve at write time into device-side key-sequence Actions
  // (keymap.json "macros", schema from worklouder-input-cli's fixtures) — the
  // only representation of ⌥ combos this firmware has. Plain LALT() spellings
  // were hardware-tested and rejected.
  ['KC_ESC', 'KC_TAB', 'combo:adel', 'KC_ENT'],
  ['KC_F21', 'combo:aent', 'KC_RALT'],
];
// Only 10 codes are Mac-safe (F13, F16–F24) but 7 keys + 2 encoder + 4 joystick
// need 13, so the joystick uses ⇧F-chords — same Action mechanism as the ⌥
// combos, which is hardware-proven.
// Key-step sequences: [act, kc] with act 1=press, 2=click, 0=release.
export const WL_COMBOS = {
  'combo:adel': { name: 'ronin ⌥⌫', steps: [[1, 'KC_LALT'], [2, 'KC_BSPC'], [0, 'KC_LALT']] },
  'combo:aent': { name: 'ronin ⌥↵', steps: [[1, 'KC_LALT'], [2, 'KC_ENT'], [0, 'KC_LALT']] },
  'combo:jup': { name: 'ronin joy↑', steps: [[1, 'KC_LSFT'], [2, 'KC_F13'], [0, 'KC_LSFT']] },
  'combo:jright': { name: 'ronin joy→', steps: [[1, 'KC_LSFT'], [2, 'KC_F16'], [0, 'KC_LSFT']] },
  'combo:jdown': { name: 'ronin joy↓', steps: [[1, 'KC_LSFT'], [2, 'KC_F17'], [0, 'KC_LSFT']] },
  'combo:jleft': { name: 'ronin joy←', steps: [[1, 'KC_LSFT'], [2, 'KC_F18'], [0, 'KC_LSFT']] },
};
// Encoder [CW, CCW] — LEFT ON VOLUME deliberately. The knob emits on the
// CONSUMER-CONTROL collection (the media-key channel), which browsers never
// deliver as keydown, so it cannot reach Ronin at all: keyboard keycodes parked
// there are stored and silently never seen, and routing it through an Action
// doesn't escape the channel either — both hardware-tested. It's the same
// limitation as the inline remote on a pair of wired earbuds. So it keeps the
// job it's actually good at; scroll lives on a bindable key instead.
export const WL_ENCODER = ['KC_VOLU', 'KC_VOLD'];
// Joystick quadrants → ⇧F chords → Ronin moves the active tile directionally.
// The firmware resolves the wedge and emits the code itself (the radial MENU it
// replaces was drawn by the Input app, i.e. useless with Input closed).
// Angle 0 is 3 o'clock (EAST), increasing clockwise — corrected from hardware:
// with 0 assumed to be 12 o'clock the directions came out rotated 90°. If a
// flick still names the wrong direction in the panel readout, rotate this list
// by one position (that's all a 90° error is).
export const WL_JOYSTICK = {
  type: 'RADIAL',
  sectors: [
    { k: 'combo:jright', a1: 0.875, a2: 0.125 }, // 0 = east
    { k: 'combo:jdown', a1: 0.125, a2: 0.375 },
    { k: 'combo:jleft', a1: 0.375, a2: 0.625 },
    { k: 'combo:jup', a1: 0.625, a2: 0.875 },
  ],
};

/** Pick + open a Creator Micro 2; returns { device, rpc, close }. */
export async function wlConnect() {
  const picked = await navigator.hid.requestDevice({
    filters: WL_PIDS.map((productId) => ({ vendorId: WL_VID, productId, usagePage: 0xff00 })),
  });
  const device = picked.find((d) => d.collections.some((c) => c.usagePage === 0xff00));
  if (!device) throw new Error('no pad selected');
  if (!device.opened) {
    try {
      await device.open();
    } catch (e) {
      // Chrome's "Failed to open the device" = the OS refused the open. Say what
      // to actually do about it, most likely cause first (macOS TCC gates HID
      // access to keyboard-like devices behind Input Monitoring).
      throw new Error(
        'could not open the pad — 1) System Settings → Privacy & Security → ' +
          'Input Monitoring: enable Chrome, then restart Chrome; 2) quit the ' +
          'Work Louder Input app (menu bar too); 3) use the USB cable, not ' +
          'Bluetooth; 4) chrome://device-log shows the exact refusal',
      );
    }
  }

  let nextId = 0; // firmware rejects ids > 998
  const pending = new Map(); // id -> {resolve, reject, timer}
  let rxBuf = '';
  const onReport = (e) => {
    if (e.reportId !== WL_REPORT) return;
    const d = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    if (d[0] !== WL_RPC_CH) return; // channel 1 is the debug log
    rxBuf += new TextDecoder().decode(d.subarray(2, 2 + Math.min(d[1], d.length - 2)));
    let nl;
    while ((nl = rxBuf.indexOf('\n')) >= 0) {
      const line = rxBuf.slice(0, nl).replace(/\r$/, '');
      rxBuf = rxBuf.slice(nl + 1);
      if (!line) continue;
      let m;
      try {
        m = JSON.parse(line);
      } catch (_) {
        continue;
      }
      const p = pending.get(m.id);
      if (!p) continue; // id-less = device notification (kb.radial etc.) — not ours
      pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.error) p.reject(new Error(m.error.message || 'device error'));
      else p.resolve(m.result);
    }
  };
  device.addEventListener('inputreport', onReport);

  // One request in flight at a time + a 50 ms gap — the firmware's own SDK does this.
  let chain = Promise.resolve();
  const rpc = (method, params = null) => {
    const id = (nextId = (nextId % 998) + 1);
    const line = (JSON.stringify({ method, params, id }) + '\n').replace(
      /[\u0080-\uffff]/g, // firmware wants ASCII on the wire
      (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
    );
    const reply = new Promise((resolve, reject) => {
      pending.set(id, {
        resolve,
        reject,
        timer: setTimeout(() => {
          pending.delete(id);
          reject(new Error(method + ': pad did not reply'));
        }, 10000),
      });
    });
    chain = chain
      .then(async () => {
        const bytes = new TextEncoder().encode(line);
        for (let o = 0; o < bytes.length; o += 61) {
          const part = bytes.subarray(o, o + 61);
          const frame = new Uint8Array(63);
          frame[0] = WL_RPC_CH;
          frame[1] = part.length;
          frame.set(part, 2);
          await device.sendReport(WL_REPORT, frame);
        }
        await new Promise((r) => setTimeout(r, 50));
      })
      .catch(() => {});
    return reply;
  };
  const close = () => {
    device.removeEventListener('inputreport', onReport);
    pending.forEach((p) => clearTimeout(p.timer));
    pending.clear();
    try {
      device.close();
    } catch (_) {}
  };
  return { device, rpc, close };
}

/** Whole-file write via chunked fs.writebin; the completed:true chunk commits + reloads. */
export async function wlWriteFile(rpc, file, text) {
  const bytes = new TextEncoder().encode(text);
  const CHUNK = 3072; // max raw bytes per chunk (4096 base64 chars)
  for (let o = 0; o < bytes.length; o += CHUNK) {
    const part = bytes.subarray(o, o + CHUNK);
    let bin = '';
    for (const b of part) bin += String.fromCharCode(b);
    await rpc('fs.writebin', {
      file,
      data: btoa(bin),
      append: true,
      completed: o + CHUNK >= bytes.length,
      offset: o,
    });
  }
}

/** Hand the browser a file to download (the pre-write backup). */
export function wlDownload(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/**
 * Ask-on-press popup: a pad key bound with "ask" (e.g. buildout) pops this tiny
 * prompt — type the args, Enter fires `+name: args`, Esc cancels. The window IS
 * the macro's argument field, nothing more.
 */
