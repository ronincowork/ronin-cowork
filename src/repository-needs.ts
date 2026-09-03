/** The setup task created when managed coordination meets a root with no repository. */
export function repositoryNeeds(
  set: Record<string, unknown>,
  status: Record<string, unknown>,
): Array<{ leaf: string; needs: string; how: string; met_by: 'agent' }> {
  if ((set.desks as { new_project?: string } | undefined)?.new_project !== 'managed') return [];
  return ((status.projects as Array<{ name: string; dir: string; repo: string }> | undefined) ?? [])
    .filter((project) => project.repo === 'no repo')
    .map((project) => ({
      leaf: 'desks.new_project',
      needs: `${project.name} needs a local Git repository to allow Ronin Worktrees`,
      how: `run ronin-repo-init ${project.dir} — it initializes locally and never assumes a remote`,
      met_by: 'agent' as const,
    }));
}
