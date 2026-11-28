import { AGENTS } from './agents.js';
import type { Question } from './asking.js';

export type SessionStatus = 'ready' | 'thinking' | 'awaiting-input';

const SHELL_PROMPT = /[$%#]\s*$/m;

const HOUSE: { status: SessionStatus; re: RegExp }[] = [
  { status: 'thinking', re: /^\s*[✻✳✢✶✽·∗]\s+\S+…/m },
  // Not "do you want": an Agent's own reply says it, and an idle Agent showed as asking (owner,
  // 2026-11-03). A CLI's real prompt is its numbered choices (the vendors' rows below) or its
  // dialog footer.
  // A CLI's dialog footer: Claude's trust prompt has no numbered choices (KAN-215).
  { status: 'awaiting-input', re: /\(y\/n\)|\[y\/n\]|Esc to cancel/i },
  { status: 'ready', re: /^\s*[│┃]\s*>\s/m },
];

const vendorRows = (a: (typeof AGENTS)[number]): { status: SessionStatus; re: RegExp }[] => [
  ...a.screen.busy.map((re) => ({ status: 'thinking' as const, re: new RegExp(re, 'i') })),
  ...a.screen.asking.map((re) => ({ status: 'awaiting-input' as const, re: new RegExp(re) })),
  ...a.screen.ready.map((re) => ({ status: 'ready' as const, re: new RegExp(re, 'm') })),
];

function compose(rows: { status: SessionStatus; re: RegExp }[]) {
  const of = (st: SessionStatus) => rows.filter((r) => r.status === st);
  return [...of('thinking'), ...of('awaiting-input'), ...of('ready')];
}

export const STATUS_PATTERNS: { status: SessionStatus; re: RegExp }[] = [
  ...compose([...HOUSE, ...AGENTS.flatMap(vendorRows)]),
  { status: 'ready', re: SHELL_PROMPT },
];

const SCAN_LINES = 15;

export function classifyStatus(text: string): SessionStatus | null {
  const tail = text.replace(/\n+$/, '').split('\n').slice(-SCAN_LINES).join('\n');
  for (const p of STATUS_PATTERNS) if (p.re.test(tail)) return p.status;
  return null;
}

/**
 * IS IT STOPPED AT A QUESTION? The one thing still read off the screen.
 *
 * What an Agent is doing now comes from its journal — a tool call is a record, a finished
 * reply is a record. A dialog is not: a permission prompt is a thing drawn on a pane and no
 * CLI writes a line for it, so there is nothing to read but the pane. It is also the most
 * actionable state on the board, which is why it stayed when the spinner matching went.
 *
 * Core's home row reads it on each pane output (src/routes/launch.ts, KAN-527): the stance
 * asking and an Agent flag on the work record, for every provider.
 *
 * Only the `asking` patterns are consulted — the vendors' own, plus the house y/n. The
 * spinner glyphs and prompt shapes are still in the table above for Mika's one-shot
 * readiness read, which asks a different question: is this newly launched CLI up yet.
 */
export function asksForInput(text: string): boolean {
  const tail = text.replace(/\n+$/, '').split('\n').slice(-SCAN_LINES).join('\n');
  return STATUS_PATTERNS.some((p) => p.status === 'awaiting-input' && p.re.test(tail));
}

/**
 * A consent screen drawn before a CLI's hooks start. Claude's bypass-permissions warning is
 * one such screen: the pane is the only source for both what the person is accepting and the
 * choices. Keep this deliberately narrow; ordinary questions come from the CLI's hooks.
 */
export function screenConsentQuestion(text: string): Question | undefined {
  const lines = text.replace(/\x1b\[[0-9;]*m/g, '').replace(/ /g, ' ').split('\n');
  const label = (line: string) => line
    .replace(/^\s*[❯›>]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/^\s*[│┃]\s?/, '')
    .trim();
  const no = lines.findIndex((line) => /^No,\s*exit\b/i.test(label(line)));
  const yes = lines.findIndex((line) => /^Yes,\s*I accept\b/i.test(label(line)));
  if (no < 0 || yes < 0) return undefined;

  const firstChoice = Math.min(no, yes);
  let warning = lines.slice(0, firstChoice).findIndex((line) => /WARNING:\s*Claude Code running in Bypass Permissions mode/i.test(line));
  if (warning < 0) warning = Math.max(0, firstChoice - 8);
  const context = lines.slice(warning, firstChoice)
    .map((line) => line.replace(/^\s*[│┃]\s?/, '').trimEnd())
    .filter((line, index, all) => line.trim() || (index > 0 && index < all.length - 1));
  const question = context.join('\n').trim().replace(/(?<![<(])https?:\/\/[^\s)>]+/g, (url) => `<${url}>`);
  if (!question) return undefined;
  const options = [no, yes].sort((a, b) => a - b).map((at) => ({ label: label(lines[at]), description: '' }));
  return { kind: 'choice', questions: [{ question, header: '', options, many: false, freeText: false }] };
}
