/**
 * NOTIFY ME (owner, 2026-11-22, KAN-772): `notify_me <agent>` leaves a one-time mark on that
 * Agent: `notify_me.json` in its session folder, each caller with when it marked. When the
 * Agent's merged stance (cardFields, src/asking.ts) next reads a turn's end after the mark,
 * the one that turns the selector pill's dot hollow, each caller is sent one line through the
 * message queue, as `edges send` is, and its mark goes. The check rides rowChanged, which every
 * hook event and every log line already fires, so a CLI without hooks is heard by its log;
 * nothing polls. The mark is in the folder, so Delete takes it with the Agent.
 */
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readFields } from './asking.js';
import { enqueueMessage } from './message-queue.js';
import { sessionDir, sessionKey } from './session-dir.js';

export const MARK_FILE = 'notify_me.json';
/** The stances that end a turn, in the words the line says them. */
const ENDS: Record<string, string> = { awaiting_you: 'waiting for you', asking: 'asking a question', error: 'a tool failed' };
type Marks = Record<string, string>;

const markFile = async (agent: string) => path.join(sessionDir(await sessionKey(agent)), MARK_FILE);
const readMarks = async (file: string): Promise<Marks> => {
  try { return JSON.parse(await readFile(file, 'utf8')) as Marks; } catch { return {}; }
};
async function keepMarks(file: string, marks: Marks): Promise<void> {
  if (!Object.keys(marks).length) { await rm(file, { force: true }); return; }
  await writeFile(`${file}.ronin`, JSON.stringify(marks));
  await rename(`${file}.ronin`, file);
}

/** The line a caller is sent. */
export const turnEndLine = (agent: string, stance: string): string => `${agent} finished its turn: ${ENDS[stance]}`;

/** The callers a stance tells: a turn's end newer than their mark. */
export function due(marks: Marks, stance: unknown, at: unknown): string[] {
  if (typeof stance !== 'string' || !(stance in ENDS)) return [];
  const ended = typeof at === 'string' ? Date.parse(at) : NaN;
  return Object.entries(marks).filter(([, marked]) => ended > Date.parse(marked)).map(([caller]) => caller);
}

// One check at a time per Agent, so a burst of row changes sends the line once.
const checks = new Map<string, Promise<void>>();
const run = (agent: string, step: () => Promise<void>): Promise<void> => {
  const next = (checks.get(agent) ?? Promise.resolve()).then(step).catch((e) => console.error('[notify_me]', e));
  checks.set(agent, next);
  return next;
};

/** Mark `agent` for `caller`; marking again moves the mark on. */
export function markTurnEnd(agent: string, caller: string): Promise<void> {
  return run(agent, async () => {
    const file = await markFile(agent);
    await keepMarks(file, { ...await readMarks(file), [caller]: new Date().toISOString() });
  });
}

/** An Agent's row moved: tell whoever its turn's end is due to. */
export function checkTurnEnd(agent: string): Promise<void> {
  return run(agent, async () => {
    const file = await markFile(agent);
    const marks = await readMarks(file);
    if (!Object.keys(marks).length) return;
    const { stance, at } = await readFields(agent);
    const told = due(marks, stance, at);
    if (!told.length) return;
    for (const caller of told) delete marks[caller];
    await keepMarks(file, marks);
    for (const caller of told) await enqueueMessage(caller, turnEndLine(agent, stance as string), 'house');
  });
}
