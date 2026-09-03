/* part of the ronin-cowork client — see js/README.md */
import { refreshTipStatus } from './tips.js';
import { t } from './lexicon.js';


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
  // set(v) points the dial. The badge is no longer SHOWN by anything — it is where the
  // position's sentence is kept, and the help box reads it from here as its status line
  // after a turn; both are gone. The flash was kept once on the argument that it is
  // feedback about an action rather than hover help, which was a distinction the eye
  // does not make: turning the dial while the help box was open put a second bubble on
  // top of it, which is the pile-up the box exists to end. `announce` now refreshes the
  // box in place, so the new position appears where the old one was being read.
  const set = (v, announce = false) => {
    const i = Math.max(0, positions.findIndex((p) => p.v === v));
    const p = positions[i];
    cur = p.v;
    ptr.style.transform = `rotate(${p.angle}deg)`;
    positions.forEach((q, j) => btn.classList.toggle('pos-' + q.v, j === i));
    badge.textContent = `${p.icon} ${p.help || p.label}`;
    if (announce) refreshTipStatus(btn);
  };
  btn.addEventListener('click', () => {
    const i = positions.findIndex((p) => p.v === cur);
    onPick(positions[(i + 1) % positions.length].v);
  });
  set(cur);
  return { el: btn, set };
}

/* ---------- cockpit gauge (the readout counterpart: dials are INPUTS, gauges are READOUTS) ---------- */
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
    badge.textContent = t('gauge.used', '⛽ {label} {pct}% used', { label, pct });
  };
  // No flash here either — same reason as the dial. The reading lives in the badge for
  // the help box to read; clicking the gauge no longer raises a bubble of its own.
  btn.addEventListener('click', () => refreshTipStatus(btn));
  return { el: btn, set };
}

/**
 * DIM A CONTROL WITHOUT SILENCING IT.
 *
 * `disabled` is the obvious way to grey a button out, and it costs you the tooltip:
 * browsers do not fire hover events on a disabled element, so `title` never shows. On
 * the tile header that inverted the point — a control you cannot use is exactly the one
 * whose label you want to read, because the question it raises is *why not*. Four of
 * them (the mark, 🏷, 📝, the dial) went silent whenever no session was connected, while
 * 🔒 stayed readable purely because it dims with a class instead.
 *
 * So: a class for the look, `aria-disabled` for assistive tech, the title always set,
 * and the CALLER guards its own click. The button stays hoverable and stays focusable,
 * which is also the accessible behaviour — a disabled control drops out of tab order and
 * announces nothing.
 *
 * `why` replaces the title while inert. It should say what is missing, not repeat the
 * label: "No session in this tile" beats a greyed-out "Groups".
 */
export function setInert(el, inert, why, title) {
  if (!el) return;
  el.classList.toggle('off', !!inert);
  el.setAttribute('aria-disabled', inert ? 'true' : 'false');
  el.title = inert ? why : title;
}

/**
 * THE JOB MENU — pick what a session is doing, from the mark that shows it.
 *
 * A popover that dies on the next click, deliberately not a sheet like 🏷 Groups: that
 * one is an EDITOR (several values, typing, a Save), this picks one item off a list the
 * catalog already handed us. `jobs` is that catalog, `current` is the name to tick, and
 * `onPick` receives the chosen name — or '' for "not marked", which is a real state and
 * has to stay reachable once you have set one by hand.
 *
 * It knows nothing about sessions or fetching. The caller owns what a pick MEANS, which
 * is what lets the same menu hang off a tile header and a roster row.
 */
// The control dial's three detents (@ronin-control on the tmux session). "Outside
// agents" = other agents reaching into the session (via /send or tmux) — never the
// agent already running inside it, and never the owner's own typing.
// A function, not a table: the lexicon loads after this module is evaluated, so the dial's
// words are read when a tile head is built.
export function CONTROL_POSITIONS() {
  return [
    { v: 'user', icon: '👤', label: t('dial.user', 'Owner only'), help: t('dial.user_help', 'Owner only — outside agents may not read or type here'), angle: -60 },
    { v: 'read', icon: '👁', label: t('dial.read', 'Outside agents: watch'), help: t('dial.read_help', 'Outside agents may watch this session, not type into it'), angle: 0 },
    { v: 'write', icon: '🤖', label: t('dial.write', 'Outside agents: type'), help: t('dial.write_help', 'Outside agents may type into this session'), angle: 60 },
  ];
}

/* ---------- lifecycle events (births & deaths, no reload) ---------- */
// One /events socket per PAGE: the server pushes the fresh session list whenever
// membership changes. Pickers refresh everywhere; a dead session's tile returns to
// the home panel; a new session gets a chip you can't miss.
