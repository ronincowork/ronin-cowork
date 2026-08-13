/* part of the tmux-ronin client — see js/README.md */


export function makeDial(positions, onPick) {
  const btn = document.createElement('button');
  btn.className = 'dial';
  btn.type = 'button';
  const face = document.createElement('span');
  face.className = 'dial-face';
  for (const p of positions) {
    const tick = document.createElement('span');
    tick.className = 'dial-tick';
    tick.style.transform = `rotate(${p.angle}deg) translateY(-7px)`;
    face.appendChild(tick);
  }
  const ptr = document.createElement('span');
  ptr.className = 'dial-ptr';
  face.appendChild(ptr);
  const badge = document.createElement('span');
  badge.className = 'dial-badge';
  btn.append(face, badge);

  let cur = positions[0].v;
  let badgeTimer = null;
  // set(v) points the dial. The badge holds the position's help sentence: shown on
  // hover (CSS, desktop — our own element, not a native title tooltip) and flashed
  // briefly after a tap (announce=true, the touch stand-in for hover).
  const set = (v, announce = false) => {
    const i = Math.max(0, positions.findIndex((p) => p.v === v));
    const p = positions[i];
    cur = p.v;
    ptr.style.transform = `rotate(${p.angle}deg)`;
    positions.forEach((q, j) => btn.classList.toggle('pos-' + q.v, j === i));
    badge.textContent = `${p.icon} ${p.help || p.label}`;
    if (announce) {
      badge.classList.add('show');
      clearTimeout(badgeTimer);
      badgeTimer = setTimeout(() => badge.classList.remove('show'), 1400);
    }
  };
  btn.addEventListener('click', () => {
    const i = positions.findIndex((p) => p.v === cur);
    onPick(positions[(i + 1) % positions.length].v);
  });
  set(cur);
  return { el: btn, set };
}

/* ---------- cockpit gauge (the readout counterpart: dials are INPUTS, gauges are READOUTS) ---------- */
// A tiny round meter tuned to the USEFUL context range (Glen 2026-08-06): sessions
// never reach 100%, and the difference between 6/17/35% is what you actually watch.
// Nonlinear clock sweep — 0% at 6:00, 15% at 9:00, 50% at 12:00, pegged at 3:00 by
// ~80% — so early growth moves the needle visibly and past 50% you're in the red
// quadrant (12:00→3:00). Angles: CSS rotate, 0 = 12:00, clockwise.
export const GAUGE_STOPS = [
  [0, 180], // 6:00
  [15, 270], // 9:00
  [50, 360], // 12:00 — red begins
  [80, 450], // 3:00 — pegged (anything ≥80 sits here)
];
export function gaugeAngle(pct) {
  if (pct <= GAUGE_STOPS[0][0]) return GAUGE_STOPS[0][1];
  for (let i = 1; i < GAUGE_STOPS.length; i++) {
    const [p1, a1] = GAUGE_STOPS[i];
    if (pct <= p1) {
      const [p0, a0] = GAUGE_STOPS[i - 1];
      return a0 + ((a1 - a0) * (pct - p0)) / (p1 - p0);
    }
  }
  return GAUGE_STOPS[GAUGE_STOPS.length - 1][1];
}
// set(null) hides it — a plain shell pane has no context, and that's fine. Tap
// (touch) or hover (desktop) reveals the number via the badge, same as the dial.
export function makeGauge(label) {
  const btn = document.createElement('button');
  btn.className = 'gauge';
  btn.type = 'button';
  const face = document.createElement('span');
  face.className = 'gauge-face';
  const ptr = document.createElement('span');
  ptr.className = 'gauge-ptr';
  face.appendChild(ptr);
  const badge = document.createElement('span');
  badge.className = 'gauge-badge';
  btn.append(face, badge);
  btn.hidden = true;

  let badgeTimer = null;
  const set = (v) => {
    if (v == null || !Number.isFinite(v)) {
      btn.hidden = true;
      return;
    }
    const pct = Math.max(0, Math.min(100, Math.round(v)));
    btn.hidden = false;
    // Revealed tachometer fill (Glen): the arc grows from 6:00 to the needle and
    // shows each zone's colour only as it is reached — green to 9:00, amber to
    // 12:00, red beyond — never the whole face pre-painted. The three cut-points
    // are clipped to the sweep here; .gauge-face stacks them into one gradient.
    const deg = gaugeAngle(pct);
    const sweep = deg - 180; // 0..270 past the 6:00 start
    btn.style.setProperty('--g1', Math.min(sweep, 90) + 'deg');
    btn.style.setProperty('--g2', Math.min(sweep, 180) + 'deg');
    btn.style.setProperty('--g3', Math.min(sweep, 270) + 'deg');
    ptr.style.transform = `rotate(${deg}deg)`;
    badge.textContent = `⛽ ${label} ${pct}% used`;
  };
  btn.addEventListener('click', () => {
    badge.classList.add('show');
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => badge.classList.remove('show'), 1400);
  });
  return { el: btn, set };
}

// The control dial's three detents (@ronin-control on the tmux session). "Outside
// agents" = other agents reaching into the session (via /send or tmux) — never the
// agent already running inside it, and never the owner's own typing.
export const CONTROL_POSITIONS = [
  { v: 'user', icon: '👤', label: 'Owner only', help: 'Owner only — outside agents may not read or type here', angle: -60 },
  { v: 'read', icon: '👁', label: 'Outside agents: watch', help: 'Outside agents may watch this session, not type into it', angle: 0 },
  { v: 'write', icon: '🤖', label: 'Outside agents: type', help: 'Outside agents may type into this session', angle: 60 },
];

/* ---------- lifecycle events (births & deaths, no reload) ---------- */
// One /events socket per PAGE: the server pushes the fresh session list whenever
// membership changes. Pickers refresh everywhere; a dead session's tile returns to
// the home panel; a new session gets a chip you can't miss.
