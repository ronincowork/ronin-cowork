import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sessionDir, sessionKey } from './session-dir.js';
import { tegamiPath } from './tegami.js';
import { BIRTH_BRIEF } from './birth-brief.js';
import { agentReading } from './work-items-read.js';
import type { WorkItem } from './work-items.js';
import { mandate, type Mandate } from './agent-defaults.js';

export interface Tegami {
  objective: string;
  mandate: Mandate;
  repos: { repo: string; branch: string }[];
  teams: { team: string; team_role: string; objective: string; members?: string[] }[];
  holds: string[];
  /** The items held, each with its status: what the tile and the roster show. */
  items: WorkItem[];
  /** The session's birth brief, the documents of every item it holds, and files dropped on it. */
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
    return null; // malformed reads as "no record", never as an error the view has to carry
  }
}

async function readDocs(v: unknown): Promise<string[]> {
  if (!Array.isArray(v)) return [];
  const want = [...new Set(v.filter((x): x is string => typeof x === 'string' && x.startsWith('/')))];
  const alive = await Promise.all(want.map((p) => fs.stat(p).then(() => p).catch(() => null)));
  return alive.filter((p): p is string => p !== null);
}

/** Files the owner handed this Agent from the browser, in the session's own drop/. */
async function dropped(key: string): Promise<string[]> {
  const dir = path.join(sessionDir(key), 'drop');
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  return names.filter((n) => !n.startsWith('.')).sort().map((n) => path.join(dir, n));
}

/** The tile's and the roster's readout: the items held with their status (a flag marks an
 * impediment), the first three named and the rest counted. */
export function chipFor(items: WorkItem[]): { text: string; gate: boolean } {
  if (!items.length) return { text: '—', gate: false };
  const named = items.slice(0, 3).map((item) => `${item.flagged ? '⚑ ' : ''}${item.id} ${item.status}`);
  const more = items.length > 3 ? [`+${items.length - 3}`] : [];
  return { text: [...named, ...more].join(' · '), gate: items.some((item) => item.flagged) };
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
              ? [{
                  team: t.team, team_role: String(t.team_role ?? ''), objective: String(t.objective ?? ''),
                  ...(Array.isArray(t.members) ? { members: t.members.map(String) } : {}),
                }]
              : [];
          })
        : [],
      holds: reading.items.map((item) => item.id),
      items: reading.items,
      docs: await readDocs([path.join(sessionDir(key), BIRTH_BRIEF), ...reading.attachments, ...(await dropped(key))]),
      chip: chipFor(reading.items),
      quietMs: Date.now() - stat.mtimeMs,
    };
  } catch {
    return null; // no directory, no file, no record. All the same answer.
  }
}
