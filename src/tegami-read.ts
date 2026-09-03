/**
 * TEGAMI, READ — parsing the one file a session keeps into the work-record shape.
 *
 * MOVED INTO CORE from michi (owner, 2026-09-02): the on-click View Work Record must
 * answer on a plain install — the ladder, the listed docs, the repos the agent says it
 * is in — because the letter is core's own file (core seeds it at birth, `write_tegami`
 * ships in ronin_bin). What stays Services is the LIVE layer: the SHINGO chip, the
 * roster's ladder column, the scrape/watch that keeps a reading current without a
 * click — accuracy there needs koshi chasing agents, which is exactly the Services
 * promise. Core mounts its read route after `mountServiceRoutes`, so an installed
 * michi still answers first; this parser serves the box that has no michi. The parser
 * here and michi's must agree — michi's next cut imports this module instead of
 * carrying its own copy (that edit lives in the services repo).
 *
 * **There are no checks.** Nothing here verifies a claim, computes a proof, or
 * disagrees with the agent. The file says a rung is DONE, so it is DONE. The ladder is
 * an OUTLINE INDICATOR, not a record — and on a plain install it is as fresh as the
 * agent last left it: if it looks stale, ask the agent to update its work record.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sessionDir, sessionKey } from './session-dir.js';
import { tegamiPath } from './tegami.js';

/**
 * The one spelling of "on the ladder", named once. This string and
 * `ronin_bin/write_tegami`'s LADDER_STATES must agree exactly — a mismatch reads every
 * on-track session as off its ladder, silently.
 */
const ON_TRACK = 'on_track';

/** Where a rung is. The agent's word for it, taken at face value. */
export type RungStatus = 'PLANNED' | 'ACTIVE' | 'DONE';
const STATUSES: RungStatus[] = ['PLANNED', 'ACTIVE', 'DONE'];

export interface Leg {
  title: string;
  status: RungStatus;
}
export interface Rung {
  /** A rung is a phase (holding legs), or a gate. Exactly one of these is set. */
  phase?: string;
  gate?: string;
  status?: RungStatus;
  legs?: Leg[];
}
export interface Tegami {
  objective: string;
  /** Repositories and checked-out branches this session says it is working in. */
  repos: { repo: string; branch: string }[];
  /** The pointer — which rung is being worked, as a 1-based position in the letter. */
  at: { rung: number; leg?: number } | null;
  /** What this SESSION is doing — not who the agent is. */
  session_role: string;
  /** DERIVED, machinery-owned: one entry per team the session is on. */
  teams: { team: string; team_role: string; objective: string }[];
  /** `'on tangent'` when the agent stepped off its ladder, `''` for on track. */
  ladder_state: string;
  ladder: Rung[];
  /** MDEDIT — the docs this session listed, absolute paths, filtered to what exists. */
  docs: string[];
  /** The header chip SHINGO would show; derived here so every reader agrees. */
  chip: { text: string; gate: boolean };
  /** How long since the file last changed. */
  quietMs: number;
}

/**
 * Pull the block out of the shell. A ```json fence is the seeded shape; a bare object
 * is accepted too — losing the whole readout over three backticks would be a stupid
 * way to fail.
 */
function extractBlock(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (!candidate.trim()) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null; // malformed reads as "no ladder", never as an error the view has to carry
  }
}

/** Coerce whatever the agent wrote into a status we can draw. Unknown reads as PLANNED. */
function toStatus(v: unknown): RungStatus {
  const s = String(v ?? '').toUpperCase();
  return STATUSES.includes(s as RungStatus) ? (s as RungStatus) : 'PLANNED';
}

/**
 * Normalise the ladder. A flat list of legs with no phase is an honest ladder — a bare
 * {title,status} folds into an implicit phase rather than being rejected.
 */
function normalise(raw: unknown): Rung[] {
  if (!Array.isArray(raw)) return [];
  const out: Rung[] = [];
  let implicit: Rung | null = null;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.gate === 'string') {
      implicit = null;
      out.push({ gate: r.gate, status: toStatus(r.status) });
    } else if (typeof r.phase === 'string') {
      implicit = null;
      const legs = Array.isArray(r.legs)
        ? (r.legs as Record<string, unknown>[])
            .filter((l) => l && typeof l === 'object')
            .map((l) => ({ title: String(l.title ?? l.leg ?? ''), status: toStatus(l.status) }))
        : undefined;
      out.push({ phase: r.phase, status: r.status ? toStatus(r.status) : undefined, legs });
    } else if (typeof r.title === 'string' || typeof r.leg === 'string') {
      // A loose leg: hang it under an unnamed phase so the shape stays uniform.
      if (!implicit) {
        implicit = { phase: '', legs: [] };
        out.push(implicit);
      }
      implicit.legs!.push({ title: String(r.title ?? r.leg), status: toStatus(r.status) });
    }
  }
  return out;
}

/** Any shape that is not `{rung[, leg]}` is not a pointer — including the older flat int. */
function readAt(v: unknown): { rung: number; leg?: number } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!Number.isInteger(o.rung)) return null;
  return Number.isInteger(o.leg)
    ? { rung: o.rung as number, leg: o.leg as number }
    : { rung: o.rung as number };
}

/**
 * The doc list, filtered to what still exists — here rather than in the tab, so every
 * consumer sees the same truthful list. Absolute paths only; a relative path cannot be
 * resolved from the server's cwd, so it is dropped rather than guessed at.
 */
async function readDocs(v: unknown): Promise<string[]> {
  if (!Array.isArray(v)) return [];
  const want = [...new Set(v.filter((x): x is string => typeof x === 'string' && x.startsWith('/')))];
  const alive = await Promise.all(want.map((p) => fs.stat(p).then(() => p).catch(() => null)));
  return alive.filter((p): p is string => p !== null);
}

/**
 * The chip — position, or held. A gate outranks everything; the pointer wins over
 * inference; the frontier gate comes before any phase count. See michi's history for
 * why each rule exists — this copy must not drift from it.
 */
function chipFor(
  ladder: Rung[],
  at: { rung: number; leg?: number } | null,
  state: string,
): { text: string; gate: boolean } {
  if (state) return { text: `↳ ${state.replace(/_/g, ' ')}`, gate: false };
  if (!ladder.length) return { text: '—', gate: false };

  if (at && at.rung >= 1 && at.rung <= ladder.length) {
    const r = ladder[at.rung - 1];
    if (r.gate !== undefined) return { text: '⛩ GATE', gate: true };
    const legs = r.legs || [];
    const phaseNo = ladder.slice(0, at.rung).filter((x) => x.phase !== undefined).length;
    if (phaseNo) {
      const frac = legs.length && at.leg ? ` · leg ${at.leg}/${legs.length}` : '';
      return { text: `phase ${phaseNo}${frac}`, gate: false };
    }
  }

  const finished = (r: Rung) =>
    r.gate !== undefined ? r.status === 'DONE' : (r.legs || []).length > 0 && r.legs!.every((l) => l.status === 'DONE');
  const frontier = ladder.find((r) => !finished(r));
  if (frontier && frontier.gate !== undefined) return { text: '⛩ GATE', gate: true };

  const phases = ladder.filter((r) => r.phase !== undefined);
  if (!phases.length) return { text: '—', gate: false };

  let idx = phases.findIndex((p) => (p.legs || []).some((l) => l.status === 'ACTIVE'));
  if (idx < 0) idx = phases.findIndex((p) => (p.legs || []).some((l) => l.status !== 'DONE'));
  if (idx < 0) idx = phases.length - 1;

  const legs = phases[idx].legs || [];
  const done = legs.filter((l) => l.status === 'DONE').length;
  const frac = legs.length ? ` · ${done}/${legs.length}` : '';
  return { text: `phase ${idx + 1}${frac}`, gate: false };
}

/**
 * Read one session's letter. `null` when there is no ladder up — a legitimate answer
 * the view treats as "no record", not an error.
 */
export async function readTegami(name: string): Promise<Tegami | null> {
  try {
    const key = await sessionKey(name);
    const file = tegamiPath(key);
    const [text, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
    const block = extractBlock(text);
    if (!block || typeof block !== 'object') return null;
    const b = block as Record<string, unknown>;
    const at = readAt(b.at);
    const ladder = normalise(b.ladder);
    const state = String(b.ladder_state ?? '').trim().toLowerCase();
    const off = state && state !== ON_TRACK ? state : '';
    return {
      objective: String(b.objective ?? ''),
      repos: Array.isArray(b.repos)
        ? b.repos.flatMap((x) => {
            if (!x || typeof x !== 'object') return [];
            const r = x as Record<string, unknown>;
            return typeof r.repo === 'string'
              ? [{ repo: r.repo, branch: typeof r.branch === 'string' ? r.branch : '' }]
              : [];
          })
        : [],
      session_role: String(b.session_role ?? ''),
      teams: Array.isArray(b.teams)
        ? b.teams.flatMap((x) => {
            if (!x || typeof x !== 'object') return [];
            const t = x as Record<string, unknown>;
            return typeof t.team === 'string'
              ? [{ team: t.team, team_role: String(t.team_role ?? ''), objective: String(t.objective ?? '') }]
              : [];
          })
        : [],
      ladder_state: off,
      at,
      ladder,
      // The birth README is machinery-owned tracked reading. The Agent need not edit its
      // work record to make the exact packet it started with visible in Docs.
      docs: await readDocs([path.join(sessionDir(key), 'README.md'), ...(Array.isArray(b.docs) ? b.docs : [])]),
      chip: chipFor(ladder, at, off),
      quietMs: Date.now() - stat.mtimeMs,
    };
  } catch {
    return null; // no directory, no file, no ladder. All the same answer.
  }
}
