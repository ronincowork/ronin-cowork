import test from 'node:test';
import assert from 'node:assert/strict';
import { auditManagedState, type ManagedRepositoryObservation } from '../src/desks/managed-audit.js';
import type { LifecycleProjection, ManagedEventRead } from '../src/desks/lifecycle-ledger.js';

const projection: LifecycleProjection = {
  desks: [{ kind: 'desk', id: 'cowork:team/comp/live', path: '/w/live', owner_sessions: ['live'], owner_team: 'comp' }],
  assignments: [], receipts: [], promotions: [], quarantines: [], settlements: [], pending: [],
};
const cleanRepo = (): ManagedRepositoryObservation => ({
  repo: 'cowork', mode: 'managed', dev_tip: 'dev', team_tip: 'line', managed_paths: ['/w/live'], live_sessions: ['live'], publish_refs: ['dev', 'master'],
  desks: [{ id: 'cowork:team/comp/live', branch: 'team/comp/live', path: '/w/live', tip: 'tip', base_sha: 'dev', constructed_from_current_dev: true, mounted: true, contained_in_dev: false, dirty_files: [], owners: ['live'], dev_behind: 0, dev_ahead: 1, team_behind: 0, team_ahead: 0 }],
  refs: [{ name: 'team/comp/live', sha: 'tip', kind: 'desk', contained_in_dev: false }],
  release: { dev_sha: 'dev', stable_sha: 'old', working: 'dev', stable: 'master', open_pr: { base: 'master', head: 'dev', state: 'open' } },
});
const ledger: ManagedEventRead = { events: [], issues: [] };

test('clean managed state and rolling PR representation pass', () => {
  const result = auditManagedState({ ledger, projection, repositories: [cleanRepo()] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, { repositories: 1, excluded_checkouts: 0, errors: 0, notices: 0 });
});

test('fixture classifies all seven managed invariants and reports lag separately', () => {
  const repo = cleanRepo();
  repo.managed_paths = [];
  repo.live_sessions = [];
  repo.desks[0] = { ...repo.desks[0]!, base_sha: 'old-base', contained_in_dev: true, dirty_files: ['lost.txt'], dev_behind: 20, team_behind: 21 };
  repo.refs.push(
    { name: 'team/old/dev', sha: 'old', kind: 'team_line', contained_in_dev: true, remote: true },
    { name: 'team/comp/candidate', sha: 'candidate', kind: 'candidate', contained_in_dev: false },
  );
  repo.release.open_pr = null;
  const brokenLedger: ManagedEventRead = { events: [], issues: [{ repo: 'cowork', line: 2, code: 'predecessor_mismatch', detail: 'wrong predecessor' }] };
  const result = auditManagedState({ ledger: brokenLedger, projection, repositories: [repo] });
  const invariants = new Set(result.findings.map((item) => item.invariant));
  assert.deepEqual(invariants, new Set(['agreement', 'accounted_refs', 'lifecycle_closure', 'no_orphaned_edits', 'publish_boundary', 'release_represented']));
  assert.deepEqual(new Set(result.notices.map((item) => item.code)), new Set(['desk_lag', 'team_lag']));
  assert.equal(result.exit_code, 1);
});

test('current construction catches a non-current base when distance cannot explain it', () => {
  const repo = cleanRepo();
  repo.desks[0] = { ...repo.desks[0]!, base_sha: 'other', constructed_from_current_dev: false };
  const result = auditManagedState({ ledger, projection, repositories: [repo] });
  assert(result.findings.some((item) => item.invariant === 'current_construction' && item.code === 'base_not_current_dev'));
});

test('user-managed checkout Git is excluded even when it resembles managed residue', () => {
  const checkout = cleanRepo();
  checkout.repo = 'lab';
  checkout.mode = 'checkout';
  checkout.managed_paths = [];
  checkout.live_sessions = [];
  checkout.refs[0] = { ...checkout.refs[0]!, remote: true };
  checkout.release.open_pr = null;
  const result = auditManagedState({ ledger, projection, repositories: [checkout] });
  assert.equal(result.ok, true);
  assert.equal(result.summary.excluded_checkouts, 1);
  assert.deepEqual(result.findings, []);
});
