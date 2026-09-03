import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sessionDir, sessionKey } from './session-dir.js';
import { tegamiPath } from './tegami.js';

const ON_TRACK = 'on_track';

export type RungStatus = 'PLANNED' | 'ACTIVE' | 'DONE';
const STATUSES: RungStatus[] = ['PLANNED', 'ACTIVE', 'DONE'];

export interface Leg {
  title: string;
  status: RungStatus;
}
export interface Rung {
  phase?: string;
  gate?: string;
  status?: RungStatus;
  legs?: Leg[];
}
export interface Tegami {
  objective: string;
  repos: { repo: string; branch: string }[];
  at: { rung: number; leg?: number } | null;
  session_role: string;
  teams: { team: string; team_role: string; objective: string }[];
  ladder_state: string;
  ladder: Rung[];
  docs: string[];
  chip: { text: string; gate: boolean };
  quietMs: number;
}

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

function toStatus(v: unknown): RungStatus {
  const s = String(v ?? '').toUpperCase();
  return STATUSES.includes(s as RungStatus) ? (s as RungStatus) : 'PLANNED';
}

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
      if (!implicit) {
        implicit = { phase: '', legs: [] };
        out.push(implicit);
      }
      implicit.legs!.push({ title: String(r.title ?? r.leg), status: toStatus(r.status) });
    }
  }
  return out;
}

function readAt(v: unknown): { rung: number; leg?: number } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!Number.isInteger(o.rung)) return null;
  return Number.isInteger(o.leg)
    ? { rung: o.rung as number, leg: o.leg as number }
    : { rung: o.rung as number };
}

async function readDocs(v: unknown): Promise<string[]> {
  if (!Array.isArray(v)) return [];
  const want = [...new Set(v.filter((x): x is string => typeof x === 'string' && x.startsWith('/')))];
  const alive = await Promise.all(want.map((p) => fs.stat(p).then(() => p).catch(() => null)));
  return alive.filter((p): p is string => p !== null);
}

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
      docs: await readDocs([path.join(sessionDir(key), 'README.md'), ...(Array.isArray(b.docs) ? b.docs : [])]),
      chip: chipFor(ladder, at, off),
      quietMs: Date.now() - stat.mtimeMs,
    };
  } catch {
    return null; // no directory, no file, no ladder. All the same answer.
  }
}
