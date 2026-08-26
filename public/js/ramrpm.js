/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { serviceMissing } from './state.js';
import { t } from './lexicon.js';

/**
 * RAM_RPM — the box's working reading, in the header.
 *
 * A TACHOMETER, NOT AN ALARM (owner, 2026-08-24). It is always visible and mostly
 * ignored, which is the point: you learn what normal looks like without being told, so
 * the abnormal registers on its own. An always-loud readout becomes wallpaper in a day
 * and stops being information — so this is quiet by default and only earns attention
 * when the headroom is genuinely short.
 *
 * ONCE A MINUTE, AND ONLY WHEN WATCHED. Memory pressure builds over minutes, not
 * frames; a faster poll would buy nothing and wake the browser for it. A backgrounded
 * tab polls not at all — a Ronin left open in a tab for a week should not appear in
 * anyone's battery report — and reads once immediately on return so the first glance
 * after switching back is current rather than a minute stale.
 *
 * It cannot catch a sudden spike, and is not meant to: a runaway allocation can take a
 * box down inside one interval. Swap is what survives that. This is for noticing the
 * slow squeeze that precedes it.
 */
const POLL_MS = 60_000;

/** Headroom, not usage: the share of memory a new allocation could still get. */
function bandFor(freeShare) {
  if (freeShare < 0.10) return 'red';
  if (freeShare < 0.25) return 'warn';
  return 'ok';
}

function render(el, m) {
  const total = m.mem.total_mb || 1;
  const free = Math.max(0, m.mem.available_mb);
  const share = free / total;
  const gb = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`);

  el.hidden = false;
  el.dataset.band = bandFor(share);
  el.textContent = gb(free);

  // The title carries what the face cannot. Kept short: the help box is a FIXED
  // rectangle and a long label spills out of it (scripts/check-tips.mjs).
  const swap = m.swap.total_mb === 0 ? t('gauge.no_swap', 'no swap') : t('gauge.swap', 'swap {used}', { used: gb(m.swap.used_mb) });
  const where = m.scope === 'container' ? ' ' + t('gauge.container_limit', '(container limit)') : '';
  el.title = t('gauge.ram_title', 'RAM_RPM — {free} free of {total}{where} · load {load} on {cpus} · {swap}', { free: gb(free), total: gb(total), where, load: m.load[0], cpus: m.cpus, swap });
}

export function mountRamRpm() {
  const el = document.getElementById('ramrpm');
  if (!el) return;
  // THE SWITCH, client half. Machine administration is a SERVICES capability, so on the
  // free build there is no /api/machine to ask — draw nothing rather than fetch into a
  // 404 once a minute forever. `S.services` is filled from /api/version before this runs.
  if (serviceMissing('machine')) return;

  let timer = null;
  const read = async () => {
    const r = await request('/api/machine', { cache: 'no-store' });
    // A failed read LEAVES THE LAST NUMBER STANDING rather than blanking or zeroing.
    // A gauge that reads 0 on a network blip says "the box is dying" — the one lie it
    // must never tell. Staleness is the honest failure here, not alarm.
    // OFF is a real answer, not a failure: the owner said do not watch this box. Hide
    // the gauge and STOP asking — a poll that keeps running after being switched off is
    // the switch not working, whatever the face shows.
    if (r && r.ok && r.data && r.data.off) { el.hidden = true; stop(); return; }
    if (r && r.ok && r.data && r.data.mem) render(el, r.data);
  };

  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const start = () => { if (!timer) { void read(); timer = setInterval(() => void read(), POLL_MS); } };

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (!document.hidden) start();
}
