import { AGENTS } from './agents.js';

/**
 * Status probe (terminal view only): classify a session's state from its visible
 * pane text — the same patterns the status-probe action (ronin_catalogs/ACTIONS.md) reads
 * by eye. Never agent internals — pane text is the whole truth.
 *
 * The pattern list is THE extension point (same contract as ctx.ts): tried in
 * order, first match wins — so busy patterns come before pending-input patterns,
 * which come before ready patterns.
 */
export type SessionStatus = 'ready' | 'thinking' | 'awaiting-input';

/** A login shell's prompt row: `…$`, `…%`, `…#`, trailing space allowed. Ready for a
 *  terminal session, which is the only kind that has a shell in it now. */
const SHELL_PROMPT = /[$%#]\s*$/m;

/**
 * THE HOUSE ROWS — true of agents in general, belonging to no vendor in particular, so
 * they stay here rather than being copied into five table entries. They are also what
 * answers for an agent nobody has characterised yet: an empty `screen` in `AGENTS` means
 * "we have not read this one's screen", and these carry it, which is exactly the behaviour
 * that shipped before the table existed.
 */
const HOUSE: { status: SessionStatus; re: RegExp }[] = [
  // Busy: a spinner glyph opening a line ("✻ Cerebrating…").
  { status: 'thinking', re: /^\s*[✻✳✢✶✽·∗]\s+\S+…/m },
  // Pending question: an explicit ask or y/n.
  { status: 'awaiting-input', re: /\(y\/n\)|\[y\/n\]|do you want/i },
  // Ready: the boxed "│ > " prompt row some CLIs draw instead of ❯.
  { status: 'ready', re: /^\s*[│┃]\s*>\s/m },
];

/** One agent's declared rows, compiled. `cmd` is the join, because that is what a launch
 *  stamps and what `spawn.ts` computes — see `AGENTS[].screen` for why these are data. */
const vendorRows = (a: (typeof AGENTS)[number]): { status: SessionStatus; re: RegExp }[] => [
  ...a.screen.busy.map((re) => ({ status: 'thinking' as const, re: new RegExp(re, 'i') })),
  ...a.screen.asking.map((re) => ({ status: 'awaiting-input' as const, re: new RegExp(re) })),
  ...a.screen.ready.map((re) => ({ status: 'ready' as const, re: new RegExp(re, 'm') })),
];

/**
 * BY CATEGORY, NEVER BY SOURCE. Busy rows before dialog rows before ready rows, whoever
 * declared them — that ordering IS the contract, and it is what keeps a numbered `›`
 * dialog row from reading as Codex's prompt. Composing per source instead would let one
 * vendor's ready row outrank another's dialog row, which is the shape of the original bug.
 */
function compose(rows: { status: SessionStatus; re: RegExp }[]) {
  const of = (st: SessionStatus) => rows.filter((r) => r.status === st);
  return [...of('thinking'), ...of('awaiting-input'), ...of('ready')];
}

/**
 * Every row, every vendor — the generic list, unchanged in meaning from the hand-written
 * one it replaces. `classifyStatus` reads this, so the roster column and Koshi see exactly
 * what they always saw, including a shell prompt answering "ready" for a terminal session.
 */
export const STATUS_PATTERNS: { status: SessionStatus; re: RegExp }[] = [
  ...compose([...HOUSE, ...AGENTS.flatMap(vendorRows)]),
  // Ready: a plain shell prompt as the last thing on a line — an OpenShell tile waiting
  // for its owner. An agent tile has no shell in it to draw one (src/tmux.ts).
  { status: 'ready', re: SHELL_PROMPT },
];

/** Status cues live at the pane bottom — only the visible tail is worth scanning. */
const SCAN_LINES = 15;

/** Classify captured pane text (null = no recognizable cue, e.g. mid-output). */
export function classifyStatus(text: string): SessionStatus | null {
  const tail = text.replace(/\n+$/, '').split('\n').slice(-SCAN_LINES).join('\n');
  for (const p of STATUS_PATTERNS) if (p.re.test(tail)) return p.status;
  return null;
}
