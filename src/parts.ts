/**
 * SERVICES PARTS — what is on disk, and which of it this server runs.
 *
 * A part is a directory under `src/services/` with a `register` entry. Parts arrive with
 * Ronin (they are the install); whether one RUNS is the owner's switch: a Routine claims
 * the parts it runs (`parts:` in `ronin_catalogs/routines/<name>.md`), and a claimed part
 * loads only while that Routine is on for the Campaign. Off is "as if not installed" —
 * no timers, no routes, no recorder — with the files left in place (owner, 2026-09-04:
 * the recorder ran for a Campaign whose Services switch was off, and its per-tile ticks
 * were the bulk of the server's process spawning). An unclaimed part always loads.
 *
 * The switch is read once, at start. A change on the Routines page takes effect at the
 * next restart; `/api/installed` says so, and the Services row shows it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RoutineRow } from './resource-adapters.js';
import { routineChoices } from './routines.js';

export const SERVICES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'services');

export interface PartOnDisk { name: string; entry: string }

/** Every part present on disk, in name order. Not what runs — see `partsToLoad`. */
export function discoverParts(dir = SERVICES_DIR): PartOnDisk[] {
  if (!fs.existsSync(dir)) return [];
  const out: PartOnDisk[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const entry = ['register.js', 'register.ts'].map((f) => path.join(dir, name, f)).find((p) => fs.existsSync(p));
    if (entry) out.push({ name, entry }); // a stray file or a README is not a part
  }
  return out;
}

export interface PartsPlan<T extends { name: string }> {
  load: T[];
  /** Claimed by a Routine whose switch is off: on disk, not run. */
  parked: { name: string; routine: string }[];
}

/** Which Routine claims each part; the first claim wins, in catalog order. */
export function partClaims(routines: Pick<RoutineRow, 'name' | 'parts'>[]): Map<string, string> {
  const claims = new Map<string, string>();
  for (const routine of routines) for (const part of routine.parts) if (!claims.has(part)) claims.set(part, routine.name);
  return claims;
}

/** The rule: a claimed part loads only while its Routine's switch is on; an unclaimed part always loads. */
export function partsToLoad<T extends { name: string }>(
  parts: T[],
  routines: Pick<RoutineRow, 'name' | 'parts'>[],
  switches: unknown,
): PartsPlan<T> {
  const claims = partClaims(routines);
  const on = routineChoices(switches);
  const plan: PartsPlan<T> = { load: [], parked: [] };
  for (const part of parts) {
    const routine = claims.get(part.name);
    if (routine && on[routine] !== true) plan.parked.push({ name: part.name, routine });
    else plan.load.push(part);
  }
  return plan;
}
