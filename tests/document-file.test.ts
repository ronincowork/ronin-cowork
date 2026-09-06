import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DocumentPathError, legacyDocumentPath, resolveDocumentFile } from '../src/document-file.js';
import type { ProjectRootInfo } from '../src/project-roots.js';

const rootInfo = (name: string, dir: string): ProjectRootInfo => ({
  name, dir, match: [], remit: '', docs: ['README.md'], plans: [], archived: false, campaign_id: '',
});

test('a root-relative Markdown document resolves inside its registered workspace folder', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'ronin-document-'));
  const file = path.join(base, 'notes', 'SOP.md');
  await mkdir(path.dirname(file));
  await writeFile(file, '# safe\n');
  assert.equal(await resolveDocumentFile('lab', 'notes/SOP.md', [rootInfo('lab', base)]), file);
});

test('document resolution refuses traversal and symlink escape', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'ronin-document-'));
  const base = path.join(parent, 'root');
  const outside = path.join(parent, 'outside.md');
  await mkdir(base);
  await writeFile(outside, '# outside\n');
  await symlink(outside, path.join(base, 'escape.md'));
  const roots = [rootInfo('lab', base)];
  await assert.rejects(resolveDocumentFile('lab', '../outside.md', roots), (error: unknown) => error instanceof DocumentPathError && error.status === 403);
  await assert.rejects(resolveDocumentFile('lab', 'escape.md', roots), (error: unknown) => error instanceof DocumentPathError && error.status === 403);
});

test('only existing Markdown files in active registered roots are editable', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'ronin-document-'));
  await writeFile(path.join(base, 'page.html'), '<p>view only</p>');
  const active = rootInfo('lab', base);
  await assert.rejects(resolveDocumentFile('lab', 'page.html', [active]), (error: unknown) => error instanceof DocumentPathError && error.status === 415);
  await assert.rejects(resolveDocumentFile('lab', 'missing.md', [active]), (error: unknown) => error instanceof DocumentPathError && error.status === 404);
  await assert.rejects(resolveDocumentFile('lab', 'page.html', [{ ...active, archived: true }]), (error: unknown) => error instanceof DocumentPathError && error.status === 403);
});

test('legacy Docs access remains byte-for-byte absolute and outside root policy', () => {
  assert.equal(legacyDocumentPath('/any/existing/docs/path.html'), '/any/existing/docs/path.html');
  assert.equal(legacyDocumentPath('/home/person/private-note.md'), '/home/person/private-note.md');
  assert.throws(() => legacyDocumentPath('relative.md'), (error: unknown) => error instanceof DocumentPathError && error.status === 400);
});
