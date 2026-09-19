import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import {
  CAPABILITY_CLASSES,
  availabilityReason,
  capabilityTools,
  checkRequirement,
  listCapabilities,
  parseToolsTable,
  renderCapabilitiesOverview,
  resolveCapabilities,
  type CapabilityFacts,
  type CapabilityRow,
} from '../src/capabilities.js';

const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const STOCK = path.join(REPO, 'ronin_catalogs', 'capabilities');

const none: CapabilityFacts = {
  arrangement: 'none', installations: new Set(), behaviours: new Set(),
  campaign: false, team: false, lead: false,
};
const everything = (tool: string) => Promise.resolve(tool !== 'absent_tool');

const row = (name: string, requires: string[], tools = '', klass: CapabilityRow['class'] = 'cowork'): CapabilityRow => ({
  name, origin: 'stock', shadowed: false, file: `/shelf/${name}.md`, label: name, blurb: `${name}?`, class: klass,
  tools: parseToolsTable(`# x\n\n## Tools\n\n| Tool | Authority | Teach | Help |\n|---|---|---|---|\n${tools}`),
  requires,
});

async function withUserCatalogs<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-capabilities-test-'));
  const previous = process.env.RONIN_CATALOGS_DIR;
  process.env.RONIN_CATALOGS_DIR = temp;
  try {
    return await run(temp);
  } finally {
    if (previous === undefined) delete process.env.RONIN_CATALOGS_DIR;
    else process.env.RONIN_CATALOGS_DIR = previous;
    await rm(temp, { recursive: true, force: true });
  }
}

test('every requirement word reads one launch fact, and an unknown word never holds', () => {
  const facts: CapabilityFacts = {
    arrangement: 'managed', installations: new Set(['ronin_services']), behaviours: new Set(['ronin_host']),
    campaign: true, team: true, lead: true,
  };
  for (const requirement of ['installation:ronin_services', 'behaviour:ronin_host', 'arrangement:managed', 'campaign', 'team', 'lead']) {
    assert.equal(checkRequirement(requirement, facts), '', `${requirement} holds`);
    assert.notEqual(checkRequirement(requirement, none), '', `${requirement} fails on the bare launch`);
  }
  assert.equal(checkRequirement('arrangement:checkout', { ...none, arrangement: 'checkout' }), '');
  assert.match(checkRequirement('arrangement:managed', { ...none, arrangement: 'checkout' }), /no managed arrangement/);
  assert.match(checkRequirement('installation:trello', facts), /installation trello is off/);
  assert.match(checkRequirement('behaviour:gbrain', facts), /behaviour gbrain is not selected/);
  assert.match(checkRequirement('lead', { ...facts, lead: false }), /not the Team lead/);
  // A misspelt requirement withdraws the bundle rather than teaching it to everyone.
  assert.match(checkRequirement('leader', facts), /unknown requirement "leader"/);
  assert.match(checkRequirement('arrangement:worktree', facts), /unknown arrangement/);
  // Listings that show what a bundle would teach pass everything; a birth never does.
  assert.equal(checkRequirement('leader', { ...none, everything: true }), '');
});

test('the tools table names actual tools: executable, operation, authority, priority and help, columns in any order', () => {
  const tools = parseToolsTable([
    '# Bundle', '', '- **label:** Bundle', '', 'Prose before the table.', '',
    '## Tools', '',
    '| Help | Teach | Tool | Authority |',
    '|---|---|---|---|',
    '| | priority | `session_check` | read: one live session |',
    '| `worktree-desk --help` | | `worktree-desk hand-in` | write |',
    '| | | — | |',
    '', 'Prose after the table, with a | pipe in it.',
  ].join('\n'));
  assert.deepEqual(tools, [
    { name: 'session_check', command: 'session_check', authority: 'read: one live session', priority: true, help: 'session_check --help' },
    { name: 'worktree-desk', command: 'worktree-desk hand-in', authority: 'write', priority: false, help: 'worktree-desk --help' },
  ]);
  assert.deepEqual(parseToolsTable('# No table\n\n- **label:** x\n'), []);
  assert.deepEqual(parseToolsTable('# Tools heading, no table\n\n## Tools\n\nnone\n'), []);
});

test('work context selects knowledge while Cowork tools stay available and feature tools follow enablement', async () => {
  const rows = [
    row('edges', [], '| `edges send` | write | priority | `edges --help` |\n| `edges read` | read | priority | |\n'),
    row('worktree-desk', ['arrangement:managed'], '| `worktree-desk status` | read | priority | |\n'),
    row('team', [], '| `session_create` | create | priority | |\n| `absent_tool` | write | priority | |\n'),
    row('host', ['behaviour:ronin_host', 'lead'], '| `host_survey` | read | priority | |\n', 'feature'),
    row('authority-only', ['team']),
  ];
  const bare = await resolveCapabilities({ ...none, arrangement: 'checkout' }, { rows, present: everything });
  assert.deepEqual(bare.map((item) => [item.name, item.selected, item.reason]), [
    ['edges', true, ''],
    ['worktree-desk', false, 'no managed arrangement'],
    ['team', true, ''],
    ['host', false, 'behaviour ronin_host is not selected'],
    ['authority-only', false, 'not on a Team'],
  ]);
  assert.deepEqual(capabilityTools(bare), ['edges', 'worktree-desk', 'session_create']);
  assert.deepEqual(bare[1].delivered, ['worktree-desk'], 'arrangement changes teaching, not Cowork tool availability');
  assert.deepEqual(bare[1].missing, []);
  assert.deepEqual(bare[2].delivered, ['session_create'], 'lead status changes teaching, not Cowork tool availability');
  assert.deepEqual(bare[2].missing, ['absent_tool']);
  assert.deepEqual(bare[3].delivered, [], 'a disabled feature does not project its tool');
  assert.match(availabilityReason(rows[3]!, { ...none, lead: true }), /behaviour ronin_host is not selected/,
    'work context cannot substitute for feature enablement');

  const lead = await resolveCapabilities(
    { arrangement: 'managed', installations: new Set(), behaviours: new Set(['ronin_host']), campaign: true, team: true, lead: true },
    { rows, present: everything },
  );
  assert.ok(lead.every((item) => item.selected), lead.map((item) => `${item.name}:${item.reason}`).join(' '));
  assert.deepEqual(capabilityTools(lead), ['edges', 'worktree-desk', 'session_create', 'host_survey']);
  const teamLead = lead.find((item) => item.name === 'team')!;
  assert.deepEqual(teamLead.delivered, ['session_create']);
  assert.deepEqual(teamLead.missing, ['absent_tool'], 'a listed tool the box lacks is recorded, never taught');
  const authorityOnly = lead.find((item) => item.name === 'authority-only')!;
  assert.equal(authorityOnly.selected, true);
  assert.deepEqual(authorityOnly.tools, []);

  const nonLeadWithHost = await resolveCapabilities(
    { ...none, behaviours: new Set(['ronin_host']) }, { rows, present: everything },
  );
  assert.deepEqual(nonLeadWithHost.find((item) => item.name === 'host')?.delivered, ['host_survey'],
    'lead changes feature teaching but does not withhold an enabled feature tool');
});

test('the overview is derived from selected knowledge, independent of universally available Cowork tools', async () => {
  const rows = [
    row('edges', [], '| `edges send` | write: one message | priority | `edges --help` |\n| `edges page` | read/write | | `edges --help` |\n'),
    row('team', [], '| `session_create` | create | priority | |\n| `absent_tool` | write | priority | |\n'),
    row('authority-only', []),
    row('worktree-desk', ['arrangement:managed'], '| `worktree-desk status` | read | priority | |\n'),
  ];
  const resolved = await resolveCapabilities({ ...none, lead: true, team: true }, { rows, present: everything });
  const text = renderCapabilitiesOverview(resolved);
  assert.match(text, /^# YOUR TOOLS/m);
  assert.match(text, /Built from this session’s capability documents\./);
  assert.match(text, /\*\*Help:\*\* `edges --help`/);
  const edgesAt = text.indexOf('### edges');
  const leadAt = text.indexOf('### team');
  const onlyAt = text.indexOf('### authority-only');
  assert.ok(edgesAt >= 0 && leadAt > edgesAt && onlyAt > leadAt, 'selected bundles in folder order');
  assert.doesNotMatch(text, /### worktree-desk/, 'an unselected bundle is not in the lesson');
  assert.ok(resolved.find((item) => item.name === 'worktree-desk')?.delivered.includes('worktree-desk'),
    'the unselected work-context document does not withhold its Cowork tool');
  const edges = text.slice(edgesAt, leadAt);
  assert.match(edges, /edges\?/, 'the blurb');
  assert.match(edges, /- \*\*Priority:\*\* `edges send` \(write\)/, "the authority is its first word; the clause stays in the document");
  assert.doesNotMatch(edges, /edges page/, 'a non-priority tool is left to --help');
  assert.match(edges, /- \*\*Help:\*\* `edges --help`/);
  assert.match(edges, /- \*\*Full document:\*\* `\/shelf\/edges\.md`/);
  const lead = text.slice(leadAt, onlyAt);
  assert.match(lead, /`session_create`/);
  assert.doesNotMatch(lead, /absent_tool/, 'a tool the box lacks is never advertised');
  assert.match(lead, /`session_create --help`/);
  const only = text.slice(onlyAt);
  assert.match(only, /none projected on this box yet — the document is the teaching/);
  assert.doesNotMatch(only, /Priority/);
  assert.match(renderCapabilitiesOverview([]), /No capability bundle was selected/);
});

test('the folder is the catalog: an owner file shadows a stock name whole, a new name is one more bundle, hidden withdraws', async () => {
  await withUserCatalogs(async (dir) => {
    await mkdir(path.join(dir, 'capabilities'), { recursive: true });
    await writeFile(path.join(dir, 'capabilities', 'edges.md'), '# Edges, mine\n- **label:** My edges\n- **requires:** team\n');
    await writeFile(path.join(dir, 'capabilities', 'trello.md'), [
      '# Trello', '- **label:** Trello', '- **class:** integration', '- **requires:** behaviour:trello', '',
      '## Tools', '', '| Tool | Authority | Teach |', '|---|---|---|', '| `trello_cards` | read | priority |', '',
    ].join('\n'));
    await writeFile(path.join(dir, 'capabilities', 'agent_session.md'), '# Gone\n- **hidden:** yes\n');
    const rows = await listCapabilities();
    const edges = rows.find((item) => item.name === 'edges')!;
    assert.equal(edges.origin, 'user');
    assert.equal(edges.shadowed, true);
    assert.equal(edges.label, 'My edges');
    assert.deepEqual(edges.requires, ['team']);
    assert.deepEqual(edges.tools, [], 'the shadow replaces the stock file whole, table included');
    const trello = rows.find((item) => item.name === 'trello')!;
    assert.equal(trello.class, 'integration');
    assert.deepEqual(trello.requires, ['behaviour:trello']);
    assert.equal(trello.tools[0]?.name, 'trello_cards');
    assert.ok(!rows.some((item) => item.name === 'agent_session'), 'hidden withdraws a stock definition');
    const resolved = await resolveCapabilities(
      { ...none, behaviours: new Set(['trello']) },
      { rows, present: async (tool) => tool === 'trello_cards' },
    );
    assert.equal(resolved.find((item) => item.name === 'trello')?.selected, true);
    assert.equal(resolved.find((item) => item.name === 'edges')?.reason, 'not on a Team');
    assert.deepEqual(capabilityTools(resolved), ['trello_cards']);
  });
});

test('the stock capability documents are well-formed and carry no retired vocabulary', async () => {
  const files = (await readdir(STOCK)).filter((name) => name.endsWith('.md') && name !== 'README.md').sort();
  assert.deepEqual(files, ['agent_session.md', 'cowork_team.md', 'edges.md', 'machine-settings.md', 'mika.md', 'ronin-host.md', 'work-record.md', 'worktree-desk.md']);
  const rows = await withUserCatalogs(() => listCapabilities());
  assert.deepEqual(rows.map((item) => item.name), ['edges', 'work-record', 'agent_session', 'worktree-desk', 'machine-settings', 'cowork_team', 'ronin-host', 'mika'], 'ordered by `order`');
  for (const item of rows) {
    const text = await readFile(item.file, 'utf8');
    assert.ok(item.label && item.blurb, `${item.name} has a label and a blurb`);
    assert.ok(CAPABILITY_CLASSES.includes(item.class), `${item.name} class`);
    assert.ok(item.tools.length > 0, `${item.name} groups at least one actual tool`);
    assert.doesNotMatch(text, /tejun|MACROS\.md|ACTIONS\.md|\+\w+:/, `${item.name} teaches no retired name`);
    assert.doesNotMatch(text, /initial revision|revision-aware|revision counter is|reclaim|park a project|a verdict of|the decider/i, `${item.name} carries no retired project field`);
    for (const requirement of item.requires) assert.equal(checkRequirement(requirement, { ...none, everything: false, arrangement: 'managed', installations: new Set(['x', 'ronin_services']), behaviours: new Set(['x', 'ronin_host', 'gbrain', 'trello', 'perplexity']), campaign: true, team: true, lead: true }), '', `${item.name} requires ${requirement}`);
    for (const tool of item.tools) assert.match(tool.name, /^[a-z][a-z0-9_-]*$/, `${item.name}: ${tool.command}`);
  }
  const by = Object.fromEntries(rows.map((item) => [item.name, item]));
  assert.deepEqual(by.edges.requires, []);
  assert.deepEqual(by['work-record'].requires, []);
  assert.deepEqual(by.agent_session.requires, []);
  assert.deepEqual(by['worktree-desk'].requires, []);
  assert.deepEqual(by['machine-settings'].requires, ['campaign']);
  assert.deepEqual(by.cowork_team.requires, []);
  assert.deepEqual(by['ronin-host'].requires, []);
  assert.deepEqual(by.mika.requires, ['installation:ronin_services']);
  assert.deepEqual(by.mika.tools.map((tool) => tool.name), ['mika']);
  assert.deepEqual(by['ronin-host'].tools.map((tool) => tool.name), ['ronin-host']);
  assert.equal(by['ronin-host'].tools[0]?.help, 'ronin-host --help');
  // Project create is first-class and priority. Session creation is universal; the Team
  // bundle names that boundary but does not duplicate the Session tool row.
  const priority = (name: string) => by[name].tools.filter((tool) => tool.priority).map((tool) => tool.command);
  assert.deepEqual(priority('work-record'), ['work-record update_record', 'work-record document add', 'work-record project create', 'work-record project read', 'work-record project write', 'work-record project return', 'work-record project backlog', 'work-record project done']);
  assert.deepEqual(priority('edges'), ['edges send', 'edges wipeboard', 'edges read', 'edges team']);
  assert.deepEqual(priority('worktree-desk'), ['worktree-desk status', 'worktree-desk sync', 'worktree-desk hand-in']);
  assert.deepEqual(priority('agent_session'), ['session_check', 'session_create']);
  assert.ok(by.agent_session.tools.some((tool) => tool.name === 'session_set'));
  assert.deepEqual(priority('cowork_team'), [
    'team roster read', 'team project create',
    'team project read', 'team project list', 'team project write',
    'team project assign', 'team project return', 'team project backlog',
    'team project done', 'team project restore', 'team member status',
  ]);
  assert.ok(!by.cowork_team.tools.some((tool) => tool.name === 'session_create'), 'Cowork Team does not duplicate Agent session creation');
  assert.match(await readFile(by['work-record'].file, 'utf8'), /Team roster issues its ID/);
  assert.match(await readFile(by['work-record'].file, 'utf8'), /Agents never choose or reuse IDs/);
  assert.match(await readFile(by['work-record'].file, 'utf8'), /`exit`[\s\S]*`none` · `agent` · `lead` · `user`[\s\S]*`status`[\s\S]*`green` · `yellow` · `red`/);
  assert.match(await readFile(by.cowork_team.file, 'utf8'), /Assign and return/);
  const machine = await readFile(by['machine-settings'].file, 'utf8');
  assert.match(machine, /canonical Campaign\/provider model\s+catalog used by the UI dropdowns/);
  assert.doesNotMatch(machine, /gpt-|claude-|gemini-|sonnet|opus/i, 'the capability carries no maintained model IDs');
});

test('optional capabilities are absent until their individual predicates hold', async () => {
  const rows = await withUserCatalogs(() => listCapabilities());
  const bare = await resolveCapabilities({ ...none, campaign: true }, { rows, present: async () => true });
  assert.equal(bare.find((row) => row.name === 'ronin-host')?.selected, true);
  assert.equal(bare.find((row) => row.name === 'mika')?.selected, false);
  const selected = await resolveCapabilities({ ...none, campaign: true,
    installations: new Set(['ronin_services']), behaviours: new Set() },
  { rows, present: async () => true });
  for (const name of ['ronin-host', 'mika']) {
    assert.equal(selected.find((row) => row.name === name)?.selected, true);
  }
});
