import { AGENTS } from './agents.js';
import { capturePane } from './tmux.js';

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

/**
 * WHOSE PROMPT IS IT. Every row says which, and that one field is what lets two callers
 * ask two different questions of one list instead of bending one answer to serve both.
 *
 *   'agent'  the CLI itself is on screen and listening.
 *   'shell'  the login shell is on screen. For an OpenShell session that IS ready. For a
 *            session that was supposed to be running an agent it is the opposite of
 *            ready: the agent is GONE and this is what it died back to.
 */
type Whose = 'agent' | 'shell';

/** A login shell's prompt row: `…$`, `…%`, `…#`, trailing space allowed. One spelling,
 *  used by the pattern row below and by the last-line test in `agentPresence`. */
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
function compose(rows: { status: SessionStatus; re: RegExp }[], whose: Whose = 'agent') {
  const of = (st: SessionStatus) => rows.filter((r) => r.status === st).map((r) => ({ ...r, whose }));
  return [...of('thinking'), ...of('awaiting-input'), ...of('ready')];
}

/**
 * Every row, every vendor — the generic list, unchanged in meaning from the hand-written
 * one it replaces. `classifyStatus` reads this, so the roster column and Koshi see exactly
 * what they always saw, including a shell prompt answering "ready" for a terminal session.
 */
export const STATUS_PATTERNS: { status: SessionStatus; whose: Whose; re: RegExp }[] = [
  ...compose([...HOUSE, ...AGENTS.flatMap(vendorRows)]),
  // Ready: a plain shell prompt as the last thing on a line. RIGHT for a terminal
  // session and WRONG for an agent one, which is exactly why it carries `whose`.
  { status: 'ready', whose: 'shell', re: SHELL_PROMPT },
];

/**
 * The rows that speak for ONE agent: the house rows, plus its own.
 *
 * THE FALLBACK IS PER CATEGORY, NOT PER AGENT, and that distinction is load-bearing. An
 * agent that has said nothing about a category gets EVERY agent's rows for it — the
 * pre-table behaviour — because narrowing to an empty set would mean a session that never
 * reads as ready and a brief that is never delivered.
 *
 * Per-AGENT was the first cut and it was a trap: gemini's dialog row was measured and
 * added, which flipped gemini from "says nothing, use everyone's rows" to "characterised,
 * use only its own" — and it has no ready row, because nobody has ever seen past its trust
 * dialog. One honest measurement would have silently stopped its briefs. The test caught
 * it; this shape is why it stays caught. Knowing one screen of an agent must never cost
 * you the screens you had.
 */
function rowsFor(agent: string): { status: SessionStatus; whose: Whose; re: RegExp }[] {
  const a = AGENTS.find((x) => x.cmd === agent);
  const own = a ? a.screen : null;
  const everyone = AGENTS.flatMap(vendorRows);
  const pick = (st: SessionStatus, declared: readonly string[] | undefined) =>
    declared?.length ? vendorRows(a!).filter((r) => r.status === st) : everyone.filter((r) => r.status === st);
  return compose([
    ...HOUSE,
    ...pick('thinking', own?.busy),
    ...pick('awaiting-input', own?.asking),
    ...pick('ready', own?.ready),
  ]);
}

/** Status cues live at the pane bottom — only the visible tail is worth scanning. */
const SCAN_LINES = 15;

/** Classify captured pane text (null = no recognizable cue, e.g. mid-output). */
export function classifyStatus(text: string): SessionStatus | null {
  const tail = text.replace(/\n+$/, '').split('\n').slice(-SCAN_LINES).join('\n');
  for (const p of STATUS_PATTERNS) if (p.re.test(tail)) return p.status;
  return null;
}

/**
 * THE SECOND QUESTION — and it is a different one, which is the whole point.
 *
 * `classifyStatus` answers *what is this pane doing?* for the roster column and for Koshi,
 * where a session sitting at a shell prompt is genuinely ready and must keep saying so.
 *
 * This answers *is THE AGENT listening?* for the one caller that is about to type at it.
 * A shell prompt is a perfectly good answer to the first question and is the definitive NO
 * to this one: it means the agent is gone and what is left is the shell it died back to.
 *
 * The whole defect this exists to end was one question standing in for the other. A seat
 * launched into a directory codex had never seen; codex raised its trust dialog (correctly
 * classified — the machinery was working); codex then DIED on `timed out discarding buffered
 * terminal input`; bash came back; the shell-prompt row matched `ready`; and the brief was
 * typed into the shell. The session looked completely alive and had been told nothing.
 * Measured 2026-08-20 in the guarded end-to-end walk of the setup process.
 */
export type AgentPresence = 'ready' | 'busy' | 'asking' | 'gone';

export function agentPresence(text: string, agent = ''): AgentPresence | null {
  const lines = text.replace(/\n+$/, '').split('\n').slice(-SCAN_LINES);
  // RECENCY BEATS PATTERN ORDER, and only for this question. What the shell is showing
  // NOW is the last non-empty line; everything above it is history that has already
  // happened. A dead agent leaves its last screen intact and drops a prompt underneath —
  // so the trust dialog codex died on is still sitting there, and a first-match-wins scan
  // over the whole tail answers `asking` about a dialog nothing is listening to any more.
  // This was not reasoned out in advance; the test built from the measured transcript
  // failed on exactly it.
  const last = [...lines].reverse().find((l) => l.trim() !== '') ?? '';
  if (SHELL_PROMPT.test(last)) return 'gone';
  // Otherwise the ordinary reading, over the AGENT's rows alone: the shell row can never
  // answer this question, which is the whole reason `whose` exists.
  const tail = lines.join('\n');
  // THIS agent's rows when it is named and characterised, every agent's otherwise. Naming
  // it is what stops one vendor's prompt glyph answering for another's session.
  for (const p of rowsFor(agent)) {
    if (p.whose !== 'agent' || !p.re.test(tail)) continue;
    // Order is the contract, here as in classifyStatus: busy rows sit before dialog rows,
    // which sit before ready rows, so the first match is the truest thing on screen.
    if (p.status === 'thinking') return 'busy';
    if (p.status === 'awaiting-input') return 'asking';
    return 'ready';
  }
  return null;
}

/** The one live-capture probe, asked the second question. Null on capture failure —
 *  e.g. it just died. (Its first-question twin, probeStatus, died 2026-08-20: PR #18
 *  left it with no caller, and check-dead said so on the release push.) */
async function probeAgent(session: string, agent: string): Promise<AgentPresence | null> {
  try {
    return agentPresence(await capturePane(session, 0), agent);
  } catch {
    return null;
  }
}


/**
 * Wait for a CLI that is about to be handed its first message — and WAIT LONGER WHEN A
 * PERSON IS THE THING BEING WAITED FOR.
 *
 * A freshly-launched CLI in an unfamiliar directory opens a dialog: *do you trust this
 * folder?* It will sit there forever, because it is waiting for a human. Two states that
 * look the same to a stopwatch, and want opposite patience:
 *
 *   - not ready, nothing asked   a slow start. Give it ~90s, then something is wrong.
 *   - not ready, DIALOG open     a person has to answer. Waiting is the correct
 *                                behaviour, and it is not a fault at any duration.
 *
 * So the deadline is chosen by WHAT is blocking, not by how long it has taken. Once a
 * dialog has been seen the window opens to a quarter of an hour, because "launch a
 * session, get distracted, come back and answer it" is completely ordinary — and under
 * the old flat 90s the brief was silently dropped in exactly that case, leaving a session
 * that looked alive and had been told nothing.
 *
 * `held` reports whether a dialog was ever seen, so the caller can say so rather than
 * leaving the delay unexplained.
 *
 * A THIRD STATE, AND IT IS NOT A TIMEOUT: `gone`. The agent was launched and is no longer
 * there — a shell prompt is showing where a CLI should be. That is not slowness and waiting
 * longer cannot fix it, so it returns AT ONCE rather than burning the window, and it is
 * reported separately because "it never came up" and "it came up and died" want different
 * words in front of a person.
 */
export async function waitReadyForBrief(
  session: string,
  agent: string,
  { quietMs = 90000, heldMs = 900000 } = {},
): Promise<{ ready: boolean; held: boolean; gone: boolean }> {
  const start = Date.now();
  let held = false;
  for (;;) {
    const seen = await probeAgent(session, agent);
    if (seen === 'ready') return { ready: true, held, gone: false };
    // THE AGENT IS NOT THERE. Give up immediately: every extra second is spent watching a
    // shell prompt that will never turn into a CLI, and the old code read this as ready.
    if (seen === 'gone') return { ready: false, held, gone: true };
    // A dialog is on screen. Note it once; from here the long window applies.
    if (seen === 'asking') held = true;
    if (Date.now() - start > (held ? heldMs : quietMs)) return { ready: false, held, gone: false };
    // Deliberately unhurried: this one may run for a quarter of an hour,
    // and nobody is watching the first second of it.
    await new Promise((r) => setTimeout(r, 500));
  }
}
