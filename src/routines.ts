/**
 * ROUTINE RESOLUTION — one answer for every birth projection.
 *
 * A Team record is a complete on/off map captured when that Team is saved. Birth reads
 * that map whole; only a rōnin (no Team record) reads the Campaign map. This
 * module deliberately does not read stores or decide availability, so launch, preview and
 * tests cannot acquire subtly different cascades. Delivery adapters annotate availability
 * after this selection has been resolved.
 */
import type { RoutineRow } from './definitions.js';

export type RoutineChoices = Record<string, boolean>;

export interface ResolvedRoutine extends RoutineRow {
  enabled: boolean;
  stated_by: 'campaign' | 'team' | 'dependency' | 'implicit_off';
  /** Selected Routines which made this one additive, empty for a direct choice. */
  required_by: string[];
}

const own = (map: RoutineChoices, name: string): boolean =>
  Object.prototype.hasOwnProperty.call(map, name);

/** Only literal booleans are choices. Configuration prose such as "off" is not data. */
export function routineChoices(value: unknown): RoutineChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] =>
      /^[a-z0-9][a-z0-9_-]{0,63}$/.test(entry[0]) && typeof entry[1] === 'boolean'),
  );
}

/**
 * RENAMED ROUTINES, carried once when a stored map is read.
 *
 * A stored map is the owner's own answer. If a renamed key is not carried it becomes an
 * unknown key — ignored, correctly, under the ignored-never-refused law — while the new
 * name is absent and so resolves implicit off. For `ronin_control` that would silently
 * switch managed worktrees OFF for every existing Team. Ignoring an UNUSABLE input and
 * forgetting a STATED choice are not the same act, and only the first one is house law.
 *
 * `machine` was the box Routine's name before 2026-08-31; it is `ronin_host` now.
 */
export const ROUTINE_RENAMES: Readonly<Record<string, string>> = {
  machine: 'ronin_host',
  ronin_control: 'ronin_worktrees',
};

/** Returns the carried map, and whether anything moved — the caller decides about writing. */
export function carryRoutineNames(stored: Record<string, boolean>): {
  map: Record<string, boolean>;
  changed: boolean;
} {
  const map: Record<string, boolean> = {};
  let changed = false;
  for (const [key, enabled] of Object.entries(stored)) {
    const renamed = ROUTINE_RENAMES[key];
    if (renamed === undefined) { map[key] = enabled; continue; }
    // A map already carrying the new name keeps it: the owner's later answer outranks
    // whatever the old key still said.
    if (!Object.prototype.hasOwnProperty.call(stored, renamed)) map[renamed] = enabled;
    changed = true;
  }
  return { map, changed };
}

/** Save-time normalization: every catalog Routine receives an explicit on/off answer. */
export function completeRoutineChoices(catalog: RoutineRow[], value: unknown): RoutineChoices {
  const choices = routineChoices(value);
  return Object.fromEntries(catalog.map((routine) => [routine.name, choices[routine.name] ?? false]));
}

export function resolveRoutines(
  catalog: RoutineRow[],
  campaign: RoutineChoices,
  team?: RoutineChoices,
): ResolvedRoutine[] {
  const choices = team ?? campaign;
  const layer = team === undefined ? 'campaign' as const : 'team' as const;
  const resolved: ResolvedRoutine[] = catalog.map((routine) => {
    if (own(choices, routine.name)) {
      return { ...routine, enabled: choices[routine.name], stated_by: layer, required_by: [] as string[] };
    }
    return { ...routine, enabled: false, stated_by: 'implicit_off' as const, required_by: [] as string[] };
  });
  const byName = new Map(resolved.map((routine) => [routine.name, routine]));
  // Close the graph to a fixed point. A direct off is overridden by an enabled dependent:
  // the additive progression is a product invariant, not a contradictory partial state.
  let changed = true;
  while (changed) {
    changed = false;
    for (const routine of resolved.filter((item) => item.enabled)) {
      for (const dependencyName of routine.requires) {
        const dependency = byName.get(dependencyName);
        if (!dependency) continue; // catalog validation names the broken reference
        if (!dependency.required_by.includes(routine.name)) dependency.required_by.push(routine.name);
        if (!dependency.enabled) {
          dependency.enabled = true;
          dependency.stated_by = 'dependency';
          changed = true;
        }
      }
    }
  }
  return resolved;
}
