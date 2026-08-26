/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { serviceMissing } from './state.js';
import { button, status } from './ui.js';
import { t } from './lexicon.js';

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
  head.textContent = t('machine.head', 'this machine');
  block.append(head);

  const body = document.createElement('div');
  const msg = status('sys-msg');
  block.append(body, msg);

  const draw = (m) => {
    body.textContent = '';
    if (m.off) {
      msg.textContent = t('machine.off', 'Watching is off. Nothing is gathered, and nothing was ever installed on the box.');
      return;
    }
    msg.textContent = '';
    const total = m.mem.total_mb || 1;
    const share = Math.max(0, m.mem.available_mb) / total;
    line(body, t('machine.memory_free', 'memory free'), t('machine.of', '{free} of {total}', { free: gb(m.mem.available_mb), total: gb(total) }),
      t('machine.memory_note', 'MemAvailable: what a new allocation could get. A healthy box shows little free memory — the kernel spends it on cache, and hands it back on demand.'));
    line(body, t('machine.headroom', 'headroom'), `${Math.round(share * 100)}%`);
    line(body, t('machine.swap', 'swap'), m.swap.total_mb === 0
      ? t('machine.swap_none', 'none — a memory spike is a kill, not slowness')
      : t('machine.used_of', '{used} used of {total}', { used: gb(m.swap.used_mb), total: gb(m.swap.total_mb) }));
    line(body, t('machine.load', 'load'), t('machine.load_value', '{one} · {five} · {fifteen}  on {cpus} cores', { one: m.load[0], five: m.load[1], fifteen: m.load[2], cpus: m.cpus }),
      t('machine.load_note', '1, 5 and 15 minute averages. Compare against the core count, not against zero.'));
    if (m.scope === 'container') {
      line(body, t('machine.scope', 'scope'), t('machine.scope_container', 'container limit'), t('machine.scope_note', 'These are this container’s numbers, not the host’s.'));
    }
    // NAMED, NEVER A ZERO. A reading that could not see something says so; reporting 0
    // for an unknown is how a box with swap gets reported as having none.
    if (Array.isArray(m.unavailable) && m.unavailable.length) {
      line(body, t('machine.unavailable', 'not readable here'), m.unavailable.join(', '),
        t('machine.unavailable_note', 'This system does not expose these, so they are left unanswered rather than reported as zero.'));
    }
  };

  const load = async () => {
    const r = await request('/api/machine', { cache: 'no-store' });
    if (r && r.ok && r.data) draw(r.data);
    else msg.textContent = t('machine.read_failed', 'Could not read the machine just now.');
  };

  const row = document.createElement('div');
  row.className = 'sys-actions';
  const refresh = button(t('machine.refresh', 'Refresh'), { cls: 'sys-run', title: t('machine.refresh_title', 'Read the machine again now') });
  refresh.addEventListener('click', () => void load());
  const off = button(t('machine.stop', 'Stop watching'), {
    cls: 'sys-run',
    title: t('machine.stop_title', 'Stop gathering machine readings and hide the gauge. Nothing was installed on the box, so there is nothing to undo — turn it back on whenever you like.'),
  });
  off.addEventListener('click', async () => {
    const r = await request('/api/settei/machine', { method: 'PUT', body: { monitor: false } });
    msg.textContent = r && r.ok ? t('machine.stopped', 'Off. Reload to clear the gauge.') : t('machine.save_failed', 'Could not save that.');
  });
  row.append(refresh, off);
  block.append(row);

  void load();
  return block;
}
