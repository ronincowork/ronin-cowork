import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { compileMikaKnowledgeAt, MIKA_INDEX_BUDGET, openMikaSourceAt, parseMikaTaxonomy } from '../src/mika-knowledge.js';

const taxonomy = `schema = 1
[[node]]
id = "guide"
label = "Guides"
root = "docs"
[[node]]
id = "procedures"
label = "Procedures"
root = "ronin_sops"
`;

test('Mika taxonomy is structure, not authored answer content', () => {
  assert.deepEqual(parseMikaTaxonomy(taxonomy), [
    { id: 'guide', label: 'Guides', root: 'docs' },
    { id: 'procedures', label: 'Procedures', root: 'ronin_sops' },
  ]);
  assert.throws(() => parseMikaTaxonomy('schema = 1\n[[node]]\nid = "bad/path"'), /safe id/);
});

test('Mika index contains every resolved source, owner wins, and shelf opens only minted snapshots', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-knowledge-'));
  const stock = path.join(temp, 'stock');
  const owner = path.join(temp, 'owner');
  const out = path.join(temp, 'out');
  const tax = path.join(temp, 'taxonomy.toml');
  try {
    await mkdir(path.join(stock, 'docs', 'nested'), { recursive: true });
    await mkdir(path.join(stock, 'ronin_sops'), { recursive: true });
    await mkdir(path.join(owner, 'docs', 'nested'), { recursive: true });
    await writeFile(tax, taxonomy);
    await writeFile(path.join(stock, 'docs', 'alpha.md'), '# Alpha\n\nStock sentence.\n\n## More\nRest.');
    await writeFile(path.join(stock, 'docs', 'nested', 'beta.md'), '# Beta\n\nBeta sentence is useful.');
    await writeFile(path.join(stock, 'ronin_sops', 'house.md'), '# House\n\nHouse procedure.');
    await writeFile(path.join(owner, 'docs', 'alpha.md'), '# Owner Alpha\n\nOwner sentence wins.');
    await writeFile(path.join(owner, 'docs', 'nested', 'new.md'), '# New\n\nOwner-only sentence.');
    await symlink(path.join(stock, 'ronin_sops', 'house.md'), path.join(owner, 'docs', 'escape.md'));

    const built = await compileMikaKnowledgeAt(out, {
      taxonomy: tax, stockRoot: stock,
      ownerRoots: { docs: path.join(owner, 'docs'), ronin_sops: path.join(owner, 'ronin_sops') },
    });
    assert.deepEqual(built.entries.map((row) => row.id), [
      'docs/alpha.md', 'docs/nested/beta.md', 'docs/nested/new.md', 'ronin_sops/house.md',
    ]);
    assert.equal(built.entries[0].origin, 'owner');
    const index = await readFile(built.index, 'utf8');
    assert.match(index, /Owner Alpha/);
    assert.match(index, /Owner sentence wins\./);
    assert.doesNotMatch(index, /Stock sentence/);
    assert.doesNotMatch(index, /escape\.md/);
    assert.ok(built.bytes <= MIKA_INDEX_BUDGET.bytes);
    assert.ok(built.lines <= MIKA_INDEX_BUDGET.lines);

    const opened = await openMikaSourceAt(out, 'mika-source:docs/alpha.md');
    assert.match(opened.text, /Owner sentence wins/);
    await assert.rejects(openMikaSourceAt(out, 'docs/alpha.md'), /Unknown Mika source/);
    await assert.rejects(openMikaSourceAt(out, 'mika-source:../alpha.md'), /Unknown Mika source/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('Mika publishes one internally consistent generation and removes the stale one', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-generation-'));
  const stock = path.join(temp, 'stock');
  const out = path.join(temp, 'out');
  const tax = path.join(temp, 'taxonomy.toml');
  try {
    await mkdir(path.join(stock, 'docs'), { recursive: true });
    await mkdir(path.join(stock, 'ronin_sops'), { recursive: true });
    await writeFile(tax, taxonomy);
    const source = path.join(stock, 'docs', 'one.md');
    await writeFile(source, '# One\n\nFirst generation.');
    const first = await compileMikaKnowledgeAt(out, { taxonomy: tax, stockRoot: stock, ownerRoots: { docs: '', ronin_sops: '' } });
    await writeFile(source, '# One\n\nSecond generation.');
    const second = await compileMikaKnowledgeAt(out, { taxonomy: tax, stockRoot: stock, ownerRoots: { docs: '', ronin_sops: '' } });
    assert.notEqual(path.dirname(first.index), path.dirname(second.index));
    await assert.rejects(readFile(first.index, 'utf8'), /ENOENT/);
    assert.equal((await readdir(out)).filter((name) => name.startsWith('mika-knowledge-')).length, 2,
      'one generation directory plus its current pointer remain');
    assert.match((await openMikaSourceAt(out, 'mika-source:docs/one.md')).text, /Second generation/);

    await chmod(second.index, 0o600);
    await writeFile(second.index, '# tampered index\n');
    await assert.rejects(openMikaSourceAt(out, 'mika-source:docs/one.md'), /index and manifest do not match/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('a failed publication leaves no partial generation visible', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-partial-'));
  const stock = path.join(temp, 'stock');
  const out = path.join(temp, 'out');
  const tax = path.join(temp, 'taxonomy.toml');
  try {
    await mkdir(path.join(stock, 'docs'), { recursive: true });
    await mkdir(path.join(stock, 'ronin_sops'), { recursive: true });
    await mkdir(path.join(out, 'mika-knowledge-current'), { recursive: true });
    await writeFile(tax, taxonomy);
    await writeFile(path.join(stock, 'docs', 'one.md'), '# One\n\nOne sentence.');
    await assert.rejects(compileMikaKnowledgeAt(out, {
      taxonomy: tax, stockRoot: stock, ownerRoots: { docs: '', ronin_sops: '' },
    }));
    assert.deepEqual((await readdir(out)).sort(), ['mika-knowledge-current']);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('Mika index shrinks every preview mechanically and never omits a source', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-budget-'));
  const stock = path.join(temp, 'stock');
  const out = path.join(temp, 'out');
  const tax = path.join(temp, 'taxonomy.toml');
  try {
    await mkdir(path.join(stock, 'docs'), { recursive: true });
    await mkdir(path.join(stock, 'ronin_sops'), { recursive: true });
    await writeFile(tax, taxonomy);
    for (let i = 0; i < 8; i++) await writeFile(path.join(stock, 'docs', `${i}.md`), `# Document ${i}\n\n${'word '.repeat(80)}end.`);
    const built = await compileMikaKnowledgeAt(out, {
      taxonomy: tax, stockRoot: stock, ownerRoots: { docs: '', ronin_sops: '' },
      budget: { bytes: 1_500, lines: 40, previewBytes: 160, minimumPreviewBytes: 24 },
    });
    assert.equal(built.entries.length, 8);
    assert.ok(built.previewBytes < 160);
    for (let i = 0; i < 8; i++) assert.match(await readFile(built.index, 'utf8'), new RegExp(`docs/${i}\\.md`));
    await assert.rejects(compileMikaKnowledgeAt(path.join(temp, 'fail'), {
      taxonomy: tax, stockRoot: stock, ownerRoots: { docs: '', ronin_sops: '' },
      budget: { bytes: 100, lines: 40, previewBytes: 24, minimumPreviewBytes: 24 },
    }), /cannot fit all 8 sources/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('the stock taxonomy discovers the complete approved set within the hard index budget', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-stock-'));
  try {
    const built = await compileMikaKnowledgeAt(temp, { ownerRoots: {
      docs: '', ronin_sops: '', ronin_catalogs: '', ronin_session_boot: '', ronin_library: '',
    } });
    assert.equal(built.entries.length, 145);
    assert.ok(built.entries.some((row) => row.id === 'ronin_session_boot/house/mika/START_HERE.md'));
    assert.ok(built.entries.every((row) => row.id !== 'ronin_catalogs/MIKA_MACROS.md'));
    assert.ok(built.bytes <= MIKA_INDEX_BUDGET.bytes, `${built.bytes} index bytes`);
    assert.ok(built.lines <= MIKA_INDEX_BUDGET.lines, `${built.lines} index lines`);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
