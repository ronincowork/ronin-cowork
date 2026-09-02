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
  stated_by: 'campaign' | 'team' | 'agent' | 'dependency' | 'implicit_off';
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

/** Save-time normalization: every catalog Routine receives an explicit on/off answer. */
export function completeRoutineChoices(catalog: RoutineRow[], value: unknown): RoutineChoices {
  const choices = routineChoices(value);
  return Object.fromEntries(catalog.map((routine) => [routine.name, choices[routine.name] ?? false]));
}

export function resolveRoutines(
  catalog: RoutineRow[],
  campaign: RoutineChoices,
  team?: RoutineChoices,
  agent?: RoutineChoices,
): ResolvedRoutine[] {
  const inherited = team ?? campaign;
  const inheritedLayer = team === undefined ? 'campaign' as const : 'team' as const;
  const resolved: ResolvedRoutine[] = catalog.map((routine) => {
    if (agent && own(agent, routine.name)) {
      return { ...routine, enabled: agent[routine.name], stated_by: 'agent' as const, required_by: [] as string[] };
    }
    if (own(inherited, routine.name)) {
      return { ...routine, enabled: inherited[routine.name], stated_by: inheritedLayer, required_by: [] as string[] };
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
