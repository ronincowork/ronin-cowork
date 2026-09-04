export interface RepoBranchSelector { repo: string; branch: string }

/** Parse the Agent-facing repo or repo:branch spelling. Branches may themselves contain colons. */
export function parseRepoBranchSelector(value: string): RepoBranchSelector {
  const colon = value.indexOf(':');
  if (colon < 0) return { repo: value, branch: '' };
  return { repo: value.slice(0, colon), branch: value.slice(colon + 1) };
}

export function matchesRepoBranchSelector(
  desk: { repo: string; branch: string },
  selector: RepoBranchSelector,
): boolean {
  return desk.repo === selector.repo && (!selector.branch || desk.branch === selector.branch);
}
