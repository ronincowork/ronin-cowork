/**
 * THE BRIEF (docs/architecture/brief.md, The brief): one packet, generated top to bottom from the brief record
 * and the catalog files. Facts; the behaviours in play, each at its depth with its tools under
 * it; Other tools; the one `--help` line; the end line. Nothing else is in it.
 */
import { createHash } from 'node:crypto';
import { recordValue, type BriefRecord } from './brief-record.js';
import type { InPlay, Resolved } from './brief-settings.js';

import { packetEndLine as briefEndLine } from './birth-brief.js';
export const HELP_LINE = 'Every tool is a command on your PATH; `<tool> --help` gives its syntax.';

/**
 * A fact's `line:` with the record's values. `{a.b}` is the value; `{, a.b}` prints its lead
 * text only when the value is set; `{a.b?yes|no}` prints one text or the other. A segment
 * (the text between `, ` or ` · ` outside braces) whose values are all empty is dropped with
 * its separator: `User: {user.name}, {user.role}` with no name is `User: owner`. A line whose
 * values are all empty is not printed.
 */
export function fillLine(line: string, record: BriefRecord): string {
  const fill = (inner: string): { text: string; empty: boolean } => {
    const choice = /^([a-z_]+(?:\.[a-z_]+)*)\?([^|]*)\|?(.*)$/.exec(inner);
    if (choice) return { text: recordValue(record, choice[1]) ? choice[2] : choice[3], empty: false };
    const m = /^(.*?)([a-z_]+(?:\.[a-z_]+)*)$/s.exec(inner);
    if (!m) return { text: `{${inner}}`, empty: false };
    const value = recordValue(record, m[2]);
    return { text: value ? `${m[1]}${value}` : '', empty: !value };
  };
  // The label ("User: ") stays with the line, not with its first segment.
  const label = /^[^{:]*:\s+/.exec(line)?.[0] ?? '';
  const rest = line.slice(label.length);
  // Segments and their separators, split outside braces.
  const pieces: Array<{ sep: string; text: string }> = [];
  let sep = '', text = '', depth = 0;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    const two = rest.slice(i, i + 2), three = rest.slice(i, i + 3);
    if (!depth && (two === ', ' || three === ' · ')) {
      pieces.push({ sep, text });
      sep = two === ', ' ? two : three;
      text = '';
      i += sep.length - 1;
      continue;
    }
    text += ch;
  }
  pieces.push({ sep, text });
  let any = false, allEmpty = true;
  const kept: Array<{ sep: string; text: string }> = [];
  for (const piece of pieces) {
    let holders = 0, empties = 0;
    const filled = piece.text.replace(/\{([^{}]*)\}/g, (_all, inner: string) => {
      const out = fill(inner);
      holders++;
      if (out.empty) empties++;
      return out.text;
    });
    if (holders) any = true;
    if (holders && empties < holders) allEmpty = false;
    if (holders && empties === holders) continue;
    kept.push({ sep: piece.sep, text: filled });
  }
  if (any && allEmpty) return '';
  // An empty value leaves no gap: no doubled space, no separator straight after the label.
  const body = kept.map((piece, i) => (i ? piece.sep : '') + piece.text).join('').replace(/ {2,}/g, ' ').replace(/^\s*(?:, |· )/, '').trim();
  return `${label}${body}`.trim();
}

const strip = (text: string): string => text.replace(/<!--[^]*?-->/g, '').trim();
/** A file's own headings sit under the brief's `###`: each goes down two levels (at most six). */
const nested = (text: string): string => strip(text).replace(/^(#{1,6})(?=\s)/gm, (marks) => '#'.repeat(Math.min(6, marks.length + 2)));

function factLines(row: InPlay, record: BriefRecord): string[] {
  // A fact at seed is its line alone (an office fact's line and path); full adds its text.
  const raw = row.depth === 'seed' ? '' : strip(row.file.body);
  // A paragraph whose values all come out empty goes whole, its label line with it ("Folders:").
  const body = raw.split(/\n{2,}/).flatMap((paragraph) => {
    const lines = paragraph.split('\n');
    const held = lines.filter((line) => /\{[^{}]*\}/.test(line));
    const filled = lines.map((line) => /\{[^{}]*\}/.test(line) ? fillLine(line, record) : line);
    return held.length && held.every((line) => !fillLine(line, record)) ? [] : [filled.filter((line, i) => line || !/\{[^{}]*\}/.test(lines[i])).join('\n')];
  }).join('\n\n').trim();
  const hasBody = !!body && !!strip(body.replace(/^#+.*$/gm, ''));
  if (row.file.line) {
    const line = fillLine(row.file.line, record);
    if (!line) return [];
    return hasBody ? [`- ${line}`, '', body, ''] : [`- ${line}`];
  }
  return hasBody ? ['', `### ${row.title}`, body, ''] : [];
}

const toolLine = (row: InPlay): string => `- \`${row.title}\`${row.file.seed ? `: ${row.file.seed}` : ''}`;

function toolLines(row: InPlay): string[] {
  if (row.depth !== 'full') return [toolLine(row)];
  return [toolLine(row), '', nested(row.file.body), ''];
}

/** The seed of a behaviour: its one line, and where to read the rest. */
/** A behaviour at seed depth: its seed and its file name, which `ronin-help <name>` opens. */
const seedText = (row: InPlay): string => `${row.file.seed ? `${row.file.seed} ` : ''}(\`${row.name}\`)`;

/** Under ## Behaviours: how to read every behaviour in full, and all of Help (owner, 2026-11-15). */
export const READ_MORE_LINE = "Each in full: `ronin-help <name>`; all of Ronin's Help: `ronin-help`.";

/** A mandate: an order, one bullet; at full depth its text follows. */
function mandateLines(row: InPlay): string[] {
  const line = `- ${row.file.seed || row.title}`;
  return row.depth === 'full' && strip(row.file.body) ? [line, '', nested(row.file.body), ''] : [line];
}

export function renderBrief(name: string, record: BriefRecord, resolved: Resolved): string {
  const out: string[] = [`# Brief — ${name}`, ''];
  if (resolved.facts.length) {
    out.push('## Facts');
    for (const row of resolved.facts) out.push(...factLines(row, record));
    out.push('');
  }
  if (resolved.mandates.length) out.push('## Mandate', ...resolved.mandates.flatMap(mandateLines), '');
  if (resolved.behaviours.length) {
    out.push('## Behaviours', READ_MORE_LINE, '');
    for (const row of resolved.behaviours) {
      out.push(`### ${row.title}`, row.depth === 'full' ? nested(row.file.body) : seedText(row));
      if (row.tools.length) out.push('Tools:', ...row.tools.flatMap(toolLines));
      out.push('');
    }
  }
  if (resolved.other.length) out.push('## Other tools', ...resolved.other.flatMap(toolLines), '');
  out.push(HELP_LINE, '', briefEndLine(name), '');
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** What one brief tells: each fact, mandate, behaviour and tool in play, at its depth, with a hash
 * of the text it says (a wording difference between two builds is sent). */
interface Told { [name: string]: { kind: string; depth: string; title: string; text?: string } }

const toldRows = (r: Resolved): InPlay[] => [...r.facts, ...r.mandates, ...r.behaviours.flatMap((row) => [row, ...row.tools]), ...r.other];

/** What a behaviour, mandate or tool says in a brief at its depth: the lines an update sends. */
function saidLines(row: InPlay): string[] {
  if (row.kind === 'tools') return toolLines(row);
  if (row.file.mandate) return [...mandateLines(row), ''];
  return [`### ${row.title}`, row.depth === 'full' ? nested(row.file.body) : seedText(row), ''];
}

const textHash = (row: InPlay): string | undefined => row.kind === 'facts' ? undefined
  : createHash('sha256').update(saidLines(row).join('\n')).digest('hex').slice(0, 16);

const toldBy = (resolved: Resolved): Told =>
  Object.fromEntries(toldRows(resolved).map((row) => [row.name, { kind: row.kind, depth: row.depth, title: row.title, ...(row.kind === 'facts' ? {} : { text: textHash(row) }) }]));

/** One build: the record it was built over and what it put in play. */
export interface Build { doc: BriefRecord; resolved: Resolved }

/**
 * WHAT CHANGED between two builds (docs/architecture/brief.md, The brief): the facts whose line
 * reads differently, and the behaviours and tools that came into play (at their depth), whose
 * text changed, or that left it. '' when nothing did. Pure: both builds are in hand.
 */
export function briefChanges(before: Build, after: Build): string {
  const was = toldBy(before.resolved), now = toldBy(after.resolved);
  const lines: string[] = [];
  const fact = (row: InPlay, on: BriefRecord) => factLines(row, on).join('\n').trim();
  const facts = after.resolved.facts.filter((row) => fact(row, after.doc) && (!was[row.name] || fact(row, before.doc) !== fact(row, after.doc))).map((row) => fact(row, after.doc));
  if (facts.length) lines.push(...facts, '');
  for (const row of toldRows(after.resolved)) {
    if (row.kind === 'facts') continue;
    const prior = was[row.name];
    if (prior && prior.depth === row.depth && prior.text === textHash(row)) continue;
    lines.push(...saidLines(row));
  }
  const left = Object.keys(was).filter((name) => !now[name] && was[name].kind !== 'facts');
  if (left.length) lines.push(`No longer in your brief: ${left.map((name) => was[name].title).join(', ')}.`);
  return lines.join('\n').trim();
}
