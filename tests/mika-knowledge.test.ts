import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compileMikaKnowledgeAt, MIKA_INDEX_BUDGET, MIKA_TAXONOMY, openMikaSourceAt, parseMikaTaxonomy } from '../src/mika-knowledge.js';

async function markdownIds(root: string, relative = ''): Promise<string[]> {
  const ids: string[] = [];
  const rows = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const row of rows.sort((a, b) => Buffer.from(a.name).compare(Buffer.from(b.name)))) {
    if (row.name.startsWith('.') || row.isSymbolicLink()) continue;
    const next = relative ? `${relative}/${row.name}` : row.name;
    if (row.isDirectory()) ids.push(...await markdownIds(root, next));
    else if (row.isFile() && row.name.toLowerCase().endsWith('.md')) ids.push(next);
  }
  return ids;
}

const taxonomy = `schema = 1
[[node]]
id = "guide"
label = "Guides"
root = "docs"
[[node]]
id = "procedures"
label = "Procedures"
root = "ronin_catalogs/behaviours"
`;

test('Mika taxonomy is structure, not authored answer content', () => {
  assert.deepEqual(parseMikaTaxonomy(taxonomy), [
    { id: 'guide', label: 'Guides', root: 'docs' },
    { id: 'procedures', label: 'Procedures', root: 'ronin_catalogs/behaviours' },
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
    await mkdir(path.join(stock, 'ronin_catalogs/behaviours'), { recursive: true });
    await mkdir(path.join(owner, 'docs', 'nested'), { recursive: true });
    await writeFile(tax, taxonomy);
    await writeFile(path.join(stock, 'docs', 'alpha.md'), '# Alpha\n\nStock sentence.\n\n## More\nRest.');
    await writeFile(path.join(stock, 'docs', 'nested', 'beta.md'), '# Beta\n\nBeta sentence is useful.');
    await writeFile(path.join(stock, 'ronin_catalogs/behaviours', 'house.md'), '# House\n\nHouse procedure.');
    await writeFile(path.join(owner, 'docs', 'alpha.md'), '# Owner Alpha\n\nOwner sentence wins.');
    await writeFile(path.join(owner, 'docs', 'nested', 'new.md'), '# New\n\nOwner-only sentence.');
    await symlink(path.join(stock, 'ronin_catalogs/behaviours', 'house.md'), path.join(owner, 'docs', 'escape.md'));

    const built = await compileMikaKnowledgeAt(out, {
      taxonomy: tax, stockRoot: stock,
      ownerRoots: { docs: path.join(owner, 'docs'), 'ronin_catalogs/behaviours': path.join(owner, 'ronin_catalogs/behaviours') },
    });
    assert.deepEqual(built.entries.map((row) => row.id), [
      'docs/alpha.md', 'docs/nested/beta.md', 'docs/nested/new.md', 'ronin_catalogs/behaviours/house.md',
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
    await mkdir(path.join(stock, 'ronin_catalogs/behaviours'), { recursive: true });
    await writeFile(tax, taxonomy);
    const source = path.join(stock, 'docs', 'one.md');
    await writeFile(source, '# One\n\nFirst generation.');
    const first = await compileMikaKnowledgeAt(out, { taxonomy: tax, stockRoot: stock, ownerRoots: { docs: '', 'ronin_catalogs/behaviours': '' } });
    await writeFile(source, '# One\n\nSecond generation.');
    const second = await compileMikaKnowledgeAt(out, { taxonomy: tax, stockRoot: stock, ownerRoots: { docs: '', 'ronin_catalogs/behaviours': '' } });
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
    await mkdir(path.join(stock, 'ronin_catalogs/behaviours'), { recursive: true });
    await mkdir(path.join(out, 'mika-knowledge-current'), { recursive: true });
    await writeFile(tax, taxonomy);
    await writeFile(path.join(stock, 'docs', 'one.md'), '# One\n\nOne sentence.');
    await assert.rejects(compileMikaKnowledgeAt(out, {
      taxonomy: tax, stockRoot: stock, ownerRoots: { docs: '', 'ronin_catalogs/behaviours': '' },
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
    await mkdir(path.join(stock, 'ronin_catalogs/behaviours'), { recursive: true });
    await writeFile(tax, taxonomy);
    for (let i = 0; i < 8; i++) await writeFile(path.join(stock, 'docs', `${i}.md`), `# Document ${i}\n\n${'word '.repeat(80)}end.`);
    const built = await compileMikaKnowledgeAt(out, {
      taxonomy: tax, stockRoot: stock, ownerRoots: { docs: '', 'ronin_catalogs/behaviours': '' },
      budget: { bytes: 1_500, lines: 40, previewBytes: 160, minimumPreviewBytes: 24 },
    });
    assert.equal(built.entries.length, 8);
    assert.ok(built.previewBytes < 160);
    for (let i = 0; i < 8; i++) assert.match(await readFile(built.index, 'utf8'), new RegExp(`docs/${i}\\.md`));
    await assert.rejects(compileMikaKnowledgeAt(path.join(temp, 'fail'), {
      taxonomy: tax, stockRoot: stock, ownerRoots: { docs: '', 'ronin_catalogs/behaviours': '' },
      budget: { bytes: 100, lines: 40, previewBytes: 24, minimumPreviewBytes: 24 },
    }), /cannot fit all 8 sources/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('the stock taxonomy discovers the complete approved set within the hard index budget', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-stock-'));
  try {
    const stockRoot = fileURLToPath(new URL('..', import.meta.url));
    const nodes = parseMikaTaxonomy(await readFile(MIKA_TAXONOMY, 'utf8'));
    const approved = (await Promise.all(nodes.map(async (node) => {
      const delegated = nodes.map((other) => other.root)
        .filter((root) => root.startsWith(`${node.root}/`))
        .map((root) => root.slice(node.root.length + 1));
      return (await markdownIds(path.join(stockRoot, node.root)))
        .filter((relative) => !delegated.some((root) => relative === root || relative.startsWith(`${root}/`)))
        .map((relative) => `${node.root}/${relative}`);
    }))).flat()
      .filter((id) => !id.startsWith('ronin_session_boot/routine/mika/'));
    const built = await compileMikaKnowledgeAt(temp, { ownerRoots: {
      docs: '', 'ronin_catalogs/behaviours': '', ronin_catalogs: '', ronin_session_boot: '', ronin_library: '',
    } });
    assert.deepEqual(built.entries.map((row) => row.id), approved);
    // Her own house folder is read whole at birth, never indexed as a source.
    assert.ok(built.entries.every((row) => !row.id.startsWith('ronin_session_boot/routine/mika/')));
    assert.ok(built.bytes <= MIKA_INDEX_BUDGET.bytes, `${built.bytes} index bytes`);
    assert.ok(built.lines <= MIKA_INDEX_BUDGET.lines, `${built.lines} index lines`);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
