import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { listBehaviours, type BehaviourRow } from './resource-adapters.js';

export interface DeliveredBehaviour {
  book: string;
  file: string;
}

export interface ResolvedBehaviours {
  delivered: DeliveredBehaviour[];
  ignored: string[];
}

export async function resolveBehaviourBooks(input: readonly string[]): Promise<ResolvedBehaviours> {
  const ways = new Map((await listBehaviours())
    .filter((row) => row.scope === 'selected')
    .map((row) => [row.name, row]));
  const delivered: DeliveredBehaviour[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const book = String(raw).trim();
    if (!book || seen.has(book)) continue;
    seen.add(book);
    const name = book.replace(/^ways:/, '');
    // `mandates` was an elective behaviour before 2026-09-15. It is now part of
    // every Cowork Agent's base reading, so tolerate the old token without
    // delivering or reporting it as a selected behaviour.
    if (name === 'mandates') continue;
    const resolved = ways.get(name);
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name) || !resolved) {
      ignored.push(`behaviours[${book || String(raw)}]`);
      continue;
    }
    delivered.push({ book, file: resolved.page });
  }
  return { delivered, ignored: ignored.sort() };
}

/** Every resolved file on the floor is applied; there is no maintained name list. */
export async function resolveFloorBehaviours(): Promise<DeliveredBehaviour[]> {
  return (await listBehaviours())
    .filter((row) => row.scope === 'floor')
    .map((row) => ({ book: row.name, file: row.page }));
}

export interface BehaviourFacts {
  arrangement: 'managed' | 'checkout' | 'none';
  role?: 'coworker' | 'lead' | 'epic_lead' | 'coordinator';
  team: boolean;
  lead: boolean;
}

const conditionHolds = (requirement: string, facts: BehaviourFacts): boolean => {
  const [kind, value = ''] = requirement.split(':').map((part) => part.trim());
  if (kind === 'arrangement') return facts.arrangement === value;
  if (kind === 'role') return facts.role === value;
  if (kind === 'team') return facts.team;
  if (kind === 'lead') return facts.lead;
  return false;
};

/** Conditional candidates are applied only when every authored launch predicate holds. */
export async function resolveConditionalBehaviours(facts: BehaviourFacts): Promise<DeliveredBehaviour[]> {
  return (await listBehaviours())
    .filter((row: BehaviourRow) => row.scope === 'conditional' && row.requires.length > 0 && row.requires.every((requirement) => conditionHolds(requirement, facts)))
    .map((row) => ({ book: row.name, file: row.page }));
}

/** The resolved stock-or-owner page named by an acknowledgement outside birth. */
export async function conditionalBehaviourPath(name: string): Promise<string | undefined> {
  return (await listBehaviours()).find((row) => row.scope === 'conditional' && row.name === name)?.page;
}

/** Sought pages are indexed, never applied. The folder itself is the registry. */
export async function resolveSoughtBehaviours(): Promise<DeliveredBehaviour[]> {
  return (await listBehaviours())
    .filter((row) => row.scope === 'sought')
    .map((row) => ({ book: row.name, file: row.page }));
}

export const SOUGHT_READING = 'SOUGHT.md';

const soughtSummary = (text: string): string => {
  const paragraph = text.replace(/<!--[^]*?-->/g, '').split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part && !/^(#|>|\||[-*] |\d+\. |```)/.test(part)) ?? '';
  const first = paragraph.replace(/\s+/g, ' ').match(/^.*?[.!?](?=\s|$)/)?.[0] ?? paragraph.replace(/\s+/g, ' ');
  return first.length > 180 ? `${first.slice(0, 177).trimEnd()}…` : first;
};

/** Virtual awareness only: every sought file contributes a title, summary, and resolved path. */
export async function renderSoughtOverview(rows: readonly DeliveredBehaviour[]): Promise<string> {
  const lines = [
    '# SOUGHT — useful documents that exist but are not applied',
    '',
    'These are not instructions to follow now. Open one only when its subject arises.',
    '',
    '| Document | Reach for it when | Where |',
    '|---|---|---|',
  ];
  for (const row of rows) {
    const text = await readFile(row.file, 'utf8');
    const title = text.match(/^#{1,6}\s+(.+?)\s*$/m)?.[1]?.trim() || row.book;
    lines.push(`| ${title.replace(/\|/g, '\\|')} | ${soughtSummary(text).replace(/\|/g, '\\|')} | \`${path.resolve(row.file)}\` |`);
  }
  return `${lines.join('\n')}\n`;
}
