import { normalizeProject, type Project } from './projects.js';
import { readTeamRoster, writeTeamRoster } from './team-rosters.js';
import { moveTegamiProject } from './tegami.js';

export type IdeaEdit = Partial<Pick<Project, 'title' | 'objective' | 'exit' | 'status' | 'ladder' | 'evidence'>>;
export type TeamProjectArea = 'inbox' | 'done' | 'backlog';

const areaProjects = (roster: Awaited<ReturnType<typeof readTeamRoster>>, area: TeamProjectArea): Project[] => {
  if (!roster) return [];
  return area === 'inbox' ? roster.projects : area === 'done' ? roster.done_projects : roster.backlog_projects;
};
const areaEdit = (area: TeamProjectArea, projects: Project[]) => area === 'inbox'
  ? { projects } : area === 'done' ? { done_projects: projects } : { backlog_projects: projects };

const projectId = (team: string, stated: string): string => {
  const value = stated.trim();
  return value.includes('/') ? value : `${team}/${value}`;
};

const issuerTail = new Map<string, Promise<void>>();
async function withTeamIssuer<T>(team: string, action: () => Promise<T>): Promise<T> {
  const prior = issuerTail.get(team) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => { release = resolve; });
  const tail = prior.then(() => turn);
  issuerTail.set(team, tail);
  await prior;
  try { return await action(); }
  finally {
    release();
    if (issuerTail.get(team) === tail) issuerTail.delete(team);
  }
}

export async function writeTeamIdea(team: string, statedId: string | undefined, edit: IdeaEdit): Promise<{
  created: boolean;
  project: Project;
}> {
  return withTeamIssuer(team, async () => {
  const roster = await readTeamRoster(team);
  if (!roster) throw new Error(`Team "${team}" has no roster.`);
  const created = !statedId;
  const id = statedId ? projectId(team, statedId) : `${team}/${roster.next_project_id}`;
  if (!id.startsWith(`${team}/`)) throw new Error(`Project "${id}" does not belong to Team "${team}".`);
  const at = roster.projects.findIndex((project) => project.id === id);
  if (created && at !== -1) throw new Error(`Project "${id}" already exists.`);
  if (!created && at === -1) throw new Error(`Project "${id}" is not an idea in Team "${team}".`);
  const prior = at === -1 ? {
    id,
    title: '',
    objective: '',
    stage: 'IDEAS' as const,
    exit: 'lead' as const,
    status: 'yellow' as const,
    ladder: [{ stage: 'IDEAS' as const }],
    evidence: [],
  } : roster.projects[at];
  const project = normalizeProject({ ...prior, ...edit, id, stage: 'IDEAS' });
  if (!project) throw new Error('An idea needs a title and the complete project shape.');
  const projects = [...roster.projects];
  if (at === -1) projects.push(project); else projects[at] = project;
  await writeTeamRoster(team, {
    projects,
    ...(created ? { next_project_id: roster.next_project_id + 1 } : {}),
  });
    return { created, project };
  });
}

export async function removeTeamIdea(team: string, statedId: string): Promise<Project> {
  const roster = await readTeamRoster(team);
  if (!roster) throw new Error(`Team "${team}" has no roster.`);
  const id = projectId(team, statedId);
  const project = roster.projects.find((entry) => entry.id === id);
  if (!project) throw new Error(`Project "${id}" is not an idea in Team "${team}".`);
  await writeTeamRoster(team, { projects: roster.projects.filter((entry) => entry.id !== id) });
  return project;
}

export async function restoreTeamIdea(team: string, value: Project): Promise<Project> {
  const roster = await readTeamRoster(team);
  if (!roster) throw new Error(`Team "${team}" has no roster.`);
  if (roster.projects.some((entry) => entry.id === value.id)) throw new Error(`Project "${value.id}" already exists in the roster.`);
  const project = normalizeProject({ ...value, stage: 'IDEAS' });
  if (!project || !project.id.startsWith(`${team}/`)) throw new Error(`Project does not belong to Team "${team}".`);
  await writeTeamRoster(team, { projects: [...roster.projects, project] });
  return project;
}

export type ProjectMover = (input:
  | { direction: 'place'; session: string; project: Project }
  | { direction: 'return'; session: string; projectId: string }
) => Promise<{ project: Project; projectsRemaining: number; focus?: string }>;

const houseMove: ProjectMover = moveTegamiProject;

/** Issue an ID without creating a roster-held idea. Agent-authored projects use this
 * door before writing the complete project into their own work record. A failed later
 * write may leave a gap; IDs are monotonic identities, not a count of projects. */
export async function issueTeamProjectId(team: string): Promise<string> {
  return withTeamIssuer(team, async () => {
    const roster = await readTeamRoster(team);
    if (!roster) throw new Error(`Team "${team}" has no roster.`);
    const id = `${team}/${roster.next_project_id}`;
    await writeTeamRoster(team, { next_project_id: roster.next_project_id + 1 });
    return id;
  });
}

export async function assignTeamProject(team: string, statedId: string, session: string, move: ProjectMover = houseMove): Promise<Project> {
  return withTeamIssuer(team, async () => {
  const roster = await readTeamRoster(team);
  if (!roster) throw new Error(`Team "${team}" has no roster.`);
  const id = projectId(team, statedId);
  const at = roster.projects.findIndex((project) => project.id === id);
  if (at < 0) throw new Error(`Project "${id}" is not an idea in Team "${team}".`);
  const project = roster.projects[at]!;
  await move({ direction: 'place', session, project });
  try {
    await writeTeamRoster(team, { projects: roster.projects.filter((entry) => entry.id !== id) });
  } catch (error) {
    await move({ direction: 'return', session, projectId: id }).catch(() => undefined);
    throw error;
  }
  return project;
  });
}

export async function moveTeamProject(team: string, statedId: string, to: TeamProjectArea): Promise<{ project: Project; from: TeamProjectArea }> {
  const roster = await readTeamRoster(team);
  if (!roster) throw new Error(`Team "${team}" has no roster.`);
  const id = projectId(team, statedId);
  const areas: TeamProjectArea[] = ['inbox', 'done', 'backlog'];
  const from = areas.find((area) => areaProjects(roster, area).some((project) => project.id === id));
  if (!from) throw new Error(`Project "${id}" is not held by Team "${team}".`);
  if (from === to) return { project: areaProjects(roster, from).find((project) => project.id === id)!, from };
  const project = areaProjects(roster, from).find((entry) => entry.id === id)!;
  await writeTeamRoster(team, {
    ...areaEdit(from, areaProjects(roster, from).filter((entry) => entry.id !== id)),
    ...areaEdit(to, [...areaProjects(roster, to), project]),
  });
  return { project, from };
}

export async function returnTeamProject(team: string, statedId: string, session: string, area: TeamProjectArea = 'inbox', move: ProjectMover = houseMove): Promise<{
  project: Project;
  projectsRemaining: number;
  focus?: string;
}> {
  const roster = await readTeamRoster(team);
  if (!roster) throw new Error(`Team "${team}" has no roster.`);
  const id = projectId(team, statedId);
  if (['inbox', 'done', 'backlog'].some((name) => areaProjects(roster, name as TeamProjectArea).some((entry) => entry.id === id))) throw new Error(`Project "${id}" is already in the roster.`);
  const moved = await move({ direction: 'return', session, projectId: id });
  const project = moved.project;
  try {
    await writeTeamRoster(team, areaEdit(area, [...areaProjects(roster, area), project]));
  } catch (error) {
    await move({ direction: 'place', session, project: moved.project }).catch(() => undefined);
    throw error;
  }
  return { project, projectsRemaining: moved.projectsRemaining, focus: moved.focus };
}
