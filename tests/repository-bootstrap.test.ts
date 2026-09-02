import test from 'node:test';
import assert from 'node:assert/strict';
import { repositoryNeeds } from '../src/repository-needs.js';

const projects = [
  { name: 'plain', dir: '/work/plain', repo: 'no repo' },
  { name: 'ready', dir: '/work/ready', repo: 'repo — local only' },
];

test('Control plus a non-repository becomes one agent task', () => {
  assert.deepEqual(repositoryNeeds({ desks: { new_project: 'managed' } }, { projects }), [{
    leaf: 'desks.new_project',
    needs: 'plain needs a local Git repository for managed file coordination',
    how: 'run ronin-repo-init /work/plain — it initializes locally and never assumes a remote',
    met_by: 'agent',
  }]);
});

test('the task is absent when Control is off or every root is a repository', () => {
  assert.deepEqual(repositoryNeeds({ desks: { new_project: 'none' } }, { projects }), []);
  assert.deepEqual(repositoryNeeds({ desks: { new_project: 'managed' } }, { projects: projects.slice(1) }), []);
});
