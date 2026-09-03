import type { RoutineRow } from './resource-adapters.js';

export type RoutineChoices = Record<string, boolean>;

export interface ResolvedRoutine extends RoutineRow {
  enabled: boolean;
  stated_by: 'campaign' | 'team' | 'agent' | 'dependency' | 'implicit_off';
  required_by: string[];
}

const own = (map: RoutineChoices, name: string): boolean =>
  Object.prototype.hasOwnProperty.call(map, name);

export function routineChoices(value: unknown): RoutineChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] =>
      /^[a-z0-9][a-z0-9_-]{0,63}$/.test(entry[0]) && typeof entry[1] === 'boolean'),
  );
}

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

export function resolveAgentRoutines(
  catalog: RoutineRow[],
  campaign: unknown,
  team: unknown,
  agentOverrides: unknown,
  hasAgent: boolean,
): ResolvedRoutine[] {
  return hasAgent
    ? resolveRoutines(
        catalog,
        routineChoices(campaign),
        team === undefined ? undefined : routineChoices(team),
        agentOverrides === undefined ? undefined : routineChoices(agentOverrides),
      )
    : [];
}
