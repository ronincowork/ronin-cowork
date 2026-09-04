export type ResidueClass =
  | 'contained_ref'
  | 'stale_registry_row'
  | 'stale_assignment'
  | 'empty_scaffold'
  | 'abandoned_candidate'
  | 'unique_ref'
  | 'dirty_worktree'
  | 'user_checkout'
  | 'ambiguous';

export interface ResidueObservation {
  id: string;
  kind: 'ref' | 'registry' | 'assignment' | 'directory' | 'candidate' | 'worktree';
  managed: boolean;
  exists?: boolean;
  contains_unique_commits?: boolean;
  contained_in_working?: boolean;
  dirty?: boolean;
  empty?: boolean;
  active?: boolean;
  detail?: string;
}

export interface SettlementItem extends ResidueObservation {
  classification: ResidueClass;
  action: 'delete_ref' | 'remove_row' | 'remove_directory' | 'remove_candidate' | 'leave_untouched';
  safe: boolean;
  reason: string;
}

export function classifyResidue(item: ResidueObservation): SettlementItem {
  const leave = (classification: ResidueClass, reason: string): SettlementItem =>
    ({ ...item, classification, action: 'leave_untouched', safe: false, reason });
  if (!item.managed) return leave('user_checkout', 'user-managed checkout Git is outside settlement jurisdiction');
  if (item.dirty) return leave('dirty_worktree', 'dirty files require named quarantine or deliberate disposition');
  if (item.contains_unique_commits) return leave('unique_ref', 'unique commits remain visible and untouched');
  if (item.active) return leave('ambiguous', 'active managed machinery is not residue');
  if (item.kind === 'ref' && item.contained_in_working) {
    return { ...item, classification: 'contained_ref', action: 'delete_ref', safe: true, reason: 'managed ref is contained in the working branch' };
  }
  if (item.kind === 'registry' && item.exists === false) {
    return { ...item, classification: 'stale_registry_row', action: 'remove_row', safe: true, reason: 'registry row names no branch or worktree' };
  }
  if (item.kind === 'assignment' && item.exists === false) {
    return { ...item, classification: 'stale_assignment', action: 'remove_row', safe: true, reason: 'assignment has no surviving managed desk' };
  }
  if (item.kind === 'directory' && item.empty) {
    return { ...item, classification: 'empty_scaffold', action: 'remove_directory', safe: true, reason: 'empty managed scaffold carries no work' };
  }
  if (item.kind === 'candidate' && !item.exists) {
    return { ...item, classification: 'abandoned_candidate', action: 'remove_candidate', safe: true, reason: 'candidate control row has no worktree or unique ref' };
  }
  if (item.kind === 'candidate' && item.contained_in_working && !item.dirty) {
    return { ...item, classification: 'abandoned_candidate', action: 'remove_candidate', safe: true, reason: 'clean candidate is already contained in the working branch' };
  }
  return leave('ambiguous', item.detail || 'settlement cannot prove a mechanical disposition');
}

export function settlementPlan(items: ResidueObservation[]): { safe: SettlementItem[]; untouched: SettlementItem[] } {
  const classified = items.map(classifyResidue);
  return { safe: classified.filter((item) => item.safe), untouched: classified.filter((item) => !item.safe) };
}

export async function applySettlement(
  items: ResidueObservation[],
  apply: (item: SettlementItem) => Promise<void>,
  yes = false,
): Promise<{ applied: SettlementItem[]; untouched: SettlementItem[] }> {
  const plan = settlementPlan(items);
  if (!yes) return { applied: [], untouched: [...plan.safe, ...plan.untouched] };
  const applied: SettlementItem[] = [];
  for (const item of plan.safe) {
    await apply(item);
    applied.push(item);
  }
  return { applied, untouched: plan.untouched };
}
