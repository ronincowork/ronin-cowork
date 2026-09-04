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
