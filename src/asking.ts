/**
 * WHAT THE AGENT IS DOING, from the CLI's own hooks (KAN-616, KAN-656..658).
 *
 * Claude Code and Codex run `ronin-asking` on their hook events (src/launch-ahead.ts wires them,
 * docs/agents/claude.md, codex.md); it posts the whole event here, capped. Each event sets the
 * Agent's HOOK RECORD: its stance (working, asking, awaiting_you, interrupted, error), when, the
 * tool it is in, and the question it is stopped at. The record is one input to the card's status,
 * the log's newest line the other (`cardFields` decides, KAN-664); the card is what everything
 * reads. It is kept beside the Agent's folder, so a server restart keeps it.
 *
 * A question rides the card as `question` and goes when the CLI moves on. Chat answers it by
 * typing the option the way the CLI's own prompt takes it (`answerKeys`); Ronin then records the
 * answer itself, since a prompt cancelled with Escape fires no hook.
 */
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sessionDir, sessionKey } from './session-dir.js';
import { collectRowFields } from './sockets.js';
import type { RowFields } from './sockets-contract.js';

/** `stopped`: the CLI's pane died (src/pane-death.ts), written for any CLI, hooks or none. */
export type HookStance = 'working' | 'asking' | 'awaiting_you' | 'interrupted' | 'error' | 'stopped';
export const HOOK_STANCES: readonly HookStance[] = ['working', 'asking', 'awaiting_you', 'interrupted', 'error', 'stopped'];

interface Choice { question: string; header: string; options: { label: string; description: string }[]; many: boolean; freeText?: boolean }
/** choice: Claude's AskUserQuestion, Codex's request_user_input. plan: Claude's ExitPlanMode, Codex's
 * proposed plan. permission: a tool waiting to be allowed. form: an MCP server's question (free text). */
export type Question =
  | { kind: 'choice'; questions: Choice[] }
  | { kind: 'plan'; plan: string }
  | { kind: 'permission'; tool: string; detail: string; reason: string }
  | { kind: 'form'; message: string };
export interface HookRecord { stance: HookStance; at: string; tool?: { name: string; target: string }; question?: Question; exit?: number }
export type HookEvent = Record<string, unknown>;

const QUESTION_TOOLS = new Set(['AskUserQuestion', 'request_user_input']);
// Claude's Notification types that mean the person is wanted; idle_prompt is a finished turn.
const ASKING_NOTICES = new Set(['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']);
const TARGET_KEYS = ['command', 'cmd', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt'];
const LONG = 20_000; // a plan or a command shown in Chat, at most

const str = (v: unknown, cap = LONG): string => (typeof v === 'string' ? v.slice(0, cap) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** The tool's target, its first line: name and target only, since input can hold secrets. */
function target(input: unknown): string {
  const o = obj(input);
  const key = TARGET_KEYS.find((k) => typeof o[k] === 'string' && o[k]);
  const line = (key ? String(o[key]) : '').trim().split('\n', 1)[0] ?? '';
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}

function choiceOf(input: unknown): Question | undefined {
  const questions = (Array.isArray(obj(input).questions) ? obj(input).questions as unknown[] : []).map((q) => ({
    question: str(obj(q).question, 2000),
    header: str(obj(q).header, 200),
    options: (Array.isArray(obj(q).options) ? obj(q).options as unknown[] : []).slice(0, 9)
      .map((o) => ({ label: str(obj(o).label, 200), description: str(obj(o).description, 1000) })),
    many: obj(q).multiSelect === true,
    // Both CLIs add one final free-text answer to every choice question. It is not in tool_input,
    // so carry that UI fact explicitly to Chat instead of silently losing the last option.
    freeText: true,
  })).filter((q) => q.options.length);
  return questions.length ? { kind: 'choice', questions } : undefined;
}

/** The question a tool call is, if it is one. */
function questionOf(tool: string, input: unknown): Question | undefined {
  if (QUESTION_TOOLS.has(tool)) return choiceOf(input);
  if (tool === 'ExitPlanMode') return { kind: 'plan', plan: str(obj(input).plan) };
  return undefined;
}

/** Codex says nothing but Stop when it proposes a plan: the turn's last message holds it. */
async function codexPlan(transcript: string): Promise<Question | undefined> {
  if (!transcript) return undefined;
  const file = await open(transcript, 'r').catch(() => null);
  if (!file) return undefined;
  let text = '';
  try {
    const { size } = await file.stat();
    const length = Math.min(size, 200_000);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, size - length);
    text = buffer.toString('utf8');
  } finally { await file.close(); }
  for (const line of text.split('\n').reverse()) {
    if (!line.includes('"role":"assistant"')) continue;
    let said = '';
    try {
      const item = obj(obj(JSON.parse(line)).payload);
      said = (Array.isArray(item.content) ? item.content : []).map((c) => str(obj(c).text)).join('');
    } catch { continue; }
    const plan = said.match(/<proposed_plan>\n?([\s\S]*?)\n?<\/proposed_plan>/)?.[1];
    return plan ? { kind: 'plan', plan: plan.slice(0, LONG) } : undefined;
  }
  return undefined;
}

/** The record an event leaves, from the one before it; null leaves it as it was. */
export async function hookRecordOf(event: HookEvent, was: HookRecord | undefined, at = new Date().toISOString()): Promise<HookRecord | null> {
  const name = str(event.hook_event_name);
  const tool = str(event.tool_name);
  const working = (more: Partial<HookRecord> = {}): HookRecord => ({ stance: 'working', at, ...more });
  switch (name) {
    case 'SessionStart': return { stance: 'awaiting_you', at };
    case 'UserPromptSubmit': return working();
    case 'PreToolUse': {
      const question = questionOf(tool, event.tool_input);
      return question ? { stance: 'asking', at, question } : working({ tool: { name: tool, target: target(event.tool_input) } });
    }
    case 'PermissionRequest': {
      // Claude asks leave for its own question and plan tools too: the question PreToolUse raised.
      const question = questionOf(tool, event.tool_input) ?? {
        kind: 'permission', tool, detail: str(obj(event.tool_input).command) || target(event.tool_input),
        reason: str(obj(event.tool_input).description, 1000),
      };
      return { stance: 'asking', at, question };
    }
    case 'Notification':
      if (!ASKING_NOTICES.has(str(event.notification_type))) return null;
      return { stance: 'asking', at, ...(was?.question ? { question: was.question } : {}) };
    case 'Elicitation': return { stance: 'asking', at, question: { kind: 'form', message: str(event.message, 2000) } };
    case 'PostToolUseFailure': return obj(event).is_interrupt === true ? { stance: 'interrupted', at } : working();
    case 'PostToolUse':
    case 'PermissionDenied':
    case 'ElicitationResult': return working();
    case 'Stop': {
      // Only Codex's events carry turn_id; Claude's plan came on ExitPlanMode.
      const plan = 'turn_id' in event ? await codexPlan(str(event.transcript_path, 4096)) : undefined;
      return plan ? { stance: 'asking', at, question: plan } : { stance: 'awaiting_you', at };
    }
    case 'StopFailure': return { stance: 'error', at };
    case 'Interrupt': return { stance: 'interrupted', at };
    default: return null;
  }
}

/** An event the relay cut short is not JSON: its top-level names still say what it was. */
export function parseHookEvent(text: string): HookEvent {
  try { return obj(JSON.parse(text)); } catch {
    const field = (key: string) => text.match(new RegExp(`"${key}"\\s*:\\s*"([A-Za-z_]*)"`))?.[1];
    return Object.fromEntries(['hook_event_name', 'tool_name', 'notification_type'].flatMap((k) => (field(k) ? [[k, field(k)]] : [])));
  }
}

const FILE = 'hook.json';
const records = new Map<string, HookRecord | null>();
const fileOf = async (session: string) => path.join(sessionDir(await sessionKey(session)), FILE);

/** The Agent's hook record, or null for a CLI that has sent none (one without hooks). */
export async function hookRecord(session: string): Promise<HookRecord | null> {
  if (!records.has(session)) {
    const text = await readFile(await fileOf(session), 'utf8').catch(() => '');
    let held: HookRecord | null = null;
    try { held = text ? JSON.parse(text) as HookRecord : null; } catch { /* rewritten on the next event */ }
    records.set(session, held);
  }
  return records.get(session) ?? null;
}

/** Keep a record. Its `at` moves on every event, which is what the no-progress flag reads. */
export async function keepHookRecord(session: string, next: HookRecord): Promise<void> {
  records.set(session, next);
  const file = await fileOf(session);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.ronin`, JSON.stringify(next));
  await rename(`${file}.ronin`, file);
}

/** Record one hook event; says whether it left a record (the card moved). */
export async function recordHook(session: string, event: HookEvent): Promise<boolean> {
  const next = await hookRecordOf(event, await hookRecord(session) ?? undefined);
  if (next) await keepHookRecord(session, next);
  return !!next;
}
export const forgetHooks = (session: string): void => void records.delete(session);
/** A resumed Agent starts with no record: its hooks write the next, or its log speaks. */
export async function clearHookRecord(session: string): Promise<void> {
  records.delete(session);
  await rm(await fileOf(session), { force: true });
}

/**
 * THE CARD'S STATUS (KAN-664): the one place an Agent's status is decided; everything else reads
 * the card. Its inputs are the hook record and the log's newest status line (the parts' `stance`
 * and `at`, rireki/stance.ts). A dead pane is over everything. Otherwise the newer input says the
 * turn state, so a hook lost in a restart, or a turn no hook closed (Esc), is put right by the
 * log. The question is the hook's alone: it stays while the hook is newer or the log still asks.
 * An Agent with one input has that one.
 */
export function cardFields(row: RowFields, held: HookRecord | null): RowFields & { hooked: boolean } {
  if (!held) return { ...row, hooked: false };
  const hooked: RowFields & { hooked: boolean } = { ...row, stance_reports: HOOK_STANCES, hooked: true };
  const logAt = typeof row.at === 'string' ? Date.parse(row.at) : NaN;
  if (held.stance === 'stopped' || !(logAt > Date.parse(held.at))) {
    const { tool: _logTool, ...rest } = hooked;
    return { ...rest, hooked: true, ...held };
  }
  return { ...hooked, ...(row.stance === 'asking' && held.question ? { question: held.question } : {}) };
}

export async function readFields(session: string): Promise<RowFields & { stance?: unknown; at?: unknown; question?: Question; hooked: boolean }> {
  const [row, held] = await Promise.all([collectRowFields(session), hookRecord(session)]);
  return cardFields(row, held);
}

/**
 * AN ANSWER FROM CHAT, as keys the CLI's own prompt takes (tried on Claude Code 2.1.327 and
 * Codex 0.169, docs/agents/claude.md, codex.md). A choice is its option's number, each question
 * in turn; Claude's checkboxes are their numbers then Tab, and Claude closes a question with
 * several parts, or checkboxes, on a review whose first option submits. A plan and a permission
 * take yes or no. Returns null for a question Chat cannot answer (a form: free text).
 */
type ChoiceAnswer = number | number[] | { text: string; choices?: number[] };
export type Answer = { choices: ChoiceAnswer[] } | { yes: boolean };
export type AnswerKey = string | { text: string };
const YES_NO: Record<string, { plan: [string, string]; permission: [string, string] }> = {
  claude: { plan: ['1', 'Escape'], permission: ['1', 'Escape'] },
  codex: { plan: ['1', '3'], permission: ['y', 'Escape'] },
};
export function answerKeys(cli: string, question: Question, answer: Answer): AnswerKey[] | null {
  const keys = YES_NO[cli];
  if (!keys) return null;
  if (question.kind === 'plan' || question.kind === 'permission') {
    if (!('yes' in answer)) return null;
    return [keys[question.kind][answer.yes ? 0 : 1]];
  }
  if (question.kind !== 'choice' || !('choices' in answer) || answer.choices.length !== question.questions.length) return null;
  const out: AnswerKey[] = [];
  for (const [i, q] of question.questions.entries()) {
    const choice = answer.choices[i];
    if (choice && typeof choice === 'object' && !Array.isArray(choice) && 'text' in choice) {
      const text = choice.text.trim().replace(/[\r\n]+/g, ' ').slice(0, 4000);
      const picked = choice.choices ?? [];
      if (!text || picked.some((n) => !Number.isInteger(n) || n < 0 || n >= q.options.length) || (!q.many && picked.length)) return null;
      // The implicit final row opens the CLI's text field; literal text and Enter submit it.
      out.push(...picked.map((n) => String(n + 1)), String(q.options.length + 1), { text }, 'Enter');
      if (q.many) out.push('Tab');
      continue;
    }
    const picked = ([] as number[]).concat(choice as number | number[]);
    if ((!q.many && !picked.length) || picked.some((n) => !Number.isInteger(n) || n < 0 || n >= q.options.length)) return null;
    if (!q.many && picked.length > 1) return null;
    out.push(...picked.map((n) => String(n + 1)));
    if (q.many) out.push('Tab');
  }
  if (cli === 'claude' && (question.questions.length > 1 || question.questions.some((q) => q.many))) out.push('1');
  return out;
}
/** What the record says once Ronin typed the answer: at work again, or, declined, your move. */
export const answered = (answer: Answer): HookRecord => ({
  stance: 'yes' in answer && !answer.yes ? 'awaiting_you' : 'working', at: new Date().toISOString(),
});

/**
 * NO PROGRESS (owner, 2026-11-16, KAN-618): an Agent that reads working while its conversation's
 * newest record is 12 minutes old is flagged, as a question is. `at` is that record's time, which
 * the home row already has; new activity moves it and the flag goes. One timer per Agent, set
 * for the moment `at` turns 12 minutes old: it reads nothing, it only asks for the row again.
 */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
export const NO_PROGRESS_MS = 12 * 60 * 1000;
export function createNoProgress(due: (session: string) => void, now: () => number = Date.now,
  schedule: (fire: () => void, ms: number) => unknown = (fire, ms) => setTimeout(fire, ms).unref()) {
  const armed = new Map<string, { at: string; timer: unknown }>();
  const disarm = (session: string) => {
    const was = armed.get(session);
    if (was) clearTimeout(was.timer as ReturnType<typeof setTimeout>);
    armed.delete(session);
  };
  return {
    /** Is this row's Agent stuck? Arms or moves its one timer as a side effect. */
    check(session: string, stance: unknown, at: unknown): boolean {
      // A record's time is ISO (every rireki reader writes it so); Date.parse alone would read
      // any string, 'line-1' as 2001.
      const since = typeof at === 'string' && ISO_TIME.test(at) ? Date.parse(at) : NaN;
      if (stance !== 'working' || !Number.isFinite(since)) { disarm(session); return false; }
      const left = since + NO_PROGRESS_MS - now();
      if (left <= 0) { disarm(session); return true; }
      if (armed.get(session)?.at !== at) {
        disarm(session);
        armed.set(session, { at: at as string, timer: schedule(() => { armed.delete(session); due(session); }, left) });
      }
      return false;
    },
    forget: disarm,
  };
}
