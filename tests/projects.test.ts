import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProject,
  PROJECT_EXITS,
  PROJECT_STAGES,
  PROJECT_STATUSES,
} from '../src/projects.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const project = {
  id: 'virtual-kanban/7',
  title: 'Kanban tab',
  objective: 'Team commons renders the projects.',
  stage: 'BUILDING',
  exit: 'user',
  status: 'green',
  ladder: [
    { stage: 'PLANNING', legs: [{ title: 'Plan agreed', done: true }] },
    { stage: 'LANDING' },
  ],
  evidence: ['commit 4f1e2c9'],
};

test('the canonical project shape keeps every authored field and has no owner machinery', () => {
  assert.deepEqual(normalizeProject(project), project);
  assert.deepEqual(PROJECT_STAGES, ['IDEAS', 'PLANNING', 'BUILDING', 'LANDING', 'DONE']);
  assert.deepEqual(PROJECT_EXITS, ['none', 'agent', 'lead', 'user']);
  assert.deepEqual(PROJECT_STATUSES, ['green', 'yellow', 'red']);
  assert.equal('owner' in normalizeProject(project)!, false);
});

test('malformed projects are absent instead of becoming partial cards', () => {
  assert.equal(normalizeProject({ ...project, stage: 'BACKLOG' }), null);
  assert.equal(normalizeProject({ ...project, exit: 'reviewer' }), null);
  assert.equal(normalizeProject({ ...project, status: 'blue' }), null);
  assert.equal(normalizeProject({ ...project, ladder: [{ stage: 'BUILDING', legs: [{ title: 'x', done: 'yes' }] }] }), null);
  assert.equal(normalizeProject({ ...project, evidence: ['commit ok', 7] }), null);
});

test('the house places and returns whole projects without injecting an Agent reminder', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-project-move-'));
  process.env.RONIN_SESSION_DIR = root;
  const { moveTegamiProject } = await import(`../src/tegami.js?move=${Date.now()}`);
  const dir = path.join(root, 'worker');
  const file = path.join(dir, 'tegami.md');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, '# TEGAMI\n\n```json\n{"objective":"keep","projects":[],"ladder":[]}\n```\n');
  const placed = await moveTegamiProject({ direction: 'place', session: 'worker', project });
  assert.deepEqual(placed, { project, projectsRemaining: 1, focus: project.id });
  assert.match(await fs.readFile(file, 'utf8'), /"objective": "keep"/);

  const other = { ...project, id: 'virtual-kanban/8', title: 'Next' };
  await moveTegamiProject({ direction: 'place', session: 'worker', project: other });
  const current = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, current.replace(/"ladder": \[\]/, `"at": {"project":"${project.id}","rung":2,"leg":1}, "ladder": []`));
  const returned = await moveTegamiProject({ direction: 'return', session: 'worker', projectId: project.id });
  assert.deepEqual(returned, { project, projectsRemaining: 1, focus: other.id });
  const body = JSON.parse((await fs.readFile(file, 'utf8')).match(/```json\n([\s\S]*?)\n```/)![1]);
  assert.deepEqual(body.at, { project: other.id });
});
