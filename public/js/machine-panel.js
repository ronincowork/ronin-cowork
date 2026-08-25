/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { serviceMissing } from './state.js';
import { button, status } from './ui.js';

/**
 * ⚙ THE MACHINE — the detail behind the header gauge.
 *
 * RAM_RPM is the glance: one number, always there, learned by seeing it every day. This
 * is the look, for the moment the glance made someone curious — the same reading with
 * more of it shown, plus the switch that turns watching off.
 *
 * ONE READING, NOT A SECOND OPINION. Both surfaces call `/api/machine` and render what
 * it says. A panel that computed its own numbers could disagree with the gauge about the
 * same box, and two disagreeing answers to one question is the defect this house keeps
 * rediscovering (OPEN_THREADS 4.36).
 *
 * IT DOES NOT POLL. The gauge does that; this is drawn when the desk is opened and
 * refreshed by pressing it. A second timer against the same endpoint would double the
 * wakeups to tell one person one thing.
 */
const gb = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

function line(parent, label, value, note) {
  const row = document.createElement('div');
  row.className = 'sys-theme';
  const l = document.createElement('span');
  l.className = 'sys-theme-lbl';
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'mach-v';
  v.textContent = value;
  if (note) v.title = note;
  row.append(l, v);
  parent.append(row);
  return v;
}

export function buildMachinePanel() {
  // The SWITCH, client half: no machine service, no panel. Drawing an empty box that
  // explains it is empty is worse than not drawing it.
  if (serviceMissing('machine')) return null;

  const block = document.createElement('div');
  block.className = 'sys-machine';
  const head = document.createElement('div');
  head.className = 'sys-theme-lbl';
  head.textContent = 'this machine';
  block.append(head);

  const body = document.createElement('div');
  const msg = status('sys-msg');
  block.append(body, msg);

  const draw = (m) => {
    body.textContent = '';
    if (m.off) {
      msg.textContent = 'Watching is off. Nothing is gathered, and nothing was ever installed on the box.';
      return;
    }
    msg.textContent = '';
    const total = m.mem.total_mb || 1;
    const share = Math.max(0, m.mem.available_mb) / total;
    line(body, 'memory free', `${gb(m.mem.available_mb)} of ${gb(total)}`,
      'MemAvailable: what a new allocation could get. A healthy box shows little free memory — the kernel spends it on cache, and hands it back on demand.');
    line(body, 'headroom', `${Math.round(share * 100)}%`);
    line(body, 'swap', m.swap.total_mb === 0
      ? 'none — a memory spike is a kill, not slowness'
      : `${gb(m.swap.used_mb)} used of ${gb(m.swap.total_mb)}`);
    line(body, 'load', `${m.load[0]} · ${m.load[1]} · ${m.load[2]}  on ${m.cpus} cores`,
      '1, 5 and 15 minute averages. Compare against the core count, not against zero.');
    if (m.scope === 'container') {
      line(body, 'scope', 'container limit', 'These are this container’s numbers, not the host’s.');
    }
    // NAMED, NEVER A ZERO. A reading that could not see something says so; reporting 0
    // for an unknown is how a box with swap gets reported as having none.
    if (Array.isArray(m.unavailable) && m.unavailable.length) {
      line(body, 'not readable here', m.unavailable.join(', '),
        'This system does not expose these, so they are left unanswered rather than reported as zero.');
    }
  };

  const load = async () => {
    const r = await request('/api/machine', { cache: 'no-store' });
    if (r && r.ok && r.data) draw(r.data);
    else msg.textContent = 'Could not read the machine just now.';
  };

  const row = document.createElement('div');
  row.className = 'sys-actions';
  const refresh = button('Refresh', { cls: 'sys-run', title: 'Read the machine again now' });
  refresh.addEventListener('click', () => void load());
  const off = button('Stop watching', {
    cls: 'sys-run',
    title: 'Stop gathering machine readings and hide the gauge. Nothing was installed on the box, so there is nothing to undo — turn it back on whenever you like.',
  });
  off.addEventListener('click', async () => {
    const r = await request('/api/settei/machine', { method: 'PUT', body: { monitor: false } });
    msg.textContent = r && r.ok ? 'Off. Reload to clear the gauge.' : 'Could not save that.';
  });
  row.append(refresh, off);
  block.append(row);

  void load();
  return block;
}
