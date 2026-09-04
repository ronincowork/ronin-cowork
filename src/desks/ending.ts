import { git, gitOut, isAncestor } from './git.js';

export type EndingScope = 'session' | 'team';
export type EndingRequest = 'archive' | 'delete' | 'hard_delete' | 'retire';

export interface EndingDeskInput {
  repo: string;
  branch: string;
  line: string;
  repo_dir: string;
  worktree: string;
  mounted: boolean;
  tip: string;
  line_tip: string;
  owners: string[];
  team: string;
  pending_transaction?: string;
  last_hand_in?: string;
}

export interface EndingChanges {
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface EndingDeskFact extends EndingDeskInput {
  living_owners: string[];
  changes: EndingChanges;
  unique_commits: string[];
  contained: boolean;
  unresolved: boolean;
  last_living_owner: boolean;
}

export interface EndingPreflight {
  scope: EndingScope;
  subject: string;
  requested_action: EndingRequest;
  desks: EndingDeskFact[];
  unresolved: EndingDeskFact[];
  prompt_targets: string[];
  choices: Array<'prompt' | 'ignore'>;
}

function addUnique(out: string[], value: string): void {
  if (value && !out.includes(value)) out.push(value);
}

export function parsePorcelainZ(raw: string): EndingChanges {
  const changes: EndingChanges = { staged: [], unstaged: [], untracked: [] };
  const rows = raw.split('\0');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;
    const x = row[0];
    const y = row[1];
    let file = row.slice(3);
    if ((x === 'R' || x === 'C') && rows[i + 1]) file = rows[++i];
    if (x === '?' && y === '?') addUnique(changes.untracked, file);
    else {
      if (x !== ' ' && x !== '?') addUnique(changes.staged, file);
      if (y !== ' ' && y !== '?') addUnique(changes.unstaged, file);
    }
  }
  return changes;
}

async function changesOf(desk: EndingDeskInput): Promise<EndingChanges> {
  if (!desk.mounted) return { staged: [], unstaged: [], untracked: [] };
  const raw = (await git(desk.worktree, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout;
  return parsePorcelainZ(raw);
}

async function uniqueCommits(desk: EndingDeskInput): Promise<string[]> {
  if (!desk.tip || !desk.line_tip) return desk.tip ? [desk.tip] : [];
  const raw = await gitOut(desk.repo_dir, ['rev-list', '--reverse', `${desk.line_tip}..${desk.tip}`]).catch(() => '');
  return raw.split('\n').filter(Boolean);
}

export async function inspectEnding(input: {
  scope: EndingScope;
  subject: string;
  requested_action: EndingRequest;
  desks: EndingDeskInput[];
  ownerReachable: (session: string) => boolean | Promise<boolean>;
}): Promise<EndingPreflight> {
  const facts: EndingDeskFact[] = [];
  for (const desk of input.desks) {
    const owners = [...new Set(desk.owners.filter(Boolean))];
    const living_owners: string[] = [];
    for (const owner of owners) if (await input.ownerReachable(owner)) living_owners.push(owner);
    const [changes, commits, contained] = await Promise.all([
      changesOf(desk),
      uniqueCommits(desk),
      desk.tip && desk.line_tip ? isAncestor(desk.repo_dir, desk.tip, desk.line_tip) : Promise.resolve(false),
    ]);
    const dirty = changes.staged.length + changes.unstaged.length + changes.untracked.length > 0;
    const unresolved = dirty || commits.length > 0 || !!desk.pending_transaction;
    facts.push({
      ...desk, owners, living_owners, changes, unique_commits: commits, contained,
      unresolved, last_living_owner: unresolved && living_owners.length <= 1,
    });
  }
  const unresolved = facts.filter((fact) => fact.unresolved);
  const prompt_targets = [...new Set(unresolved.flatMap((fact) => fact.living_owners))];
  return {
    scope: input.scope, subject: input.subject, requested_action: input.requested_action,
    desks: facts, unresolved, prompt_targets, choices: unresolved.length ? ['prompt', 'ignore'] : [],
  };
}

export function closeoutMessage(preflight: EndingPreflight, target: string): string {
  const owned = preflight.unresolved.filter((desk) => desk.living_owners.includes(target));
  const lines = owned.map((desk) => {
    const files = [...new Set([...desk.changes.staged, ...desk.changes.unstaged, ...desk.changes.untracked])];
    const details = [
      desk.unique_commits.length ? `${desk.unique_commits.length} unique commit(s): ${desk.unique_commits.join(', ')}` : '',
      files.length ? `files: ${files.join(', ')}` : '',
      desk.pending_transaction ? `pending transaction: ${desk.pending_transaction}` : '',
    ].filter(Boolean).join('; ');
    return `- ${desk.repo}:${desk.branch}${details ? ` — ${details}` : ''}`;
  });
  return [
    `Ronin is preparing to ${preflight.requested_action.replace('_', ' ')} ${preflight.scope} ${preflight.subject}.`,
    'Please hand in, hand off, close, or explicitly discard the named work, then report completion:',
    ...lines,
  ].join('\n');
}
