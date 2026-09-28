import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sessionDir, sessionKey } from './session-dir.js';
import { tegamiPath } from './tegami.js';
import { agentReading } from './work-items-read.js';
import type { Rung, WorkItem } from './work-items.js';
import { mandate, type Mandate } from './agent-defaults.js';

const ON_TRACK = 'on_track';

export interface Tegami {
  objective: string;
  mandate: Mandate;
  repos: { repo: string; branch: string }[];
  /** The focus item and, when placed, the rung and leg on its ladder. */
  at: { item?: string; rung?: number; leg?: number } | null;
  teams: { team: string; team_role: string; objective: string }[];
  ladder_state: string;
  /** The focus item's ladder: an Agent's ladder is the ladder of the item it is on. */
  ladder: Rung[];
  holds: string[];
  items: WorkItem[];
  item: WorkItem | null;
  /** The session's README and the documents of every item it holds. */
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

async function readDocs(v: unknown): Promise<string[]> {
  if (!Array.isArray(v)) return [];
  const want = [...new Set(v.filter((x): x is string => typeof x === 'string' && x.startsWith('/')))];
  const alive = await Promise.all(want.map((p) => fs.stat(p).then(() => p).catch(() => null)));
  return alive.filter((p): p is string => p !== null);
}

function chipFor(
  ladder: Rung[],
  at: { rung?: number; leg?: number } | null,
  state: string,
): { text: string; gate: boolean } {
  if (state) return { text: `↳ ${state.replace(/_/g, ' ')}`, gate: false };
  if (!ladder.length) return { text: '—', gate: false };

  if (at && at.rung !== undefined && at.rung >= 1 && at.rung <= ladder.length) {
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
    const reading = await agentReading(name);
    const at = reading.focus ? { item: reading.focus, ...(reading.at ?? {}) } : null;
    const state = String(b.ladder_state ?? '').trim().toLowerCase();
    const off = state && state !== ON_TRACK ? state : '';
    return {
      objective: String(b.objective ?? ''),
      mandate: mandate(b.mandate),
      repos: Array.isArray(b.repos)
        ? b.repos.flatMap((x) => {
            if (!x || typeof x !== 'object') return [];
            const r = x as Record<string, unknown>;
            return typeof r.repo === 'string'
              ? [{ repo: r.repo, branch: typeof r.branch === 'string' ? r.branch : '' }]
              : [];
          })
        : [],
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
      ladder: reading.ladder,
      holds: reading.items.map((item) => item.id),
      items: reading.items,
      item: reading.items.find((item) => item.id === reading.focus) ?? null,
      docs: await readDocs([path.join(sessionDir(key), 'README.md'), ...reading.docs]),
      chip: chipFor(reading.ladder, reading.at, off),
      quietMs: Date.now() - stat.mtimeMs,
    };
  } catch {
    return null; // no directory, no file, no ladder. All the same answer.
  }
}
