import { access } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, storeDir } from './resources.js';
import { readDefinitions, splitDefinitionList, type Definition } from './resource-adapters.js';
import type { Origin } from './resources.js';

/**
 * CAPABILITY BUNDLES — the folder-driven tool teaching (AGENT_MACRO_TOOL_BUNDLES, 2026-09-13).
 *
 * One authored Markdown file per bundle in `ronin_catalogs/capabilities/` (the owner's
 * `<catalogs store>/capabilities/` shadows a name whole and adds new ones). Each file is a
 * definition — `- **key:** value` lines under its title — then a `## Tools` table naming
 * the actual tools with their authority, whether they are taught at birth, and their help
 * route, then the full teaching. Nothing here knows a bundle by name: the folder is the
 * catalog; core and conditional Agent capabilities use the same format and select their
 * teaching through their own `requires:` line.
 *
 * A capability is a document grouping, not an executable. It lists one or more actual
 * tools that answer its question, and a tool may be surfaced by more than one capability
 * without being renamed to either. Tool-free installation facts, working guidance, and
 * system explanation belong to their own shelves. Selection is a
 * predicate over launch facts and controls knowledge only. Every installed Cowork tool is
 * callable by every Cowork Agent; feature and integration tools are projected only when
 * their document is selected. The birth lesson names only selected knowledge.
 */

export type CapabilityClass = 'cowork' | 'feature' | 'integration';

export interface CapabilityTool {
  /** The executable: the first word of the Tool cell. */
  name: string;
  /** The Tool cell as typed — the executable alone, or executable plus operation. */
  command: string;
  /** What the tool may do, in the document's words: read, write, create, end … */
  authority: string;
  /** Taught in the birth overview. */
  priority: boolean;
  /** The discovery route; `<name> --help` when the cell is blank. */
  help: string;
}

export interface CapabilityRow {
  name: string;
  origin: Origin;
  shadowed: boolean;
  file: string;
  label: string;
  blurb: string;
  class: CapabilityClass;
  /** The `## Tools` table, in document order. */
  tools: CapabilityTool[];
  /** Predicates that must all hold for the bundle to be selected; blank means every Cowork Agent. */
  requires: string[];
}

/**
 * THE LAUNCH FACTS a predicate may read. Every one is settled by the launch resolver
 * before the Agent process exists; none is a picker of its own.
 */
export interface CapabilityFacts {
  /** `managed` when the resolved assignment holds a desk or any work location is a managed worktree — not merely the birth root. */
  arrangement: 'managed' | 'checkout' | 'none';
  /** System installations that are on for this birth. */
  installations: ReadonlySet<string>;
  /** Behaviours selected and available for this birth. */
  behaviours: ReadonlySet<string>;
  /** Born into a Campaign, so Machine and Campaign settings are a surface this Agent has. */
  campaign: boolean;
  team: boolean;
  lead: boolean;
  /** Every predicate holds — for listings that show what a bundle would teach, never for a birth. */
  everything?: boolean;
}

export interface ResolvedCapability extends CapabilityRow {
  selected: boolean;
  /** Empty when selected; otherwise the first requirement that did not hold. */
  reason: string;
  /** Listed executables that exist on this box and are available to this Agent. */
  delivered: string[];
  /** Executables eligible for delivery but absent from this box; never taught. */
  missing: string[];
}

export const CAPABILITY_CLASSES: readonly CapabilityClass[] = ['cowork', 'feature', 'integration'];
export const REQUIREMENT_WORDS = ['installation', 'behaviour', 'arrangement', 'campaign', 'team', 'lead'] as const;

const cell = (text: string): string => text.trim().replace(/^`|`$/g, '').trim();
const blank = (value: string): boolean => !value || /^[–—-]$/.test(value.trim());

/**
 * THE TOOLS TABLE. The first Markdown table under a `## Tools` heading; columns are found
 * by header name (`Tool`, `Authority`, `Teach`, `Help`), so their order is the author's.
 * A document without the table — or with only `—` in it — lists no tool.
 */
export function parseToolsTable(text: string): CapabilityTool[] {
  const at = text.search(/^##\s+Tools\s*$/im);
  if (at === -1) return [];
  const lines = text.slice(at).split('\n').slice(1);
  const start = lines.findIndex((line) => /^\s*\|/.test(line));
  if (start === -1) return [];
  const rows: string[][] = [];
  for (const line of lines.slice(start)) {
    if (!/^\s*\|/.test(line)) break;
    rows.push(line.trim().replace(/^\||\|$/g, '').split('|').map(cell));
  }
  const [header, ...body] = rows;
  if (!header) return [];
  const column = (name: string): number => header.findIndex((head) => head.toLowerCase() === name);
  const tool = column('tool');
  const authority = column('authority');
  const teach = column('teach');
  const help = column('help');
  if (tool === -1) return [];
  return body
    .filter((row) => !row.every((value) => /^:?-+:?$/.test(value) || value === ''))
    .map((row) => {
      const command = row[tool] ?? '';
      const name = command.split(/\s+/)[0] ?? '';
      return {
        name,
        command,
        authority: authority === -1 ? '' : blank(row[authority] ?? '') ? '' : row[authority] ?? '',
        priority: teach !== -1 && /priority/i.test(row[teach] ?? ''),
        help: help === -1 || blank(row[help] ?? '') ? (name ? `${name} --help` : '') : row[help] ?? '',
      };
    })
    .filter((row) => row.name && !blank(row.name));
}

const capabilityRow = (d: Definition): CapabilityRow => {
  const klass = d.get('class').trim();
  return {
    name: d.name,
    origin: d.origin,
    shadowed: d.shadowed,
    file: d.file,
    label: d.get('label') || d.name,
    blurb: d.get('blurb'),
    class: (CAPABILITY_CLASSES as readonly string[]).includes(klass) ? klass as CapabilityClass : 'cowork',
    tools: parseToolsTable(d.text),
    requires: splitDefinitionList(d.get('requires')),
  };
};

export async function listCapabilities(): Promise<CapabilityRow[]> {
  return (await readDefinitions('capabilities')).map(capabilityRow);
}

/** One requirement against the facts: '' when it holds, else the reason it does not. */
export function checkRequirement(requirement: string, facts: CapabilityFacts): string {
  if (facts.everything) return '';
  const [word, value = ''] = requirement.split(':').map((part) => part.trim());
  switch (word) {
    case 'installation':
      return facts.installations.has(value) ? '' : `installation ${value} is off`;
    case 'behaviour':
      return facts.behaviours.has(value) ? '' : `behaviour ${value} is not selected`;
    case 'arrangement':
      if (value !== 'managed' && value !== 'checkout') return `unknown arrangement "${value}"`;
      return facts.arrangement === value ? '' : `no ${value} arrangement`;
    case 'campaign':
      return facts.campaign ? '' : 'no Campaign';
    case 'team':
      return facts.team ? '' : 'not on a Team';
    case 'lead':
      return facts.lead ? '' : 'not the Team lead';
    default:
      return `unknown requirement "${requirement}"`;
  }
}

export function selectionReason(row: Pick<CapabilityRow, 'requires'>, facts: CapabilityFacts): string {
  for (const requirement of row.requires) {
    const reason = checkRequirement(requirement, facts);
    if (reason) return reason;
  }
  return '';
}

const knowledgeOnlyRequirement = (requirement: string): boolean =>
  ['arrangement', 'campaign', 'team', 'lead'].includes(requirement.split(':', 1)[0]?.trim() ?? '');

/** Feature enablement may control delivery; role and work context only control teaching. */
export function availabilityReason(row: Pick<CapabilityRow, 'class' | 'requires'>, facts: CapabilityFacts): string {
  if (row.class === 'cowork') return '';
  return selectionReason({ requires: row.requires.filter((requirement) => !knowledgeOnlyRequirement(requirement)) }, facts);
}

/** Where a projected tool comes from: the owner's tools store first, then the shipped shelf. */
export async function toolPresent(name: string): Promise<boolean> {
  if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(name)) return false;
  for (const candidate of [path.join(storeDir('tools'), name), path.join(REPO_ROOT, 'ronin_bin', name)]) {
    try {
      await access(candidate);
      return true;
    } catch { /* not here */ }
  }
  return false;
}

export async function resolveCapabilities(
  facts: CapabilityFacts,
  options: { rows?: CapabilityRow[]; present?: (tool: string) => Promise<boolean> } = {},
): Promise<ResolvedCapability[]> {
  const rows = options.rows ?? await listCapabilities();
  const present = options.present ?? toolPresent;
  const out: ResolvedCapability[] = [];
  for (const row of rows) {
    const reason = selectionReason(row, facts);
    const delivered: string[] = [];
    const missing: string[] = [];
    // Role and work-context requirements choose teaching, never command availability.
    // Feature and integration enablement requirements still govern their delivery.
    if (!availabilityReason(row, facts)) {
      for (const name of [...new Set(row.tools.map((tool) => tool.name))]) (await present(name) ? delivered : missing).push(name);
    }
    out.push({ ...row, selected: !reason, reason, delivered, missing });
  }
  return out;
}

export const selectedCapabilities = (rows: readonly ResolvedCapability[]): ResolvedCapability[] =>
  rows.filter((row) => row.selected);

/** The tools a birth projects onto PATH: all Cowork tools and enabled feature tools, once. */
export const capabilityTools = (rows: readonly ResolvedCapability[]): string[] =>
  [...new Set(rows.flatMap((row) => row.delivered))];

export const CAPABILITIES_READING = 'CAPABILITIES.md';

const LESSON =
  'Built from this session’s capability documents. Each entry gives priority tools, help, and the full teaching.';

const code = (text: string): string => `\`${text}\``;

/**
 * THE VIRTUAL OVERVIEW — the one generated fragment of the packet. Derived from the selected
 * files and nothing else: title, opening summary, the priority tools that were projected
 * with their authority, the help routes, and the path of the full document (on the shelf
 * beside it). A bundle with no projected tool says so in one line; its document is the
 * teaching.
 */
export function renderCapabilitiesOverview(rows: readonly ResolvedCapability[]): string {
  const selected = selectedCapabilities(rows);
  const lines = ['# YOUR TOOLS — the capability bundles this session can use', '', LESSON, ''];
  if (!selected.length) {
    lines.push('No capability bundle was selected for this session.', '');
    return lines.join('\n');
  }
  for (const row of selected) {
    const projected = new Set(row.delivered);
    const taught = row.tools.filter((tool) => projected.has(tool.name));
    lines.push(`### ${row.label}`);
    if (row.blurb) lines.push(row.blurb);
    if (taught.length) {
      const priority = taught.filter((tool) => tool.priority);
      if (priority.length) {
        // The authority's first word only (read · write · create …): the clause after the
        // colon is the document's, and the packet has a one-read budget.
        lines.push(`- **Priority:** ${priority.map((tool) => code(tool.command) + (tool.authority ? ` (${tool.authority.split(':')[0].trim()})` : '')).join(' · ')}`);
      }
      const help = [...new Set(taught.map((tool) => tool.help).filter(Boolean))];
      lines.push(`- **Help:** ${help.map(code).join(' · ')}`);
    } else {
      lines.push('- **Tools:** none projected on this box yet — the document is the teaching.');
    }
    lines.push(`- **Full document:** ${code(row.file)}`, '');
  }
  return lines.join('\n');
}
