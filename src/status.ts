import { AGENTS } from './agents.js';

export type SessionStatus = 'ready' | 'thinking' | 'awaiting-input';

const SHELL_PROMPT = /[$%#]\s*$/m;

const HOUSE: { status: SessionStatus; re: RegExp }[] = [
  { status: 'thinking', re: /^\s*[✻✳✢✶✽·∗]\s+\S+…/m },
  { status: 'awaiting-input', re: /\(y\/n\)|\[y\/n\]|do you want/i },
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
 * Only the `asking` patterns are consulted — the vendors' own, plus the house y/n. The
 * spinner glyphs and prompt shapes are still in the table above for Mika's one-shot
 * readiness read, which asks a different question: is this newly launched CLI up yet.
 */
export function asksForInput(text: string): boolean {
  const tail = text.replace(/\n+$/, '').split('\n').slice(-SCAN_LINES).join('\n');
  return STATUS_PATTERNS.some((p) => p.status === 'awaiting-input' && p.re.test(tail));
}

export function createActivityCache<T>(load: (session: string) => Promise<T>) {
  const settled = new Map<string, { activity: number; value: T }>();
  const pending = new Map<string, { activity: number; value: Promise<T> }>();

  return async (session: string, activity: number): Promise<T> => {
    const previous = settled.get(session);
    if (previous?.activity === activity) return previous.value;

    const underway = pending.get(session);
    if (underway?.activity === activity) return underway.value;

    const value = load(session).then((result) => {
      settled.set(session, { activity, value: result });
      return result;
    }).catch((error) => {
      if (previous) return previous.value;
      throw error;
    }).finally(() => {
      if (pending.get(session)?.activity === activity) pending.delete(session);
    });
    pending.set(session, { activity, value });
    return value;
  };
}
