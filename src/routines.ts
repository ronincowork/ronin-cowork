/**
 * ROUTINE RESOLUTION — one answer for every birth projection.
 *
 * Campaign choices are the base. A Team states only exceptions; absence inherits. This
 * module deliberately does not read stores or decide availability, so launch, preview and
 * tests cannot acquire subtly different cascades. Delivery adapters annotate availability
 * after this selection has been resolved.
 */
import type { RoutineRow } from './definitions.js';

export type RoutineChoices = Record<string, boolean>;

export interface ResolvedRoutine extends RoutineRow {
  enabled: boolean;
  stated_by: 'campaign' | 'team' | 'implicit_off';
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

export function resolveRoutines(
  catalog: RoutineRow[],
  campaign: RoutineChoices,
  team: RoutineChoices = {},
): ResolvedRoutine[] {
  return catalog.map((routine) => {
    if (own(team, routine.name)) {
      return { ...routine, enabled: team[routine.name], stated_by: 'team' as const };
    }
    if (own(campaign, routine.name)) {
      return { ...routine, enabled: campaign[routine.name], stated_by: 'campaign' as const };
    }
    return { ...routine, enabled: false, stated_by: 'implicit_off' as const };
  });
}
