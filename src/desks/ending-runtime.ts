import { randomUUID } from 'node:crypto';
import { arrangementOf } from './arrangement.js';
import { closeDesk, discardDesk, handoffDesk } from './desk.js';
import { ignoreEnding, promptOwners, type EndingDispositionOps, type EndingDispositionResult } from './ending-disposition.js';
import { inspectEnding, type EndingPreflight, type EndingRequest, type EndingScope } from './ending.js';
import { appendManagedEvent, withManagedTransaction } from './lifecycle-ledger.js';
import { quarantineDesk } from './quarantine.js';
import { listDesks } from './registry.js';
import { attemptMessage, enqueueMessage } from '../message-queue.js';
import { listSessions } from '../tmux.js';

async function preflight(scope: EndingScope, subject: string, requested_action: EndingRequest): Promise<EndingPreflight> {
  const all = await listDesks(scope === 'team' ? { team: subject } : {});
  const desks = scope === 'team' ? all : all.filter((desk) => (desk.owners?.length ? desk.owners : [desk.session]).includes(subject));
  const sessions = await listSessions().catch(() => []);
  // A name is reachable only when the live row still carries its birth-recorded identity.
  const reachable = new Set(sessions.filter((session) => !!session.key).map((session) => session.name));
  return inspectEnding({
    scope, subject, requested_action,
    desks: await Promise.all(desks.map(async (desk) => ({
      ...desk,
      repo_dir: (await arrangementOf(desk.repo)).dir,
      owners: desk.owners?.length ? desk.owners : [desk.session],
    }))),
    ownerReachable: (owner) => reachable.has(owner),
  });
}

export const inspectSessionEnding = (session: string, requested_action: Exclude<EndingRequest, 'retire'>): Promise<EndingPreflight> =>
  preflight('session', session, requested_action);

export const inspectTeamEnding = (team: string): Promise<EndingPreflight> => preflight('team', team, 'retire');

function runtimeOps(preflight: EndingPreflight): EndingDispositionOps {
  return {
    async prompt(target, message) {
      const queued = await enqueueMessage(target, message, 'house');
      const retained = await attemptMessage(queued.id, 'safe');
      return { queued: retained !== null, id: queued.id };
    },
    async close(fact) {
      const outcome = await closeDesk(fact.repo, fact.branch);
      if (outcome.action !== 'closed') throw new Error(`could not close ${fact.repo}:${fact.branch}: ${outcome.reason}`);
    },
    async handoff(fact, owners) { await handoffDesk(fact.repo, fact.branch, owners); },
    async quarantineAndRemove(fact) {
      const transaction_id = `quarantine_${randomUUID()}`;
      return withManagedTransaction({
        repo: fact.repo, transaction_id, type: 'ending_inspected', result: 'started',
        session: preflight.scope === 'session' ? preflight.subject : '', team: fact.team,
        refs: [{ name: fact.branch, before: fact.tip, after: '' }],
        commits: fact.unique_commits.map((sha) => ({ role: 'quarantined', sha })),
        objects: [{ kind: 'desk', id: `${fact.repo}:${fact.branch}`, path: fact.worktree, owner_sessions: fact.owners, owner_team: fact.team }],
        detail: { scope: preflight.scope, requested_action: preflight.requested_action, changes: fact.changes },
      }, async (transaction) => {
        const manifest = await quarantineDesk(fact);
        await discardDesk(fact.repo, fact.branch);
        await transaction.finish('quarantined', 'quarantined', {
          objects: [
            { kind: 'quarantine', id: `${fact.repo}:${manifest.id}`, path: manifest.untracked_root, owner_sessions: fact.owners, owner_team: fact.team },
            { kind: 'desk', id: `${fact.repo}:${fact.branch}` },
            { kind: 'assignment', id: fact.assignment ?? '', owner_sessions: fact.owners, owner_team: fact.team },
          ],
          detail: { quarantine_id: manifest.id, manifest, quarantine_ref: manifest.quarantine_ref },
        });
        return { id: manifest.id, manifest: `${fact.repo}/${manifest.id}/manifest.json` };
      });
    },
    async event(type, fact, detail) {
      if (type !== 'closeout_prompted') return; // close/handoff/quarantine record within their mutation transaction
      await appendManagedEvent({
        repo: fact.repo, transaction_id: `prompt_${randomUUID()}`, type, result: 'completed',
        session: preflight.scope === 'session' ? preflight.subject : '', team: fact.team,
        refs: [], commits: fact.unique_commits.map((sha) => ({ role: 'pending_closeout', sha })),
        objects: [{ kind: 'desk', id: `${fact.repo}:${fact.branch}`, path: fact.worktree, owner_sessions: fact.owners, owner_team: fact.team }],
        detail,
      });
    },
  };
}

export async function promptEnding(preflight: EndingPreflight): Promise<{ result: EndingDispositionResult; preflight: EndingPreflight }> {
  const result = await promptOwners(preflight, runtimeOps(preflight));
  const refreshed = await preflightAgain(preflight);
  return { result, preflight: refreshed };
}

export async function ignoreEndingRequest(preflight: EndingPreflight): Promise<EndingDispositionResult> {
  return ignoreEnding(preflight, runtimeOps(preflight));
}

const preflightAgain = (value: EndingPreflight): Promise<EndingPreflight> =>
  value.scope === 'team'
    ? inspectTeamEnding(value.subject)
    : inspectSessionEnding(value.subject, value.requested_action as Exclude<EndingRequest, 'retire'>);
