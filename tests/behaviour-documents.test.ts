import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-behaviour-docs-'));
process.env.RONIN_WAYS_DIR = path.join(root, 'ways');

const {
  BehaviourDocumentError,
  createBehaviourDocument,
  readBehaviourDocument,
  updateBehaviourDocument,
} = await import('../src/behaviour-documents.js');

test('canonical hyphenated floor and conditional Behaviors are readable', async () => {
  const rows = await Promise.all([
    readBehaviourDocument('floor', 'cowork-agent'),
    readBehaviourDocument('floor', 'user-intro'),
    readBehaviourDocument('conditional', 'team-lead'),
  ]);
  assert.deepEqual(rows.map((row) => row.name), ['cowork-agent', 'user-intro', 'team-lead']);
  assert.ok(rows.every((row) => row.origin === 'stock'));
});

test('saving stock creates a whole-file owner shadow and never changes stock', async () => {
  const stock = await readBehaviourDocument('selected', 'write_it_down');
  assert.equal(stock.origin, 'stock');
  const text = stock.text.replace('Preserve decisions', 'Keep decisions');
  const saved = await createBehaviourDocument({ scope: 'selected', name: 'write_it_down', text, shadow: true });
  assert.equal(saved.origin, 'user');
  assert.equal(saved.shadowed, true);
  assert.equal(saved.text, text);
  assert.equal(await readFile(path.join(process.env.RONIN_WAYS_DIR!, 'selected', 'write_it_down.md'), 'utf8'), text);
});

test('Save As is create-only and rejects stock or owner collisions', async () => {
  const text = '# My Way\n\n- **label:** My Way\n- **scope:** selected\n\nWork this way.\n';
  const created = await createBehaviourDocument({ scope: 'selected', name: 'my_way', text });
  assert.equal(created.origin, 'user');
  await assert.rejects(() => createBehaviourDocument({ scope: 'selected', name: 'my_way', text }), (error: unknown) => error instanceof BehaviourDocumentError && error.status === 409);
  await assert.rejects(() => createBehaviourDocument({ scope: 'selected', name: 'buildout', text }), (error: unknown) => error instanceof BehaviourDocumentError && error.status === 409);
});

test('owner updates require the last read revision', async () => {
  const current = await readBehaviourDocument('selected', 'my_way');
  const next = await updateBehaviourDocument({ scope: 'selected', name: 'my_way', text: current.text.replace('Work this way.', 'Work carefully.'), revision: current.revision });
  assert.match(next.text, /Work carefully/);
  await assert.rejects(() => updateBehaviourDocument({ scope: 'selected', name: 'my_way', text: current.text, revision: current.revision }), (error: unknown) => error instanceof BehaviourDocumentError && error.status === 409);
});

test('identity, scope metadata, and symlink owner targets are refused', async () => {
  const text = '# Bad\n\n- **scope:** floor\n';
  await assert.rejects(() => createBehaviourDocument({ scope: 'selected', name: '../bad', text }), BehaviourDocumentError);
  await assert.rejects(() => createBehaviourDocument({ scope: 'selected', name: 'bad_scope', text }), BehaviourDocumentError);
  const selected = path.join(process.env.RONIN_WAYS_DIR!, 'selected');
  await mkdir(selected, { recursive: true });
  const outside = path.join(root, 'outside.md');
  await writeFile(outside, '# Outside\n- **scope:** selected\n');
  await symlink(outside, path.join(selected, 'linked.md'));
  await assert.rejects(() => updateBehaviourDocument({ scope: 'selected', name: 'linked', text: '# Linked\n- **scope:** selected\n', revision: 'x' }), (error: unknown) => error instanceof BehaviourDocumentError && error.status === 409);
});
