/**
 * MACHINE — what this box is working at, as one small reading.
 *
 * The services side of KYOKAI: system administration of the box is a SERVICES
 * capability, not part of the free coworkspace (owner, 2026-08-25). Cowork is the
 * tmux application a knowledgeable person runs themselves; helping them run the
 * machine under it is what Ronin Services is for, and RAM is the nascent first
 * piece of it.
 *
 * The name is the owner's (2026-08-24): a tachometer, not an alarm. It is always
 * visible and mostly ignored, and it tells you how hard the machine is working before
 * you have to wonder.
 *
 * ONE NUMBER MATTERS AND IT IS NOT `free`. On a healthy box `free` is always small,
 * because the kernel spends every spare page on cache it will hand back the instant
 * anything asks. Reporting it would show a comfortable machine as nearly dead.
 * `MemAvailable` is the kernel's own estimate of what a new allocation could actually
 * get, and it is the number that predicts an OOM kill.
 *
 * CGROUP FIRST, /proc SECOND. Inside a container /proc/meminfo describes the HOST, so a
 * 2 GB container reports the host's 64 GB and shows green while it is being killed. When
 * a cgroup memory ceiling exists it is the truth about this process's world, and the
 * reading says which one it used rather than leaving the reader to guess.
 */
import fs from 'node:fs';
import os from 'node:os';

export interface MachineReading {
  /** Megabytes, because a browser gauge has no use for bytes. */
  mem: { total_mb: number; available_mb: number };
  swap: { total_mb: number; used_mb: number };
  /** 1 / 5 / 15 minute load, and the cores to read it against. */
  load: [number, number, number];
  cpus: number;
  /** Which world the memory numbers describe. */
  scope: 'host' | 'container';
}

const MB = 1024 * 1024;

function readFirst(...paths: string[]): string | null {
  for (const p of paths) {
    try { return fs.readFileSync(p, 'utf8').trim(); } catch { /* next */ }
  }
  return null;
}

/** /proc/meminfo is `Key:   <kB> kB` — kB, never bytes, and the unit is not optional. */
function meminfo(): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    for (const line of fs.readFileSync('/proc/meminfo', 'utf8').split('\n')) {
      const m = /^(\w+):\s+(\d+)/.exec(line);
      if (m) out[m[1]!] = Number(m[2]) * 1024;
    }
  } catch { /* not Linux, or no procfs */ }
  return out;
}

/**
 * The cgroup v2 ceiling, or null when there is none. `max` is the literal string the
 * kernel writes for "no limit" — treating it as a number yields NaN and a gauge that
 * reports nonsense, so it is checked as text before anything else touches it.
 */
function cgroupLimit(): { total: number; used: number } | null {
  const max = readFirst('/sys/fs/cgroup/memory.max');
  const cur = readFirst('/sys/fs/cgroup/memory.current');
  if (!max || !cur || max === 'max') return null;
  const total = Number(max), used = Number(cur);
  if (!Number.isFinite(total) || !Number.isFinite(used) || total <= 0) return null;
  return { total, used };
}

export function readMachine(): MachineReading {
  const mi = meminfo();
  const cg = cgroupLimit();

  // A container's ceiling wins where it exists; `available` there is what is left under
  // the cap, which is the only headroom this process can actually spend.
  const mem = cg
    ? { total_mb: Math.round(cg.total / MB), available_mb: Math.round(Math.max(0, cg.total - cg.used) / MB) }
    : {
        total_mb: Math.round((mi.MemTotal ?? 0) / MB),
        // MemAvailable is absent on very old kernels; MemFree is a poor stand-in and is
        // labelled as the fallback rather than quietly substituted.
        available_mb: Math.round((mi.MemAvailable ?? mi.MemFree ?? 0) / MB),
      };

  const swapTotal = mi.SwapTotal ?? 0;
  const swap = {
    total_mb: Math.round(swapTotal / MB),
    used_mb: Math.round(Math.max(0, swapTotal - (mi.SwapFree ?? 0)) / MB),
  };

  const [a, b, c] = os.loadavg();
  return {
    mem,
    swap,
    load: [Number(a.toFixed(2)), Number(b.toFixed(2)), Number(c.toFixed(2))],
    cpus: os.cpus().length || 1,
    scope: cg ? 'container' : 'host',
  };
}
